import { FETCH_LIMITS, type SourceKind } from './taxonomy'
import { canonicalUrl, hostOf, normalizeProduct, retailerForUrl, type NormalizedProduct, type RawProduct } from './normalize'
import { checkRobots, checkUrl, FetchBlocked, safeFetch } from './net'
import { extractProduct } from './extract'
import { matchProduct, type Match, type ProductSearchQuery } from './query'

/**
 * Product Source Manager (fase 4B). Todas las fuentes cumplen la misma interfaz, de modo que se puede añadir o cambiar
 * una tienda o un proveedor sin tocar el resto del Personal Shopper. Ningún conector se salta controles de acceso,
 * autenticación, límites ni condiciones de uso.
 */
export interface RetailerRef { id: string; slug: string; name: string; domains: readonly string[]; url_policy: 'metadata' | 'manual_only'; policy_note?: string | null }
export interface SearchHit extends NormalizedProduct { retailer: RetailerRef | null; match: Match; source_label: string; source_id: string | null }
export interface SourceStatus { kind: SourceKind; id: string | null; label: string; status: 'ok' | 'empty' | 'unavailable' | 'error'; count: number; message?: string }
export interface ProductSource {
  kind: SourceKind; id: string | null; label: string
  available(): { ok: boolean; reason?: string }
  searchProducts?(q: ProductSearchQuery): Promise<SearchHit[]>
  getProduct?(url: string): Promise<ImportResult>
}
export type ImportResult =
  | { ok: true; product: NormalizedProduct; retailer: RetailerRef | null; how: string; note: string }
  | { ok: false; reason: 'policy' | 'robots' | 'no_metadata' | 'blocked'; retailer: RetailerRef | null; message: string; url: string }

const allowedRetailer = (r: RetailerRef | null, q: ProductSearchQuery) => !r || (!q.excluded.includes(r.slug) && (!q.retailers.length || q.retailers.includes(r.slug)))

// ── Feed autorizado: busca entre los productos ya normalizados del feed (sin red) ──
export function feedSource(src: { id: string; name: string }, items: NormalizedProduct[], retailers: RetailerRef[], fallbackRetailer: RetailerRef | null): ProductSource {
  return {
    kind: 'feed', id: src.id, label: `Feed · ${src.name}`,
    available: () => (items.length ? { ok: true } : { ok: false, reason: 'El feed no tiene productos: sincronízalo.' }),
    async searchProducts(q) {
      return items.map((p) => ({ ...p, retailer: retailerForUrl(p.product_url, retailers) ?? fallbackRetailer, source_label: `Feed · ${src.name}`, source_id: src.id, match: matchProduct(p, q) }))
        .filter((h) => allowedRetailer(h.retailer, q) && h.match.misses.length === 0 && h.match.score >= 45)
    },
  }
}

// ── Buscador de productos (API con clave): devuelve enlaces a páginas de producto de tiendas conocidas; no descarga las páginas ──
export interface SearchProviderConfig { provider: string | null; key: string | null; url: string | null; market: string }
export function searchProviderConfig(env = process.env): SearchProviderConfig {
  return { provider: env.SHOPPING_SEARCH_PROVIDER || null, key: env.SHOPPING_SEARCH_KEY || null, url: env.SHOPPING_SEARCH_URL || null, market: env.SHOPPING_MARKET || 'ES' }
}
export function searchProviderSource(cfg: SearchProviderConfig, retailers: RetailerRef[], fetcher: typeof fetch = fetch): ProductSource {
  const label = 'Buscador de productos'
  return {
    kind: 'search', id: null, label,
    available: () => (cfg.provider === 'brave' && cfg.key ? { ok: true } : { ok: false, reason: 'Sin proveedor de búsqueda configurado (SHOPPING_SEARCH_PROVIDER y SHOPPING_SEARCH_KEY).' }),
    async searchProducts(q) {
      const shops = retailers.filter((r) => allowedRetailer(r, q))
      if (!shops.length) return []
      const sites = shops.flatMap((r) => r.domains).slice(0, 12).map((d) => `site:${d}`).join(' OR ')
      const url = new URL(cfg.url || 'https://api.search.brave.com/res/v1/web/search')
      url.searchParams.set('q', `${q.text} (${sites})`); url.searchParams.set('count', '20'); url.searchParams.set('country', cfg.market.toLowerCase()); url.searchParams.set('search_lang', 'es')
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), FETCH_LIMITS.timeoutMs)
      let res: Response
      try { res = await fetcher(url, { headers: { accept: 'application/json', 'x-subscription-token': cfg.key! }, signal: ctrl.signal }) } finally { clearTimeout(t) }
      if (res.status === 401 || res.status === 403) throw new Error('El proveedor de búsqueda rechaza la clave.')
      if (res.status === 429) throw new Error('Has superado el límite de búsquedas del proveedor; inténtalo más tarde.')
      if (!res.ok) throw new Error(`El proveedor de búsqueda respondió ${res.status}.`)
      const data = await res.json() as { web?: { results?: { title?: string; url?: string; description?: string }[] } }
      const hits: SearchHit[] = []
      for (const r of data.web?.results ?? []) {
        const retailer = retailerForUrl(r.url, retailers)
        if (!retailer || !allowedRetailer(retailer, q)) continue
        const p = normalizeProduct({ name: (r.title ?? '').replace(/\s*[|–-]\s*[^|–-]*$/, ''), url: r.url, description: (r.description ?? '').replace(/<[^>]+>/g, '') }, 'search', 'search')
        if (!p) continue
        hits.push({ ...p, retailer, source_label: label, source_id: null, match: matchProduct(p, q) })
      }
      return hits.filter((h) => h.match.misses.length === 0)
    },
  }
}

// ── Importación por URL: UNA página, a petición tuya, respetando la política de la tienda y robots.txt; solo metadatos ──
export function urlImportSource(retailers: RetailerRef[]): ProductSource {
  return {
    kind: 'url', id: null, label: 'Importación por URL', available: () => ({ ok: true }),
    async getProduct(url) {
      const retailer = retailerForUrl(url, retailers)
      if (retailer?.url_policy === 'manual_only') return { ok: false, reason: 'policy', retailer, url, message: `${retailer.name}: ${retailer.policy_note ?? 'sus condiciones no permiten la extracción automatizada'} Completa tú los datos o sube capturas.` }
      try {
        await checkUrl(url)
        const robots = await checkRobots(url)
        if (!robots.allowed) return { ok: false, reason: 'robots', retailer, url, message: `${robots.reason} Completa tú los datos o sube capturas.` }
        const page = await safeFetch(url, { accept: /text\/html|application\/xhtml/ })
        if (page.status >= 400) return { ok: false, reason: 'blocked', retailer, url, message: `La tienda respondió ${page.status}: no se puede leer la página. Completa tú los datos.` }
        const ex = extractProduct(page.body, page.url)
        if (!ex) return { ok: false, reason: 'no_metadata', retailer, url, message: 'La página no publica datos de producto legibles (schema.org u OpenGraph). Completa tú los datos o sube capturas.' }
        const p = normalizeProduct({ ...ex.product, url: ex.product.url && hostOf(ex.product.url) === hostOf(page.url) ? ex.product.url : page.url, retailer_name: retailer?.name }, 'url', 'store')
        if (!p) return { ok: false, reason: 'no_metadata', retailer, url, message: 'La página no indica el nombre del producto. Completa tú los datos.' }
        return { ok: true, product: p, retailer, how: ex.how, note: `${robots.reason} Datos leídos de los metadatos ${ex.how === 'json-ld' ? 'schema.org' : 'OpenGraph'} que publica la tienda.` }
      } catch (e) {
        if (e instanceof FetchBlocked) return { ok: false, reason: 'blocked', retailer, url, message: `${e.message} Completa tú los datos.` }
        throw e
      }
    },
  }
}

// ── Importación asistida: tus datos (y después tus capturas), con procedencia «tú» ──
export function manualProduct(raw: RawProduct): NormalizedProduct | null { return normalizeProduct(raw, 'manual', 'user') }

/** Ejecuta la búsqueda en todas las fuentes disponibles; une, quita duplicados (gana la fuente con más datos) y ordena por coincidencia. */
export async function searchAll(q: ProductSearchQuery, sources: ProductSource[], limit = 40) {
  const statuses: SourceStatus[] = []; const all: SearchHit[] = []
  await Promise.all(sources.filter((s) => s.searchProducts).map(async (s) => {
    const av = s.available()
    if (!av.ok) { statuses.push({ kind: s.kind, id: s.id, label: s.label, status: 'unavailable', count: 0, message: av.reason }); return }
    try { const hits = await s.searchProducts!(q); all.push(...hits); statuses.push({ kind: s.kind, id: s.id, label: s.label, status: hits.length ? 'ok' : 'empty', count: hits.length }) }
    catch (e) { statuses.push({ kind: s.kind, id: s.id, label: s.label, status: 'error', count: 0, message: (e as Error).message }) }
  }))
  const rank: Record<string, number> = { api: 0, feed: 1, url: 2, manual: 3, search: 4 }
  const best = new Map<string, SearchHit>()
  for (const h of all) {
    const key = h.canonical_url ?? canonicalUrl(h.product_url) ?? `${h.source_id}:${h.external_product_id ?? h.product_name}`
    const prev = best.get(key)
    if (!prev || rank[h.source_kind] < rank[prev.source_kind]) best.set(key, h)
  }
  const results = [...best.values()].sort((a, z) => z.match.score - a.match.score || Object.keys(z.field_sources).length - Object.keys(a.field_sources).length).slice(0, limit)
  const st: Record<string, number> = { ok: 0, empty: 1, error: 2, unavailable: 3 }
  return { results, statuses: statuses.sort((a, z) => rank[a.kind] - rank[z.kind] || st[a.status] - st[z.status]) }
}
