import { checkUrl, FetchBlocked, safeFetch } from './net'
import { canonicalUrl, hostOf, normalizeProduct, type NormalizedProduct, type RawVariant } from './normalize'
import { matchProduct, type ProductSearchQuery } from './query'
import type { ImportResult, ProductSource, RetailerRef, SearchHit } from './sources'
import { FETCH_LIMITS, USER_AGENT } from './taxonomy'

/**
 * Conector UCP (Universal Commerce Protocol) de SOLO LECTURA sobre MCP — p. ej. Grimey (tienda Shopify).
 * - Descubrimiento: GET {tienda}/.well-known/ucp → endpoint MCP y capacidades; se exige catalog.search y la vinculación
 *   del esquema de cada capacidad con su espacio de nombres (dev.ucp.* → ucp.dev, dev.shopify.* → shopify.dev).
 * - Solo se llaman las herramientas de catálogo publicadas por el servidor: search_catalog, get_product y lookup_catalog.
 *   NUNCA carrito, checkout, pedidos ni otras acciones (lista blanca CATALOG_TOOLS).
 * - Cada llamada lleva meta["ucp-agent"].profile (perfil UCP público del agente, SHOPPING_UCP_PROFILE_URL), como exige UCP.
 * - Bajo demanda, con límite de frecuencia por tienda, respeto de 429/Retry-After y caché corta (la especificación pide no
 *   reutilizar respuestas entre sesiones sin revalidar). Las imágenes solo se enlazan.
 */
export const CATALOG_TOOLS = ['search_catalog', 'get_product', 'lookup_catalog'] as const
export const MCP_PROTOCOL_VERSION = '2025-06-18'
export const UCP_SEARCH_LIMIT = 10
const DISCOVERY_TTL_MS = 60 * 60 * 1000
const MIN_INTERVAL_MS = 400
const MAX_PER_MINUTE = 20

export class UcpError extends Error {
  constructor(message: string, public code: 'unavailable' | 'rate_limited' | 'timeout' | 'protocol' | 'not_found' | 'tool_error' | 'http', public retryAfter?: number) { super(message) }
}

export interface UcpConfig { profileUrl: string | null; market: string; language: string; currency: string }
export function ucpConfig(env = process.env): UcpConfig {
  return { profileUrl: env.SHOPPING_UCP_PROFILE_URL || null, market: (env.SHOPPING_MARKET || 'ES').toUpperCase(), language: env.SHOPPING_LANGUAGE || 'es', currency: env.SHOPPING_CURRENCY || 'EUR' }
}

// ── Descubrimiento ──
export interface Discovery { version: string; endpoint: string; capabilities: string[]; checkedAt: number }
type J = Record<string, any>
const AUTHORITY: [RegExp, string][] = [[/^dev\.ucp\./, 'https://ucp.dev'], [/^dev\.shopify\./, 'https://shopify.dev']]
/** Valida el perfil UCP de la tienda y devuelve el endpoint MCP y las capacidades de catálogo utilizables. */
export function parseDiscovery(profile: unknown): Discovery {
  const u = (profile as J)?.ucp
  if (!u || typeof u.version !== 'string') throw new UcpError('El perfil UCP de la tienda no es válido.', 'protocol')
  const svc = ((u.services?.['dev.ucp.shopping'] ?? []) as J[]).find((s) => s.transport === 'mcp' && typeof s.endpoint === 'string')
  if (!svc || !/^https:\/\//.test(svc.endpoint)) throw new UcpError('La tienda no publica un endpoint MCP de UCP.', 'unavailable')
  const caps = Object.entries((u.capabilities ?? {}) as Record<string, J[]>).filter(([name, list]) => {
    const auth = AUTHORITY.find(([re]) => re.test(name))?.[1]
    // Vinculación de autoridad: el esquema de la capacidad debe servirse desde el dominio de su espacio de nombres
    return Array.isArray(list) && list.some((c) => !c.schema || !auth || String(c.schema).startsWith(auth + '/'))
  }).map(([name]) => name)
  if (!caps.includes('dev.ucp.shopping.catalog.search')) throw new UcpError('La tienda no ofrece búsqueda de catálogo por UCP.', 'unavailable')
  return { version: u.version, endpoint: svc.endpoint, capabilities: caps, checkedAt: Date.now() }
}
const discoveries = new Map<string, Discovery>()
export async function discover(origin: string, fetcher = safeFetch): Promise<Discovery> {
  const hit = discoveries.get(origin)
  if (hit && Date.now() - hit.checkedAt < DISCOVERY_TTL_MS) return hit
  let r
  try { r = await fetcher(`${origin}/.well-known/ucp`, { maxBytes: 300_000, timeoutMs: 8000 }) } catch (e) { throw new UcpError(e instanceof FetchBlocked ? e.message : 'No se pudo consultar el perfil UCP de la tienda.', 'unavailable') }
  if (r.status >= 300) throw new UcpError(`El perfil UCP de la tienda respondió ${r.status}.`, 'unavailable')
  let json: unknown
  try { json = JSON.parse(r.body) } catch { throw new UcpError('El perfil UCP de la tienda no es JSON.', 'protocol') }
  const d = parseDiscovery(json)
  discoveries.set(origin, d)
  return d
}

// ── Límite de frecuencia por tienda (en este servidor) ──
const pace = new Map<string, { last: number; recent: number[]; blockedUntil: number }>()
export function takeSlot(key: string, now = Date.now()): { ok: true; wait: number } | { ok: false; retryAfter: number } {
  const s = pace.get(key) ?? { last: 0, recent: [], blockedUntil: 0 }
  pace.set(key, s)
  if (now < s.blockedUntil) return { ok: false, retryAfter: Math.ceil((s.blockedUntil - now) / 1000) }
  s.recent = s.recent.filter((t) => now - t < 60_000)
  if (s.recent.length >= MAX_PER_MINUTE) return { ok: false, retryAfter: Math.ceil((60_000 - (now - s.recent[0])) / 1000) }
  const wait = Math.max(0, s.last + MIN_INTERVAL_MS - now)
  s.last = now + wait; s.recent.push(now + wait)
  return { ok: true, wait }
}
export function blockFor(key: string, seconds: number, now = Date.now()) { const s = pace.get(key) ?? { last: 0, recent: [], blockedUntil: 0 }; s.blockedUntil = Math.max(s.blockedUntil, now + seconds * 1000); pace.set(key, s) }
export function resetUcpState() { pace.clear(); discoveries.clear(); toolCache.clear() }

// ── Llamadas MCP (JSON-RPC sobre HTTP) ──
type Fetcher = typeof fetch
let rpcId = 0
function parseRpcBody(text: string, contentType: string): J {
  if (contentType.includes('text/event-stream')) {
    const datas = text.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).filter(Boolean)
    for (const d of datas.reverse()) { try { const j = JSON.parse(d); if (j.jsonrpc) return j } catch { /* siguiente */ } }
    throw new UcpError('Respuesta MCP ilegible.', 'protocol')
  }
  try { return JSON.parse(text) } catch { throw new UcpError('Respuesta MCP ilegible.', 'protocol') }
}
export async function rpc(endpoint: string, method: string, params: J, f: Fetcher = fetch, timeoutMs: number = FETCH_LIMITS.timeoutMs): Promise<J> {
  await checkUrl(endpoint)
  const slot = takeSlot(hostOf(endpoint) ?? endpoint)
  if (!slot.ok) throw new UcpError(`La tienda limita las consultas: inténtalo en ${slot.retryAfter} s.`, 'rate_limited', slot.retryAfter)
  if (slot.wait) await new Promise((r) => setTimeout(r, slot.wait))
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeoutMs)
  let res: Response
  try {
    res = await f(endpoint, { method: 'POST', redirect: 'error', signal: ctrl.signal, headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'user-agent': USER_AGENT, 'mcp-protocol-version': MCP_PROTOCOL_VERSION }, body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }) })
  } catch (e) { throw new UcpError((e as Error).name === 'AbortError' ? 'La tienda tarda demasiado en responder.' : 'No se pudo conectar con la tienda.', 'timeout') } finally { clearTimeout(t) }
  if (res.status === 429 || res.status === 503) {
    const ra = Number(res.headers.get('retry-after')) || 30
    blockFor(hostOf(endpoint) ?? endpoint, ra)
    throw new UcpError(`La tienda limita las consultas: inténtalo en ${ra} s.`, 'rate_limited', ra)
  }
  const text = await res.text()
  if (text.length > 3_000_000) throw new UcpError('Respuesta demasiado grande.', 'protocol')
  if (res.status === 424) throw new UcpError('La tienda no pudo leer el perfil del agente (SHOPPING_UCP_PROFILE_URL debe ser una URL pública).', 'unavailable')
  if (!res.ok && !text.trim().startsWith('{') && !text.includes('data:')) throw new UcpError(`La tienda respondió ${res.status}.`, 'http')
  const j = parseRpcBody(text, res.headers.get('content-type') ?? '')
  if (j.error) throw new UcpError(`Error MCP: ${j.error.message ?? j.error.code}${j.error.data ? ` (${typeof j.error.data === 'string' ? j.error.data : JSON.stringify(j.error.data)})` : ''}`, res.status === 422 ? 'unavailable' : 'protocol')
  return j.result ?? {}
}

const toolCache = new Map<string, { tools: string[]; at: number }>()
/** initialize + tools/list (una vez por hora y endpoint): solo se usan herramientas de catálogo que el servidor publica. */
export async function catalogTools(endpoint: string, profileUrl: string, f: Fetcher = fetch): Promise<string[]> {
  const hit = toolCache.get(endpoint)
  if (hit && Date.now() - hit.at < DISCOVERY_TTL_MS) return hit.tools
  await rpc(endpoint, 'initialize', { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'personal-stylist', version: '1.0' } }, f)
  const r = await rpc(endpoint, 'tools/list', { arguments: { meta: { 'ucp-agent': { profile: profileUrl } } } }, f)
  const names = ((r.tools ?? []) as J[]).map((t) => t.name as string)
  const tools = CATALOG_TOOLS.filter((t) => names.includes(t))
  toolCache.set(endpoint, { tools, at: Date.now() })
  return tools
}
/** tools/call de una herramienta de catálogo (cualquier otra se rechaza aquí mismo). */
export async function callCatalogTool(endpoint: string, profileUrl: string, tool: (typeof CATALOG_TOOLS)[number], catalog: J, f: Fetcher = fetch): Promise<J> {
  if (!CATALOG_TOOLS.includes(tool)) throw new UcpError('Herramienta no permitida: el conector solo consulta el catálogo.', 'protocol')
  const r = await rpc(endpoint, 'tools/call', { name: tool, arguments: { meta: { 'ucp-agent': { profile: profileUrl } }, catalog } }, f)
  const sc = (r.structuredContent ?? (() => { try { return JSON.parse(r.content?.[0]?.text ?? '') } catch { return null } })()) as J | null
  if (r.isError || !sc) {
    const m = ((sc?.messages ?? []) as J[]).find((x) => x.type === 'error')
    if (m?.code === 'product_not_found') throw new UcpError('El producto ya no está en el catálogo de la tienda.', 'not_found')
    throw new UcpError(`La tienda devolvió un error${m ? `: ${m.content ?? m.code}` : ''}.`, 'tool_error')
  }
  return sc
}

// ── Normalización ──
const money = (m?: J | null) => (m && typeof m.amount === 'number' ? Math.round(m.amount) / 100 : null)
const strip = (h?: string | null) => (h ? h.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li|div)>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/[ \t]+/g, ' ').replace(/\n\s*/g, '\n').trim() : null)
const SIZE_OPT = /^(talla|size|tama[ñn]o|taille)$/i
/**
 * Composición tal como la publica la tienda en la descripción («Material : 100% COTTON», «EXTERIOR: 50% … INTERIOR: 100% …»).
 * Se conserva el texto literal (sin recombinar porcentajes de exterior e interior). Sin porcentajes, no hay composición.
 */
export function compositionFromText(desc?: string | null): string | null {
  if (!desc) return null
  const t = desc.replace(/\s+/g, ' ')
  const m = t.match(/(material(?:es)?(?: exterior)?|exterior|composici[oó]n|composition|tejido)\s*:?\s*(.+)/i)
  if (!m) return null
  const seg = (m[1] + ': ' + m[2]).split(/\s(?=el modelo|the model|la talla|modelo mide|cuidados|care\b|lavado|wash)/i)[0].replace(/\s*:\s*:/, ':').trim()
  return /\d\s?%/.test(seg) ? seg.slice(0, 300) : null
}
const COLOR_OPT = /^(color|colour|colore)$/i
/** Producto UCP → producto normalizado. Lo publicado por la tienda queda como «Tienda»; lo deducido del nombre, como «Deducido». */
export function normalizeUcpProduct(p: J, retailer: { name: string } | null, now = new Date()): NormalizedProduct | null {
  const variantsIn = (p.variants ?? []) as J[]
  const sizeOf = (v: J) => ((v.options ?? []) as J[]).find((o) => SIZE_OPT.test(o.name))?.label ?? (((v.options ?? []) as J[]).length ? null : v.title) ?? null
  const colorOf = (v: J) => ((v.options ?? []) as J[]).find((o) => COLOR_OPT.test(o.name))?.label ?? null
  let variants: RawVariant[] = variantsIn.map((v) => ({ size: sizeOf(v), color: colorOf(v), sku: v.sku ?? null, availability: v.availability?.available === true ? 'in stock' : v.availability?.available === false ? 'out of stock' : null, price: money(v.price) }))
  // get_product / lookup devuelven una variante: la disponibilidad por talla viene en options[].values[]
  const sizeOpt = ((p.options ?? []) as J[]).find((o) => SIZE_OPT.test(o.name))
  if (sizeOpt && variants.length < (sizeOpt.values ?? []).length) {
    const price = money(p.price_range?.min)
    variants = (sizeOpt.values as J[]).filter((x) => x.exists !== false).map((x) => ({ size: x.label, color: null, sku: null, availability: x.available === true ? 'in stock' : x.available === false ? 'out of stock' : null, price: variants.find((v) => v.size === x.label)?.price ?? price }))
  }
  const anyKnown = variants.some((v) => v.availability)
  const available = variants.some((v) => v.availability === 'in stock') || (!variants.length && variantsIn.some((v) => v.availability?.available))
  const colorOpt = ((p.options ?? []) as J[]).find((o) => COLOR_OPT.test(o.name))
  const categoryText = [
    ...((p.collections ?? []) as J[]).map((c) => c.title).filter(Boolean),
    ...((p.tags ?? []) as string[]).filter((t) => /^CAT:/i.test(t)).map((t) => t.replace(/^CAT:\s*/i, '')),
    ...((p.categories ?? []) as J[]).filter((c) => c.taxonomy !== 'shopify' || !/\/na$/.test(c.value)).map((c) => c.value),
  ].join(' > ')
  const n = normalizeProduct({
    name: p.title, url: p.url ?? null, external_id: p.id, description: strip(p.description?.html ?? p.description?.plain),
    category_text: categoryText || null, color: colorOpt?.values?.length === 1 ? colorOpt.values[0].label : null,
    price: money(p.price_range?.min), currency: p.price_range?.min?.currency ?? null,
    availability: anyKnown || variantsIn.length ? (available ? 'in stock' : 'out of stock') : null,
    images: ((p.media ?? []) as J[]).filter((m) => m.type === 'image' && m.url).map((m) => m.url), variants, retailer_name: null,
  }, 'api', 'store', now)
  if (!n) return null
  const at = now.toISOString()
  const comp = compositionFromText(n.description)
  if (comp) { n.confirmed_composition = comp; n.field_sources.confirmed_composition = { source: 'store', at } }
  // Marca: el protocolo no la publica; si el nombre la incluye, se deduce de la tienda (procedencia «Deducido»)
  if (retailer && new RegExp(`\\b${retailer.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(p.title ?? '')) { n.brand = retailer.name; n.field_sources.brand = { source: 'derived', at } }
  else { n.brand = null; delete n.field_sources.brand }
  const listMax = money(p.list_price_range?.max), priceMin = money(p.price_range?.min), priceMax = money(p.price_range?.max)
  n.raw_attributes = {
    ucp_id: p.id, handle: p.handle ?? null, fetched_at: at, price_range: priceMin != null ? { min: priceMin, max: priceMax, currency: n.currency } : null,
    previous_price: listMax && priceMin != null && listMax > priceMin ? { amount: listMax, currency: n.currency, source: 'store' } : null,
    options: ((p.options ?? []) as J[]).map((o) => ({ name: o.name, values: ((o.values ?? []) as J[]).map((x) => ({ label: x.label, available: x.available ?? null })) })),
    collections: ((p.collections ?? []) as J[]).map((c) => c.title).filter(Boolean),
    // Etiquetas de la tienda (p. ej. «hombre», «mujer», «FOR EVERYONE»): se usan para clasificar el género, no el nombre
    tags: ((p.tags ?? []) as string[]).filter((t) => typeof t === 'string').slice(0, 40),
  }
  return n
}

// ── ProductSource ──
export interface UcpRetailer extends RetailerRef { connector?: string | null }
const handleOf = (url: string) => { try { return new URL(url).pathname.match(/\/products\/([^/?#]+)/)?.[1] ?? null } catch { return null } }
export function ucpSource(retailer: UcpRetailer, cfg: UcpConfig = ucpConfig(), deps: { fetch?: Fetcher; fetchProfile?: typeof safeFetch } = {}): ProductSource & { getById(id: string): Promise<NormalizedProduct> } {
  const origin = `https://${retailer.domains[0]}`
  const f = deps.fetch ?? fetch
  const ctx = () => ({ address_country: cfg.market, language: cfg.language, currency: cfg.currency })
  const ready = async () => {
    if (!cfg.profileUrl) throw new UcpError('Falta SHOPPING_UCP_PROFILE_URL: la URL pública del perfil UCP de la app.', 'unavailable')
    const d = await discover(origin, deps.fetchProfile)
    const tools = await catalogTools(d.endpoint, cfg.profileUrl, f)
    if (!tools.includes('search_catalog')) throw new UcpError('La tienda no publica la herramienta search_catalog.', 'unavailable')
    return { d, tools }
  }
  const getById = async (id: string) => {
    const { d, tools } = await ready()
    if (!tools.includes('get_product')) throw new UcpError('La tienda no publica get_product.', 'unavailable')
    const sc = await callCatalogTool(d.endpoint, cfg.profileUrl!, 'get_product', { id, context: ctx() }, f)
    const n = sc.product ? normalizeUcpProduct(sc.product, retailer) : null
    if (!n) throw new UcpError('El producto ya no está en el catálogo de la tienda.', 'not_found')
    return n
  }
  return {
    kind: 'api', id: null, label: `${retailer.name} (UCP)`,
    available: () => (cfg.profileUrl ? { ok: true } : { ok: false, reason: 'Falta SHOPPING_UCP_PROFILE_URL (perfil UCP público de la app).' }),
    async searchProducts(q: ProductSearchQuery): Promise<SearchHit[]> {
      if (q.excluded.includes(retailer.slug) || (q.retailers.length && !q.retailers.includes(retailer.slug))) return []
      const { d } = await ready()
      const filters: J = {}
      if (q.price_min != null || q.price_max != null) filters.price = { ...(q.price_min != null ? { min: Math.round(q.price_min * 100) } : {}), ...(q.price_max != null ? { max: Math.round(q.price_max * 100) } : {}) }
      const sc = await callCatalogTool(d.endpoint, cfg.profileUrl!, 'search_catalog', { query: q.text, context: ctx(), ...(Object.keys(filters).length ? { filters } : {}), pagination: { limit: UCP_SEARCH_LIMIT } }, f)
      return ((sc.products ?? []) as J[]).map((p) => normalizeUcpProduct(p, retailer)).filter((x): x is NormalizedProduct => !!x)
        .map((p) => ({ ...p, retailer, source_label: `${retailer.name} (UCP)`, source_id: null, match: matchProduct(p, q) }))
        .filter((h) => h.match.misses.length === 0)
    },
    /** URL de producto de la tienda → se resuelve su identificador con search_catalog (get_product no admite el handle) y se consulta. */
    async getProduct(url: string): Promise<ImportResult> {
      const handle = handleOf(url)
      if (!handle) return { ok: false, reason: 'no_metadata', retailer, url, message: 'La URL no es una página de producto de la tienda (/products/…).' }
      try {
        const { d } = await ready()
        const sc = await callCatalogTool(d.endpoint, cfg.profileUrl!, 'search_catalog', { query: handle.replace(/-/g, ' '), context: ctx(), pagination: { limit: UCP_SEARCH_LIMIT } }, f)
        const p = ((sc.products ?? []) as J[]).find((x) => x.handle === handle || (x.url && canonicalUrl(x.url) === canonicalUrl(`${origin}/products/${handle}`)))
        if (!p) return { ok: false, reason: 'no_metadata', retailer, url, message: 'No he encontrado ese producto en el catálogo de la tienda (puede estar agotado o retirado). Completa tú los datos.' }
        const fromSearch = normalizeUcpProduct(p, retailer)!
        let detail: NormalizedProduct | null = null
        try { detail = await getById(p.id) } catch { /* nos quedamos con la búsqueda */ }
        // La búsqueda trae todas las variantes con disponibilidad; el detalle, precio y datos al momento. Se queda la más informativa.
        const known = (x: NormalizedProduct) => x.variants.filter((v) => v.availability !== 'unknown').length
        const product = detail ? { ...detail, variants: known(detail) >= known(fromSearch) ? detail.variants : fromSearch.variants, availability_status: known(detail) >= known(fromSearch) ? detail.availability_status : fromSearch.availability_status } : fromSearch
        return { ok: true, product, retailer, how: 'ucp', note: `Datos del catálogo oficial de ${retailer.name} (UCP/MCP), consultados el ${new Date().toLocaleString('es-ES')}.` }
      } catch (e) {
        if (e instanceof UcpError) return { ok: false, reason: 'blocked', retailer, url, message: `${e.message} Completa tú los datos o inténtalo más tarde.` }
        throw e
      }
    },
    getById,
  }
}
