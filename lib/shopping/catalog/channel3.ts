import { z } from 'zod'
import { COLOR_SWATCH, GARMENT_COLORS } from '@/lib/wardrobe/taxonomy'
import { checkUrl } from './net'
import { detectColors, hostOf, normalizeProduct, retailerForUrl, type NormalizedProduct } from './normalize'
import { matchProduct, type ProductSearchQuery } from './query'
import type { ImportResult, RetailerRef, SearchHit } from './sources'

/**
 * Conector Channel3 (catálogo multimarca agregado) — SOLO descubrimiento y datos de producto.
 * API documentada en https://channel3.ai/docs (esquemas verificados con el SDK oficial @channel3/sdk 4.9.0):
 * - POST /v1/search            (1 crédito)  búsqueda textual+semántica (`default`) o planificada por un LLM (`agentic`).
 * - GET  /v1/products/{id}     (gratis)     ficha actual: precio, disponibilidad, variantes y enlace de compra.
 * - POST /v1/lookup            (1 crédito)  URL de producto → ficha, solo si ya está en su catálogo (realtime_fetch: false).
 * - GET  /v1/websites/search   (gratis)     dominio → tienda y mercados en los que Channel3 la tiene indexada.
 * Reglas: Channel3 NO decide qué te favorece (lo decide el motor 4C); su relevancia no se usa como puntuación; la comisión
 * de afiliación (max_commission_rate) ni se guarda ni influye en nada. Solo se envían criterios comerciales (tipo de
 * prenda, color, tiendas, precio, género): nunca medidas, fotos ni tu perfil. La clave vive solo en el servidor.
 * Caché según sus normas: se guardan los ID; precio, stock y enlaces se vuelven a pedir (gratis) antes de mostrarlos,
 * y el enlace de compra (temporal) no se guarda nunca: se resuelve en el momento del clic.
 */
export const C3_SEARCH_LIMIT = 20
export const C3_CREDIT_USD = 0.007
const DEFAULT_BASE = 'https://api.trychannel3.com'
const WEBSITE_TTL_MS = 24 * 3600e3
/** Mercados alternativos si una tienda no está indexada en el tuyo: primero zona euro, después Reino Unido y EE. UU. */
const FALLBACK_ORDER = ['ES', 'PT', 'FR', 'IT', 'DE', 'NL', 'BE', 'AT', 'IE', 'FI', 'GR', 'EU', 'GB', 'US', 'CA', 'AU']
export const MARKET_NAME: Record<string, string> = { ES: 'España', PT: 'Portugal', FR: 'Francia', IT: 'Italia', DE: 'Alemania', NL: 'Países Bajos', BE: 'Bélgica', AT: 'Austria', IE: 'Irlanda', FI: 'Finlandia', GR: 'Grecia', EU: 'Europa', GB: 'Reino Unido', US: 'EE. UU.', CA: 'Canadá', AU: 'Australia' }

export class Channel3Error extends Error {
  constructor(message: string, public code: 'unconfigured' | 'auth' | 'credits' | 'rate_limited' | 'timeout' | 'invalid' | 'not_found' | 'http' | 'protocol', public retryAfter?: number) { super(message) }
}

export interface Channel3Config { key: string | null; country: string; language: string; currency: string; baseUrl: string; mode: 'default' | 'agentic'; foreignMarkets: boolean; timeoutMs: number }
export function channel3Config(env = process.env): Channel3Config {
  return {
    key: env.CHANNEL3_API_KEY || null,
    country: (env.CHANNEL3_COUNTRY || env.SHOPPING_MARKET || 'ES').toUpperCase(), language: (env.CHANNEL3_LANGUAGE || env.SHOPPING_LANGUAGE || 'es').toLowerCase(),
    currency: (env.CHANNEL3_CURRENCY || env.SHOPPING_CURRENCY || 'EUR').toUpperCase(), baseUrl: env.CHANNEL3_BASE_URL || DEFAULT_BASE,
    mode: env.CHANNEL3_MODE === 'agentic' ? 'agentic' : 'default', foreignMarkets: env.CHANNEL3_FOREIGN_MARKETS !== '0', timeoutMs: Number(env.CHANNEL3_TIMEOUT_MS) || 15000,
  }
}

// ── Esquemas (Zod) de las respuestas: solo los campos que se usan; lo demás se ignora ──
const Price = z.object({ price: z.number(), compare_at_price: z.number().nullish(), currency: z.string() })
const Offer = z.object({ url: z.string(), domain: z.string(), price: Price, availability: z.string().nullish() })
const OptionValue = z.object({ label: z.string(), exists: z.boolean().nullish(), available: z.string().nullish(), product_id: z.string().nullish() })
export const C3Product = z.object({
  id: z.string().min(1), title: z.string(), description: z.string().nullish(),
  brands: z.array(z.object({ id: z.string().nullish(), name: z.string() })).nullish(),
  images: z.array(z.object({ url: z.string(), is_main_image: z.boolean().nullish(), shot_type: z.string().nullish() })).nullish(),
  category: z.object({ slug: z.string(), title: z.string().nullish(), path: z.array(z.object({ slug: z.string(), title: z.string().nullish() })).nullish() }).nullish(),
  gender: z.string().nullish(), age: z.string().nullish(), materials: z.array(z.string()).nullish(), key_features: z.array(z.string()).nullish(),
  colors: z.array(z.object({ hex: z.string(), percentage: z.number().nullish() })).nullish(),
  offers: z.array(Offer).nullish(),
  variants: z.object({ options: z.array(z.object({ name: z.string(), values: z.array(OptionValue) })), selected: z.array(z.object({ name: z.string(), label: z.string() })).nullish() }).nullish(),
  structured_attributes: z.record(z.string(), z.array(z.string())).nullish(),
})
export type C3ProductT = z.infer<typeof C3Product>
const SearchResponse = z.object({ products: z.array(z.unknown()), next_page_token: z.string().nullish() })
const Website = z.object({ id: z.string(), name: z.string().nullish(), url: z.string(), countries: z.array(z.string()).nullish() })
const WebsitesResponse = z.object({ websites: z.array(Website) })

// ── Consumo: llamadas, tipo, tiempo, errores y créditos estimados (lo registra el servicio en ai_runs) ──
export interface C3Call { op: 'search' | 'product' | 'lookup' | 'websites'; status: number | 'error'; ms: number; credits: number }
export class Channel3Meter {
  calls: C3Call[] = []
  add(c: C3Call) { this.calls.push(c) }
  summary() {
    const by: Record<string, number> = {}
    for (const c of this.calls) by[c.op] = (by[c.op] ?? 0) + 1
    const credits = this.calls.reduce((s, c) => s + c.credits, 0)
    return { calls: this.calls.length, by_op: by, credits, est_usd: Math.round(credits * C3_CREDIT_USD * 1000) / 1000, ms: this.calls.reduce((s, c) => s + c.ms, 0), errors: this.calls.filter((c) => c.status === 'error' || (typeof c.status === 'number' && c.status >= 400)).length }
  }
}
const CREDITS: Record<C3Call['op'], number> = { search: 1, lookup: 1, product: 0, websites: 0 }

type Fetcher = typeof fetch
interface Deps { fetch?: Fetcher; meter?: Channel3Meter; sleep?: (ms: number) => Promise<void> }
/** La URL base solo puede ser la oficial (https) o un host de pruebas permitido: la clave nunca sale hacia otro sitio. */
async function baseOf(cfg: Channel3Config) {
  if (cfg.baseUrl === DEFAULT_BASE) return DEFAULT_BASE
  const allowed = (process.env.SHOPPING_FETCH_ALLOW_HOSTS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  const u = new URL(cfg.baseUrl)
  if (!allowed.includes(`${u.hostname}:${u.port || (u.protocol === 'https:' ? '443' : '80')}`)) throw new Channel3Error('CHANNEL3_BASE_URL solo admite la API oficial (o un host de pruebas permitido).', 'unconfigured')
  await checkUrl(cfg.baseUrl)
  return cfg.baseUrl.replace(/\/$/, '')
}

/** Petición a la API: tiempo limitado, 429 → espera Retry-After y un único reintento; errores sin exponer la clave. */
export async function c3request(cfg: Channel3Config, op: C3Call['op'], path: string, init: { method?: 'GET' | 'POST'; body?: unknown; query?: Record<string, string | undefined> } = {}, deps: Deps = {}): Promise<unknown> {
  if (!cfg.key) throw new Channel3Error('Channel3 no está configurado (CHANNEL3_API_KEY).', 'unconfigured')
  const f = deps.fetch ?? fetch
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))
  const url = new URL(path, (await baseOf(cfg)) + '/')
  for (const [k, v] of Object.entries(init.query ?? {})) if (v != null && v !== '') url.searchParams.set(k, v)
  for (let attempt = 0; attempt < 2; attempt++) {
    const t0 = Date.now()
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), cfg.mode === 'agentic' && op === 'search' ? cfg.timeoutMs * 2 : cfg.timeoutMs)
    let res: Response
    try {
      res = await f(url, { method: init.method ?? 'GET', redirect: 'error', signal: ctrl.signal, headers: { 'x-api-key': cfg.key, accept: 'application/json', ...(init.body ? { 'content-type': 'application/json' } : {}) }, body: init.body ? JSON.stringify(init.body) : undefined })
    } catch (e) {
      deps.meter?.add({ op, status: 'error', ms: Date.now() - t0, credits: 0 })
      throw new Channel3Error((e as Error).name === 'AbortError' ? 'Channel3 tarda demasiado en responder.' : 'No se pudo conectar con Channel3.', 'timeout')
    } finally { clearTimeout(timer) }
    deps.meter?.add({ op, status: res.status, ms: Date.now() - t0, credits: res.ok ? CREDITS[op] : 0 })
    if (res.status === 429) {
      const ra = Math.min(30, Number(res.headers.get('retry-after')) || 5)
      if (attempt === 0 && ra <= 5) { await sleep(ra * 1000); continue }
      throw new Channel3Error(`Channel3 limita las consultas: inténtalo en ${ra} s.`, 'rate_limited', ra)
    }
    if (res.status === 401 || res.status === 403) throw new Channel3Error('Channel3 rechaza la clave (revisa CHANNEL3_API_KEY).', 'auth')
    if (res.status === 402) throw new Channel3Error('Channel3: sin créditos disponibles en la cuenta.', 'credits')
    if (res.status === 404) throw new Channel3Error('El producto ya no está en el catálogo de Channel3.', 'not_found')
    if (res.status === 422) throw new Channel3Error('Channel3 rechazó los parámetros de la búsqueda.', 'invalid')
    if (!res.ok) throw new Channel3Error(`Channel3 respondió ${res.status}.`, 'http')
    const text = await res.text()
    if (text.length > 5_000_000) throw new Channel3Error('Respuesta de Channel3 demasiado grande.', 'protocol')
    try { return JSON.parse(text) } catch { throw new Channel3Error('Respuesta de Channel3 ilegible.', 'protocol') }
  }
  throw new Channel3Error('Channel3 limita las consultas.', 'rate_limited')
}

// ── Tiendas: dominio → mercados indexados (gratis, caché 24 h) ──
const websites = new Map<string, { countries: string[]; id: string | null; at: number }>()
export function resetChannel3State() { websites.clear() }
export async function resolveWebsite(cfg: Channel3Config, domain: string, deps: Deps = {}) {
  const hit = websites.get(domain)
  if (hit && Date.now() - hit.at < WEBSITE_TTL_MS) return hit
  const raw = await c3request(cfg, 'websites', 'v1/websites/search', { query: { query: domain, limit: '5' } }, deps)
  const p = WebsitesResponse.safeParse(raw); if (!p.success) throw new Channel3Error('Respuesta de Channel3 (tiendas) con un formato inesperado.', 'protocol')
  const w = p.data.websites.find((x) => (hostOf(`https://${x.url}`) ?? x.url) === domain)
  const v = { countries: (w?.countries ?? []).map((c) => c.toUpperCase()), id: w?.id ?? null, at: Date.now() }
  websites.set(domain, v)
  return v
}
/** Mercado en el que buscar una tienda: el tuyo si Channel3 la tiene ahí; si no (y lo permites), el más cercano disponible. */
export function marketFor(countries: string[], cfg: Pick<Channel3Config, 'country' | 'foreignMarkets'>): string | null {
  if (countries.includes(cfg.country)) return cfg.country
  if (!cfg.foreignMarkets) return null
  return FALLBACK_ORDER.find((c) => countries.includes(c)) ?? countries[0] ?? null
}

// ── Consulta: categoría verificada en la taxonomía de Channel3, colores en hex (una consulta por color: la paleta es AND) ──
/** Slugs comprobados con GET /v1/categories/search (Channel3 rechaza con 422 los que no existen). */
export const C3_CATEGORY: Record<string, string> = {
  trousers: 'pants', chinos: 'pants', cargo: 'pants', joggers: 'pants', jeans: 'jeans-3', shorts: 'shorts',
  shirt: 'shirts-2', tee: 't-shirts-3', polo: 'polos-2', knit: 'sweaters-2', turtleneck: 'sweaters-2', cardigan: 'cardigans-2', hoodie: 'hoodies-3',
  jacket: 'coats-jackets', coat: 'coats-jackets', bomber: 'coats-jackets', parka: 'coats-jackets', puffer: 'coats-jackets', trench: 'coats-jackets', overshirt: 'coats-jackets', denim_jacket: 'coats-jackets', leather_jacket: 'coats-jackets',
  blazer: 'blazers', sneakers: 'sneakers', boots: 'boots',
  'group:bottom': 'pants', 'group:top': 'shirts-tops', 'group:outerwear': 'outerwear',
}
const EN_KIND: Record<string, string> = {
  trousers: 'trousers', chinos: 'chinos', cargo: 'cargo trousers', joggers: 'joggers', jeans: 'jeans', shorts: 'shorts', shirt: 'shirt', tee: 't-shirt', polo: 'polo shirt',
  knit: 'sweater', turtleneck: 'turtleneck', cardigan: 'cardigan', hoodie: 'hoodie', sweatshirt: 'sweatshirt', jacket: 'jacket', coat: 'coat', bomber: 'bomber jacket', parka: 'parka',
  puffer: 'puffer jacket', trench: 'trench coat', overshirt: 'overshirt', blazer: 'blazer', sneakers: 'sneakers', boots: 'boots', loafers: 'loafers',
  'group:bottom': 'trousers', 'group:top': 'top', 'group:outerwear': 'jacket', 'group:footwear': 'shoes',
}
const EN_COLOR: Record<string, string> = { 'Azul marino': 'navy', 'Azul claro': 'light blue', 'Gris claro': 'light grey', Antracita: 'charcoal', Gris: 'grey', Negro: 'black', Blanco: 'white', Crudo: 'ecru', Beige: 'beige', Camel: 'camel', Marrón: 'brown', Caqui: 'khaki', Oliva: 'olive', 'Verde bosque': 'forest green', Burdeos: 'burgundy', Rojo: 'red', Rosa: 'pink', Verde: 'green', Denim: 'denim', 'Denim claro': 'light denim' }
const kindKey = (q: ProductSearchQuery) => q.subcategory ?? (q.category ? `group:${q.category}` : null)
export function hexOf(color: string) { const h = COLOR_SWATCH[color]; return h && /^#[0-9a-f]{6}$/i.test(h) ? h.toLowerCase() : null }

/** Cuerpo de POST /v1/search para una consulta y un mercado. Texto en español en España; en inglés en mercados anglosajones. */
export function buildSearchBody(q: ProductSearchQuery, market: string, domains: string[], cfg: Channel3Config, sizes?: { key: 'size' | 'shoe-size'; values: string[] } | null) {
  const key = kindKey(q)
  const color = detectColors(q.text).find((c) => hexOf(c)) ?? null
  const local = market === cfg.country
  const text = local ? q.text : [color ? EN_COLOR[color] : null, (key && EN_KIND[key]) ?? q.text, 'men'].filter(Boolean).join(' ')
  // Moda masculina adulta en la propia petición (y validación posterior sobre cada producto)
  const filters: Record<string, unknown> = { gender: 'male', age: ['adult'], website_ids: domains }
  const cat = key ? C3_CATEGORY[key] : null
  if (cat) filters.category_ids = [cat]
  // Tallas (prefiltro, solo en tu mercado): los valores de Channel3 no llevan sistema de tallaje (un «42» EU no es un 42 de
  // EE. UU.), así que fuera de tu mercado no se filtra; la comprobación real es siempre local, por variante
  const attrs = { ...(local && cat ? q.c3_attributes ?? {} : {}), ...(local && cat && sizes?.values.length ? { [sizes.key]: sizes.values } : {}) }
  if (Object.keys(attrs).length) filters.attributes = attrs
  // Un solo color por consulta (la paleta de Channel3 es una condición AND); el motor 4C evalúa después si te favorece
  if (color) filters.colors = { palette: [{ hex: hexOf(color)! }], match: 'loose' }
  // El rango de precio solo tiene sentido en tu moneda
  if (local && (q.price_min != null || q.price_max != null)) filters.price = { ...(q.price_min != null ? { min_price: q.price_min } : {}), ...(q.price_max != null ? { max_price: q.price_max } : {}) }
  const config: Record<string, unknown> = { country: market, mode: cfg.mode }
  if (local) { config.language = cfg.language; config.currency = cfg.currency }
  return { query: text, limit: C3_SEARCH_LIMIT, filters, config }
}

// ── Normalización: producto Channel3 → producto normalizado (procedencia por campo) ──
const lab = (hex: string) => {
  const n = parseInt(hex.slice(1), 16); const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 })
  const [x, y, z2] = [(c[0] * 0.4124 + c[1] * 0.3576 + c[2] * 0.1805) / 0.95047, c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722, (c[0] * 0.0193 + c[1] * 0.1192 + c[2] * 0.9505) / 1.08883]
  const g = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  return [116 * g(y) - 16, 500 * (g(x) - g(y)), 200 * (g(y) - g(z2))]
}
/** Color con nombre más cercano a un hex (ΔE en Lab). Es una DEDUCCIÓN a partir de la imagen: nunca un dato publicado. */
export function nearestColor(hex: string): string | null {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return null
  const a = lab(hex)
  let best: { c: string; d: number } | null = null
  for (const c of GARMENT_COLORS) { const h = hexOf(c); if (!h) continue; const b = lab(h); const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); if (!best || d < best.d) best = { c, d } }
  return best && best.d < 25 ? best.c : null
}
const AVAIL: Record<string, string> = { InStock: 'in stock', OutOfStock: 'out of stock' }
const SIZE_OPT = /^(size|talla|taille|größe|tamaño)$/i
const BOTTOM_FIT: Record<string, { cut?: string; silhouette?: string }> = { straight: { cut: 'Recto' }, 'straight leg': { cut: 'Recto' }, regular: { cut: 'Recto' }, slim: { cut: 'Slim' }, skinny: { cut: 'Slim' }, tapered: { cut: 'Tapered' }, wide: { cut: 'Wide' }, 'wide leg': { cut: 'Wide' }, loose: { cut: 'Wide' }, baggy: { cut: 'Wide' }, relaxed: { silhouette: 'Amplia' } }
const TOP_FIT: Record<string, string> = { slim: 'Ajustada', 'muscle fit': 'Ajustada', fitted: 'Ajustada', regular: 'Regular', relaxed: 'Amplia', oversized: 'Amplia', loose: 'Amplia', boxy: 'Amplia' }

export interface C3Meta { provider: 'channel3'; channel3_id: string; gender: string | null; age: string | null; category_path: string[]; selected_color: string | null; domain: string | null; market: string; market_name: string; foreign_market: boolean; fetched_at: string; previous_price: { amount: number; currency: string; source: 'channel3' } | null; image_colors: string[]; key_features: string[]; attributes: Record<string, string[]> }
/** Normaliza un producto de Channel3. `domain` elige la oferta de esa tienda (si hay varias). */
export function normalizeChannel3Product(raw: unknown, opts: { market: string; cfg: Pick<Channel3Config, 'country'>; domain?: string | null; now?: Date }): NormalizedProduct | null {
  const parsed = C3Product.safeParse(raw); if (!parsed.success) return null
  const p = parsed.data
  const now = opts.now ?? new Date(); const at = now.toISOString()
  const offers = p.offers ?? []
  const offer = (opts.domain ? offers.find((o) => o.domain === opts.domain || o.domain.endsWith('.' + opts.domain)) : null) ?? offers[0] ?? null
  const attrs = p.structured_attributes ?? {}
  const sizeOpt = p.variants?.options.find((o) => SIZE_OPT.test(o.name))
  const declaredColor = attrs.color?.[0] ?? null
  const n = normalizeProduct({
    name: p.title, external_id: p.id, url: null, description: p.description ?? null, brand: p.brands?.[0]?.name ?? null,
    category_text: [...(p.category?.path ?? []).map((x) => x.title ?? x.slug), p.category?.title].filter(Boolean).join(' > ') || null,
    color: declaredColor, material: (p.materials ?? []).join(', ') || null,
    price: offer?.price.price ?? null, currency: offer?.price.currency ?? null, availability: offer?.availability ? AVAIL[offer.availability] ?? null : null,
    images: (p.images ?? []).slice().sort((a, z) => Number(!!z.is_main_image) - Number(!!a.is_main_image)).map((i) => i.url),
    variants: (sizeOpt?.values ?? []).filter((v) => v.exists !== false).map((v) => ({ size: v.label, availability: v.available ? AVAIL[v.available] ?? null : null })),
  }, 'api', 'channel3', now)
  if (!n) return null
  // Lo publicado llega por Channel3 (origen «channel3»); lo deducido por reglas queda como «Deducido»
  if (!declaredColor && n.field_sources.primary_color?.source === 'channel3') n.field_sources.primary_color = { source: 'derived', at }
  const imageColors = (p.colors ?? []).map((c) => c.hex.toLowerCase())
  if (!n.primary_color) {
    const fromDesc = detectColors(p.description ?? '')[0] ?? null
    const fromImg = !fromDesc && imageColors[0] ? nearestColor(imageColors[0]) : null
    const c = fromDesc ?? fromImg
    if (c) { n.primary_color = c; n.colors = [c]; n.field_sources.primary_color = { source: fromImg ? 'photo' : 'derived', at } }
  }
  // Corte/silueta: el atributo «fit» de Channel3 tiene prioridad sobre lo deducido del nombre
  const fits = (attrs.fit ?? []).map((x) => x.toLowerCase())
  if (n.category === 'bottom' && fits.length) {
    const m = fits.map((f) => BOTTOM_FIT[f]).filter(Boolean)
    const cut = m.find((x) => x!.cut)?.cut, sil = m.find((x) => x!.silhouette)?.silhouette
    if (cut) { n.cut = cut; n.field_sources.cut = { source: 'channel3', at } }
    if (sil) { n.silhouette = sil; n.field_sources.silhouette = { source: 'channel3', at } }
  } else if (n.category && ['top', 'outerwear', 'tailoring'].includes(n.category)) {
    const sil = fits.map((f) => TOP_FIT[f]).find(Boolean)
    if (sil) { n.silhouette = sil; n.field_sources.silhouette = { source: 'channel3', at } }
  }
  if (n.variants.length && !n.variants.some((v) => v.availability !== 'unknown')) for (const v of n.variants) v.availability = 'unknown'
  // Identidad estable: el ID de Channel3 (las URL de oferta son temporales y no se guardan)
  n.canonical_url = `channel3:${p.id}`
  n.product_url = null; delete n.field_sources.product_url
  const prev = offer?.price.compare_at_price
  const meta: C3Meta = {
    provider: 'channel3', channel3_id: p.id, gender: p.gender ?? null, age: p.age ?? null,
    category_path: [...(p.category?.path ?? []).map((x) => x.slug), ...(p.category && !(p.category.path ?? []).some((x) => x.slug === p.category!.slug) ? [p.category.slug] : [])],
    selected_color: p.variants?.selected?.find((x) => /^(color|colour)$/i.test(x.name))?.label ?? null, domain: offer?.domain ?? opts.domain ?? null, market: opts.market, market_name: MARKET_NAME[opts.market] ?? opts.market,
    foreign_market: opts.market !== opts.cfg.country, fetched_at: at,
    previous_price: prev && offer && prev > offer.price.price ? { amount: prev, currency: offer.price.currency, source: 'channel3' } : null,
    image_colors: imageColors.slice(0, 4), key_features: (p.key_features ?? []).slice(0, 8),
    attributes: Object.fromEntries(Object.entries(attrs).filter(([k]) => ['fit', 'color', 'fabric', 'pattern', 'pants-length-type', 'sleeve-length-type', 'neckline'].includes(k)).map(([k, v]) => [k, v.slice(0, 4)])),
  }
  n.raw_attributes = meta as never
  return n
}
export const isChannel3 = (p: { raw_attributes?: unknown }): boolean => (p.raw_attributes as C3Meta | undefined)?.provider === 'channel3'

// ── ProductSource ──
export function channel3Source(retailers: RetailerRef[], cfg: Channel3Config = channel3Config(), deps: Deps = {}, opts: { sizesFor?: (q: ProductSearchQuery) => { key: 'size' | 'shoe-size'; values: string[] } | null; localOnly?: boolean; budget?: () => number } = {}) {
  const label = 'Channel3'
  const shopsFor = (q: ProductSearchQuery) => retailers.filter((r) => !q.excluded.includes(r.slug) && (!q.retailers.length || q.retailers.includes(r.slug)))
  /** Tiendas agrupadas por el mercado en el que se consultan (las no indexadas en ninguno se omiten). */
  async function plan(q: ProductSearchQuery) {
    const groups = new Map<string, { domains: string[]; shops: RetailerRef[] }>(); const skipped: string[] = []
    for (const r of shopsFor(q)) {
      const domain = r.domains[0]; if (!domain) continue
      const w = await resolveWebsite(cfg, domain, deps)
      const m = marketFor(w.countries, cfg)
      if (!m) { skipped.push(r.name); continue }
      const g = groups.get(m) ?? { domains: [], shops: [] }; g.domains.push(domain); g.shops.push(r); groups.set(m, g)
    }
    return { groups, skipped }
  }
  async function getById(id: string, opts: { market?: string; domain?: string | null } = {}) {
    const market = opts.market ?? cfg.country
    const local = market === cfg.country
    const raw = await c3request(cfg, 'product', `v1/products/${encodeURIComponent(id)}`, { query: { country: market, ...(local ? { language: cfg.language, currency: cfg.currency } : {}), website_ids: opts.domain ? JSON.stringify([opts.domain]) : undefined } }, deps)
    const n = normalizeChannel3Product(raw, { market, cfg, domain: opts.domain ?? null })
    if (!n) throw new Channel3Error('Ficha de Channel3 con un formato inesperado.', 'protocol')
    return { product: n, offerUrl: offerUrlOf(raw, opts.domain ?? null) }
  }
  return {
    kind: 'api' as const, id: null, label,
    available: () => (cfg.key ? { ok: true } : { ok: false, reason: 'Channel3 no está configurado (CHANNEL3_API_KEY).' }),
    plan,
    async searchProducts(q: ProductSearchQuery): Promise<SearchHit[]> {
      const { groups } = await plan(q)
      const hits: SearchHit[] = []
      for (const [market, g] of groups) {
        // Búsqueda estratégica: solo el mercado local (el stock de otro mercado no se puede confirmar para ti) y con tope de créditos
        if (opts.localOnly && market !== cfg.country) continue
        if (opts.budget && opts.budget() <= 0) throw new Channel3Error('Presupuesto de Channel3 de esta estrategia agotado.', 'credits')
        const raw = await c3request(cfg, 'search', 'v1/search', { method: 'POST', body: buildSearchBody(q, market, g.domains, cfg, opts.sizesFor?.(q) ?? null) }, deps)
        const sr = SearchResponse.safeParse(raw); if (!sr.success) throw new Channel3Error('Respuesta de Channel3 (búsqueda) con un formato inesperado.', 'protocol')
        for (const item of sr.data.products) {
          const n = normalizeChannel3Product(item, { market, cfg }); if (!n) continue
          const retailer = retailerForUrl(`https://${(n.raw_attributes as unknown as C3Meta).domain ?? ''}`, g.shops)
          if (!retailer) continue   // solo ofertas de las tiendas pedidas
          if (n.category && q.category && n.category !== q.category) continue
          hits.push({ ...n, retailer, source_label: label, source_id: null, match: matchProduct(n, { ...q, colors: [], price_min: null, price_max: null }) })
        }
      }
      return hits
    },
    /** URL de producto → ficha, solo si ya está en el catálogo de Channel3 (no se pide que lea la página de la tienda). */
    async getProduct(url: string): Promise<ImportResult> {
      const retailer = retailerForUrl(url, retailers)
      try {
        const raw = await c3request(cfg, 'lookup', 'v1/lookup', { method: 'POST', body: { url, realtime_fetch: false } }, deps)
        const prod = (raw as { product?: unknown })?.product
        const n = prod ? normalizeChannel3Product(prod, { market: cfg.country, cfg, domain: hostOf(url) }) : null
        if (!n) return { ok: false, reason: 'no_metadata', retailer, url, message: 'Channel3 no tiene ese producto en su catálogo.' }
        return { ok: true, product: n, retailer, how: 'channel3', note: `Datos del catálogo de Channel3, consultados el ${new Date().toLocaleString('es-ES')}.` }
      } catch (e) {
        if (e instanceof Channel3Error) return { ok: false, reason: e.code === 'not_found' ? 'no_metadata' : 'blocked', retailer, url, message: e.code === 'not_found' ? 'Channel3 no tiene ese producto en su catálogo.' : e.message }
        throw e
      }
    },
    getById,
  }
}
/** Enlace de compra ACTUAL (temporal) de la oferta de esa tienda; se pide en el momento del clic y no se guarda. */
export function offerUrlOf(raw: unknown, domain: string | null): string | null {
  const p = C3Product.safeParse(raw); if (!p.success) return null
  const o = (domain ? p.data.offers?.find((x) => x.domain === domain) : null) ?? p.data.offers?.[0]
  if (!o) return null
  try { const u = new URL(o.url); return u.protocol === 'https:' ? u.toString() : null } catch { return null }
}
export type Channel3Source = ReturnType<typeof channel3Source>
/**
 * Producto tal como lo recibe el motor 4C: un precio en otra moneda (mercado extranjero) no se compara con tu presupuesto
 * en tu moneda, así que para la evaluación queda como desconocido (neutro). No hay conversión de divisas: no se inventa.
 */
export function forEvaluation<T extends { current_price?: unknown; currency?: string | null }>(p: T, currency = 'EUR'): { product: T; foreign: boolean } {
  const foreign = p.current_price != null && !!p.currency && p.currency !== currency
  return { product: foreign ? { ...p, current_price: null } : p, foreign }
}
export const channel3Label = (m: C3Meta) => (m.foreign_market ? `Precio de otro mercado (${m.market_name}), no verificado para España` : null)
