import { canonicalUrl, type NormalizedProduct } from './normalize'
import { matchProduct, type ProductSearchQuery } from './query'
import type { ImportResult, ProductSource, SearchHit } from './sources'
import { callCatalogTool, catalogTools, discover, normalizeUcpProduct, ucpConfig, UcpError, UCP_SEARCH_LIMIT, type UcpConfig, type UcpRetailer } from './ucp'
import type { safeFetch } from './net'

/**
 * EmeStudiosProductSource — catálogo de EME Studios (tienda Shopify) por UCP/MCP, SOLO CONSULTA.
 * Reutiliza el cliente UCP (descubrimiento, MCP limitado a search_catalog / get_product / lookup_catalog, límites, 429)
 * y añade lo propio de la tienda:
 * - Descubrimiento en https://checkout.emestudios.com/.well-known/ucp: agents.md indica que los protocolos de agentes
 *   funcionan en checkout.emestudios.com, y emestudios.com está tras Cloudflare (bloquea tráfico automatizado; no se elude).
 * - Público: etiquetas «hombre» / «mujer» / «FOR EVERYONE» publicadas por la tienda → raw_attributes.audience (procedencia
 *   «Tienda»). Las prendas solo de mujer no se proponen (el armario es masculino); sin etiqueta, público desconocido.
 * - Nunca carrito, checkout, pagos ni pedidos; sin Shop Skill ni cuentas personales.
 */
export const EME_STUDIOS = { slug: 'eme-studios', name: 'EME Studios', discoveryOrigin: 'https://checkout.emestudios.com' } as const
type J = Record<string, any>
type Fetcher = typeof fetch

/** Público según las etiquetas de la tienda (null si no lo publica). */
export function audienceOf(tags: unknown): 'hombre' | 'mujer' | 'unisex' | null {
  const t = (Array.isArray(tags) ? tags : []).map((x) => String(x).trim().toLowerCase())
  const men = t.some((x) => x === 'hombre' || x === 'men' || x === 'man'), women = t.some((x) => x === 'mujer' || x === 'women' || x === 'woman')
  const all = t.some((x) => x === 'for everyone' || x === 'unisex')
  return all || (men && women) ? 'unisex' : men ? 'hombre' : women ? 'mujer' : null
}
export function normalizeEmeProduct(p: J, retailer: { name: string }, now = new Date()): NormalizedProduct | null {
  const n = normalizeUcpProduct(p, retailer, now)
  if (!n) return null
  const audience = audienceOf(p.tags)
  n.raw_attributes = { ...n.raw_attributes, audience: audience ? { value: audience, source: 'store' } : null, store_tags: ((p.tags ?? []) as string[]).slice(0, 20) }
  return n
}
const handleOf = (url: string) => { try { return new URL(url).pathname.match(/\/products\/([^/?#]+)/)?.[1] ?? null } catch { return null } }

export function emeStudiosProductSource(retailer: UcpRetailer, cfg: UcpConfig = ucpConfig(), deps: { fetch?: Fetcher; fetchProfile?: typeof safeFetch } = {}): ProductSource & { getById(id: string): Promise<NormalizedProduct> } {
  const f = deps.fetch ?? fetch
  const label = `${retailer.name} (UCP)`
  const ctx = () => ({ address_country: cfg.market, language: cfg.language, currency: cfg.currency })
  const ready = async () => {
    if (!cfg.profileUrl) throw new UcpError('Falta SHOPPING_UCP_PROFILE_URL: la URL pública del perfil UCP de la app.', 'unavailable')
    const d = await discover(EME_STUDIOS.discoveryOrigin, deps.fetchProfile)
    const tools = await catalogTools(d.endpoint, cfg.profileUrl, f)
    if (!tools.includes('search_catalog')) throw new UcpError('La tienda no publica la herramienta search_catalog.', 'unavailable')
    return { d, tools }
  }
  const search = async (query: string, extra: J = {}) => {
    const { d } = await ready()
    const sc = await callCatalogTool(d.endpoint, cfg.profileUrl!, 'search_catalog', { query, context: ctx(), ...extra, pagination: { limit: UCP_SEARCH_LIMIT } }, f)
    return (sc.products ?? []) as J[]
  }
  const getById = async (id: string) => {
    const { d, tools } = await ready()
    if (!tools.includes('get_product')) throw new UcpError('La tienda no publica get_product.', 'unavailable')
    const sc = await callCatalogTool(d.endpoint, cfg.profileUrl!, 'get_product', { id, context: ctx() }, f)
    const n = sc.product ? normalizeEmeProduct(sc.product, retailer) : null
    if (!n) throw new UcpError('El producto ya no está en el catálogo de la tienda.', 'not_found')
    return n
  }
  return {
    kind: 'api', id: null, label,
    available: () => (cfg.profileUrl ? { ok: true } : { ok: false, reason: 'Falta SHOPPING_UCP_PROFILE_URL (perfil UCP público de la app).' }),
    async searchProducts(q: ProductSearchQuery): Promise<SearchHit[]> {
      if (q.excluded.includes(retailer.slug) || (q.retailers.length && !q.retailers.includes(retailer.slug))) return []
      const filters: J = {}
      if (q.price_min != null || q.price_max != null) filters.price = { ...(q.price_min != null ? { min: Math.round(q.price_min * 100) } : {}), ...(q.price_max != null ? { max: Math.round(q.price_max * 100) } : {}) }
      const products = await search(q.text, Object.keys(filters).length ? { filters } : {})
      return products.filter((p) => audienceOf(p.tags) !== 'mujer')
        .map((p) => normalizeEmeProduct(p, retailer)).filter((x): x is NormalizedProduct => !!x)
        .map((p) => ({ ...p, retailer, source_label: label, source_id: null, match: matchProduct(p, q) }))
        .filter((h) => h.match.misses.length === 0)
    },
    /** Enlace de emestudios.com o checkout.emestudios.com (/…/products/{handle}) → search_catalog por handle + get_product. No se lee la web. */
    async getProduct(url: string): Promise<ImportResult> {
      const handle = handleOf(url)
      if (!handle) return { ok: false, reason: 'no_metadata', retailer, url, message: 'La URL no es una página de producto de EME Studios (/products/…).' }
      try {
        const products = await search(handle.replace(/-/g, ' '))
        const p = products.find((x) => x.handle === handle || (x.url && canonicalUrl(x.url) === canonicalUrl(`${EME_STUDIOS.discoveryOrigin}/products/${handle}`)))
        if (!p) return { ok: false, reason: 'no_metadata', retailer, url, message: 'No he encontrado ese producto en el catálogo de EME Studios (puede estar agotado o retirado). Completa tú los datos.' }
        const fromSearch = normalizeEmeProduct(p, retailer)!
        let detail: NormalizedProduct | null = null
        try { detail = await getById(p.id) } catch { /* nos quedamos con la búsqueda */ }
        const known = (x: NormalizedProduct) => x.variants.filter((v) => v.availability !== 'unknown').length
        const product = detail && known(detail) >= known(fromSearch) ? detail : detail ? { ...detail, variants: fromSearch.variants, availability_status: fromSearch.availability_status } : fromSearch
        return { ok: true, product, retailer, how: 'ucp', note: `Datos del catálogo oficial de ${retailer.name} (UCP/MCP), consultados el ${new Date().toLocaleString('es-ES')}.` }
      } catch (e) {
        if (e instanceof UcpError) return { ok: false, reason: 'blocked', retailer, url, message: `${e.message} Completa tú los datos o inténtalo más tarde.` }
        throw e
      }
    },
    getById,
  }
}
