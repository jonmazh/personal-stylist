import { z } from 'zod'
import { checkUrl } from '@/lib/shopping/catalog/net'

/**
 * Cliente de Brave Search API (fuente EDITORIAL de Trend Intelligence). Documentación: api-dashboard.search.brave.com.
 * - GET /res/v1/web/search y /res/v1/news/search (q, count ≤ 20, freshness pd|pw|pm|py|AAAA-MM-DDtoAAAA-MM-DD,
 *   country, search_lang, extra_snippets). Clave en la cabecera X-Subscription-Token, solo en el servidor.
 * - Condiciones (Brave Search API Terms, «Use Restrictions»): NO se pueden almacenar, cachear ni crear una base de datos
 *   de los resultados, en todo ni en parte, salvo almacenamiento transitorio; tampoco usarlos para entrenar modelos.
 *   Por eso los resultados solo viven en memoria durante la investigación. Solo con un plan con derechos de
 *   almacenamiento (BRAVE_STORAGE_RIGHTS=1) se guardan sus metadatos (URL, título, medio, fecha y un fragmento breve).
 * - Límite del plan Search: 50 consultas/s; 429 → Retry-After y un único reintento. Coste: 5 $ por 1000 consultas
 *   (5 $ gratis al mes).
 */
export const BRAVE_USD_PER_REQUEST = 0.005
const DEFAULT_BASE = 'https://api.search.brave.com'
export class BraveError extends Error { constructor(message: string, public code: 'unconfigured' | 'auth' | 'rate_limited' | 'quota' | 'timeout' | 'http' | 'protocol', public retryAfter?: number) { super(message) } }

export interface BraveConfig { key: string | null; baseUrl: string; country: string; lang: string; storageRights: boolean; timeoutMs: number }
export function braveConfig(env = process.env): BraveConfig {
  return {
    // Reutiliza la clave del buscador de productos si ese buscador es Brave (misma cuenta)
    key: env.BRAVE_SEARCH_API_KEY || (env.SHOPPING_SEARCH_PROVIDER === 'brave' ? env.SHOPPING_SEARCH_KEY || null : null),
    baseUrl: env.BRAVE_SEARCH_URL || (env.SHOPPING_SEARCH_PROVIDER === 'brave' && env.SHOPPING_SEARCH_URL ? new URL(env.SHOPPING_SEARCH_URL).origin : DEFAULT_BASE), country: (env.BRAVE_COUNTRY || 'ES').toUpperCase(), lang: env.BRAVE_SEARCH_LANG || 'es',
    storageRights: env.BRAVE_STORAGE_RIGHTS === '1', timeoutMs: Number(env.BRAVE_TIMEOUT_MS) || 12000,
  }
}

const Result = z.object({
  title: z.string(), url: z.string(), description: z.string().nullish(), page_age: z.string().nullish(), age: z.string().nullish(),
  meta_url: z.object({ hostname: z.string().nullish() }).nullish(), profile: z.object({ name: z.string().nullish(), long_name: z.string().nullish() }).nullish(),
  extra_snippets: z.array(z.string()).nullish(),
})
const WebResp = z.object({ web: z.object({ results: z.array(z.unknown()) }).nullish() })
const NewsResp = z.object({ results: z.array(z.unknown()).nullish() })

/** Resultado en memoria (nunca se guarda sin derechos de almacenamiento). */
export interface BraveHit { kind: 'web' | 'news'; title: string; url: string; host: string; outlet: string; snippet: string; extra: string[]; published: string | null; query: string }
export class BraveMeter { requests = 0; errors = 0; ms = 0; summary() { return { requests: this.requests, errors: this.errors, ms: this.ms, est_usd: Math.round(this.requests * BRAVE_USD_PER_REQUEST * 1000) / 1000 } } }
const strip = (s?: string | null) => (s ?? '').replace(/<[^>]+>/g, '').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

async function baseOf(cfg: BraveConfig) {
  if (cfg.baseUrl === DEFAULT_BASE) return DEFAULT_BASE
  const allowed = (process.env.SHOPPING_FETCH_ALLOW_HOSTS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  const u = new URL(cfg.baseUrl)
  if (!allowed.includes(`${u.hostname}:${u.port || (u.protocol === 'https:' ? '443' : '80')}`)) throw new BraveError('BRAVE_SEARCH_URL solo admite la API oficial (o un host de pruebas permitido).', 'unconfigured')
  await checkUrl(cfg.baseUrl)
  return cfg.baseUrl.replace(/\/$/, '')
}

export async function braveSearch(cfg: BraveConfig, kind: 'web' | 'news', q: string, opts: { count?: number; freshness?: string; lang?: string; country?: string } = {}, deps: { fetch?: typeof fetch; meter?: BraveMeter; sleep?: (ms: number) => Promise<void> } = {}): Promise<BraveHit[]> {
  if (!cfg.key) throw new BraveError('Brave Search no está configurado (BRAVE_SEARCH_API_KEY).', 'unconfigured')
  const f = deps.fetch ?? fetch
  const url = new URL(`${await baseOf(cfg)}/res/v1/${kind}/search`)
  url.searchParams.set('q', q.slice(0, 400)); url.searchParams.set('count', String(Math.min(20, opts.count ?? 10)))
  url.searchParams.set('country', opts.country ?? cfg.country); url.searchParams.set('search_lang', opts.lang ?? cfg.lang)
  url.searchParams.set('extra_snippets', 'true'); url.searchParams.set('safesearch', 'moderate')
  if (opts.freshness) url.searchParams.set('freshness', opts.freshness)
  for (let attempt = 0; attempt < 2; attempt++) {
    const t0 = Date.now(); const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs)
    let res: Response
    try { res = await f(url, { headers: { 'X-Subscription-Token': cfg.key, Accept: 'application/json' }, signal: ctrl.signal, redirect: 'error' }) }
    catch (e) { if (deps.meter) { deps.meter.errors++; deps.meter.ms += Date.now() - t0 }; throw new BraveError((e as Error).name === 'AbortError' ? 'Brave tarda demasiado en responder.' : 'No se pudo conectar con Brave.', 'timeout') }
    finally { clearTimeout(timer) }
    if (deps.meter) { deps.meter.requests++; deps.meter.ms += Date.now() - t0; if (!res.ok) deps.meter.errors++ }
    if (res.status === 429) {
      const ra = Math.min(30, Number(res.headers.get('retry-after')) || 1)
      if (attempt === 0 && ra <= 2) { await (deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))))(ra * 1000); continue }
      throw new BraveError(`Brave limita las consultas: inténtalo en ${ra} s.`, 'rate_limited', ra)
    }
    if (res.status === 401 || res.status === 403) throw new BraveError('Brave rechaza la clave (revisa BRAVE_SEARCH_API_KEY).', 'auth')
    if (res.status === 402) throw new BraveError('Brave: sin crédito disponible en la cuenta.', 'quota')
    if (!res.ok) throw new BraveError(`Brave respondió ${res.status}.`, 'http')
    let raw: unknown
    try { raw = await res.json() } catch { throw new BraveError('Respuesta de Brave ilegible.', 'protocol') }
    const list = kind === 'web' ? WebResp.safeParse(raw).data?.web?.results : NewsResp.safeParse(raw).data?.results
    if (!list) throw new BraveError('Respuesta de Brave con un formato inesperado.', 'protocol')
    return list.map((x) => Result.safeParse(x)).filter((r) => r.success).map(({ data: r }) => {
      let host = r!.meta_url?.hostname ?? ''
      try { host = new URL(r!.url).hostname } catch { /* se queda el de Brave */ }
      host = host.toLowerCase().replace(/^www\./, '')
      return { kind, title: strip(r!.title), url: r!.url, host, outlet: strip(r!.profile?.name) || host, snippet: strip(r!.description).slice(0, 500), extra: (r!.extra_snippets ?? []).map(strip).slice(0, 5), published: r!.page_age ?? null, query: q }
    }).filter((h) => /^https:\/\//.test(h.url) && h.title)
  }
  throw new BraveError('Brave limita las consultas.', 'rate_limited')
}
