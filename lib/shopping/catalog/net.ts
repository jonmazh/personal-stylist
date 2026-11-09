import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { FETCH_LIMITS, ROBOTS_AGENT, USER_AGENT } from './taxonomy'

/**
 * Red segura para la importación por URL y los feeds: solo http(s), puertos 80/443, nunca direcciones internas (SSRF),
 * redirecciones revalidadas, tiempo y tamaño limitados. SHOPPING_FETCH_ALLOW_HOSTS («host:puerto,...») permite hosts
 * locales SOLO para las pruebas automáticas.
 */
export class FetchBlocked extends Error { constructor(message: string, public code: 'invalid' | 'private' | 'robots' | 'policy' | 'http' | 'size' | 'timeout' | 'type') { super(message) } }

const allowHosts = () => new Set((process.env.SHOPPING_FETCH_ALLOW_HOSTS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))

/** true si la IP es privada, local, de enlace, multicast o reservada (IPv4 e IPv6, incluidas las IPv4 mapeadas). */
export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip)
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number)
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224
  }
  if (v === 6) {
    const x = ip.toLowerCase()
    const mapped = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); if (mapped) return isPrivateIp(mapped[1])
    return x === '::' || x === '::1' || /^f[cd]/.test(x) || /^fe[89ab]/.test(x) || /^ff/.test(x) || x.startsWith('64:ff9b:') || x.startsWith('2001:db8')
  }
  return true
}

/** Valida una URL antes de pedirla; devuelve la URL normalizada o lanza FetchBlocked. */
export async function checkUrl(raw: string): Promise<URL> {
  let u: URL
  try { u = new URL(raw) } catch { throw new FetchBlocked('La dirección no es una URL válida.', 'invalid') }
  if (!/^https?:$/.test(u.protocol)) throw new FetchBlocked('Solo se admiten direcciones http(s).', 'invalid')
  if (u.username || u.password) throw new FetchBlocked('La URL no puede llevar credenciales.', 'invalid')
  const hostPort = `${u.hostname.toLowerCase()}:${u.port || (u.protocol === 'https:' ? '443' : '80')}`
  if (allowHosts().has(hostPort)) return u
  const host = u.hostname.replace(/^\[|\]$/g, '')
  if (/^(localhost|.*\.local|.*\.internal|.*\.localhost)$/i.test(host) || (isIP(host) && isPrivateIp(host))) throw new FetchBlocked('No se puede acceder a direcciones internas.', 'private')
  if (u.port && !['80', '443'].includes(u.port)) throw new FetchBlocked('Solo se admiten los puertos web habituales.', 'invalid')
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => { throw new FetchBlocked('No se encuentra ese dominio.', 'invalid') })
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new FetchBlocked('No se puede acceder a direcciones internas.', 'private')
  return u
}

export interface Fetched { url: string; status: number; contentType: string; body: string; bytes?: Buffer }
/** GET seguro: revalida cada redirección, corta por tiempo y tamaño, y solo acepta los tipos indicados. */
export async function safeFetch(raw: string, opts: { maxBytes?: number; accept?: RegExp; timeoutMs?: number; binary?: boolean } = {}): Promise<Fetched> {
  const maxBytes = opts.maxBytes ?? FETCH_LIMITS.maxBytes
  let current = raw
  for (let hop = 0; hop <= FETCH_LIMITS.maxRedirects; hop++) {
    const u = await checkUrl(current)
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? FETCH_LIMITS.timeoutMs)
    let res: Response
    try { res = await fetch(u, { redirect: 'manual', signal: ctrl.signal, headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml,application/json,text/csv,application/xml;q=0.9,*/*;q=0.5' } }) }
    catch (e) { clearTimeout(timer); throw new FetchBlocked((e as Error).name === 'AbortError' ? 'La tienda tarda demasiado en responder.' : 'No se pudo conectar con la tienda.', 'timeout') }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { clearTimeout(timer); current = new URL(res.headers.get('location')!, u).toString(); continue }
    try {
      const contentType = res.headers.get('content-type') ?? ''
      if (opts.accept && res.ok && !opts.accept.test(contentType)) throw new FetchBlocked(`Tipo de contenido no admitido (${contentType || 'desconocido'}).`, 'type')
      const len = Number(res.headers.get('content-length') ?? 0); if (len > maxBytes) throw new FetchBlocked('La página es demasiado grande.', 'size')
      const reader = res.body?.getReader(); const chunks: Uint8Array[] = []; let size = 0
      if (reader) for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > maxBytes) { await reader.cancel(); throw new FetchBlocked('La página es demasiado grande.', 'size') } chunks.push(value) }
      const buf = Buffer.concat(chunks)
      return opts.binary ? { url: u.toString(), status: res.status, contentType, body: '', bytes: buf } : { url: u.toString(), status: res.status, contentType, body: new TextDecoder().decode(buf) }
    } catch (e) { if (e instanceof FetchBlocked) throw e; throw new FetchBlocked('La tienda cortó la respuesta.', 'timeout') }
    finally { clearTimeout(timer) }
  }
  throw new FetchBlocked('Demasiadas redirecciones.', 'http')
}

// ── robots.txt (RFC 9309) ──
interface Group { agents: string[]; rules: { allow: boolean; path: string }[] }
export function parseRobots(txt: string): Group[] {
  const groups: Group[] = []; let cur: Group | null = null; let lastWasAgent = false
  for (const line of txt.split(/\r?\n/)) {
    const l = line.replace(/#.*/, '').trim(); const i = l.indexOf(':'); if (i < 0) continue
    const k = l.slice(0, i).trim().toLowerCase(), v = l.slice(i + 1).trim()
    if (k === 'user-agent') { if (!cur || !lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur) } cur.agents.push(v.toLowerCase()); lastWasAgent = true }
    else if ((k === 'allow' || k === 'disallow') && cur) { lastWasAgent = false; if (v || k === 'allow') cur.rules.push({ allow: k === 'allow', path: v }) }
    else lastWasAgent = false
  }
  return groups
}
const ruleRe = (p: string) => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'))
/** ¿Puede nuestro agente leer esta ruta? Gana la regla más específica; en empate, Allow. */
export function robotsAllows(txt: string, pathWithQuery: string, agent = ROBOTS_AGENT): boolean {
  const groups = parseRobots(txt), a = agent.toLowerCase()
  const mine = groups.filter((g) => g.agents.some((x) => x !== '*' && a.includes(x)))
  const rules = (mine.length ? mine : groups.filter((g) => g.agents.includes('*'))).flatMap((g) => g.rules)
  let best: { allow: boolean; len: number } | null = null
  for (const r of rules) {
    if (!r.path) continue
    if (ruleRe(r.path).test(pathWithQuery) && (!best || r.path.length > best.len || (r.path.length === best.len && r.allow))) best = { allow: r.allow, len: r.path.length }
  }
  return best ? best.allow : true
}
/** Consulta robots.txt del sitio: 4xx = sin restricciones; error de red o 5xx = no se lee la página (prudencia). */
export async function checkRobots(pageUrl: string): Promise<{ allowed: boolean; reason: string }> {
  const u = new URL(pageUrl)
  try {
    const r = await safeFetch(`${u.protocol}//${u.host}/robots.txt`, { maxBytes: 500_000, timeoutMs: 5000 })
    if (r.status >= 500) return { allowed: false, reason: 'No se pudo consultar robots.txt del sitio: por prudencia no se lee la página.' }
    if (r.status >= 400) return { allowed: true, reason: 'El sitio no publica robots.txt.' }
    const ok = robotsAllows(r.body, u.pathname + u.search)
    return { allowed: ok, reason: ok ? 'robots.txt permite leer esta página.' : 'robots.txt del sitio no permite leer esta página de forma automática.' }
  } catch (e) {
    if (e instanceof FetchBlocked && e.code === 'private') throw e
    return { allowed: false, reason: 'No se pudo consultar robots.txt del sitio: por prudencia no se lee la página.' }
  }
}
