import type { RawProduct, RawVariant } from './normalize'

/**
 * Extracción de una página de producto: SOLO metadatos públicos que la tienda publica para máquinas
 * (schema.org Product/ProductGroup en JSON-LD y OpenGraph). No se recorre el resto del HTML ni se siguen enlaces.
 */
type J = Record<string, any>
const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&')
const arr = <T>(v: T | T[] | undefined | null): T[] => (v == null ? [] : Array.isArray(v) ? v : [v])
const typeIs = (o: J, t: string) => arr(o?.['@type']).some((x) => String(x).toLowerCase() === t.toLowerCase())
const text = (v: unknown): string | null => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : v && typeof v === 'object' && 'name' in (v as J) ? text((v as J).name) : null)

/** Bloques JSON-LD de la página (los que no son JSON válido se ignoran). */
export function jsonLdBlocks(html: string): J[] {
  const out: J[] = []
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { const v = JSON.parse(m[1].trim()); for (const x of arr(v)) { out.push(x); for (const g of arr((x as J)['@graph'])) out.push(g) } } catch { /* bloque inválido */ }
  }
  return out
}
/** Metadatos OpenGraph / product:* (property o name). */
export function metaTags(html: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of html.matchAll(/<meta\s+([^>]+?)\/?>/gi)) {
    const attrs = Object.fromEntries([...m[1].matchAll(/([a-zA-Z:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)].map((a) => [a[1].toLowerCase(), decode(a[3] ?? a[4] ?? '')]))
    const k = (attrs.property ?? attrs.name ?? '').toLowerCase()
    if (k && attrs.content != null && !(k in out)) out[k] = attrs.content
  }
  return out
}

function offersOf(o: J) {
  const offers = arr(o.offers).flatMap((x: J) => (typeIs(x, 'AggregateOffer') ? [{ ...x, price: x.lowPrice ?? x.price }, ...arr(x.offers)] : [x]))
  return offers.filter(Boolean) as J[]
}
function fromProduct(o: J, variants: RawVariant[] = []): RawProduct {
  const offer = offersOf(o)[0] ?? {}
  const images = arr(o.image).map((x: any) => (typeof x === 'string' ? x : x?.url ?? x?.contentUrl)).filter(Boolean)
  return {
    name: text(o.name), brand: text(o.brand), description: text(o.description), external_id: text(o.sku ?? o.productID ?? o.mpn ?? o.productGroupID),
    category_text: text(o.category), color: text(o.color), material: text(o.material), price: offer.price ?? offer.priceSpecification?.price ?? null,
    currency: text(offer.priceCurrency ?? offer.priceSpecification?.priceCurrency), availability: text(offer.availability), images, url: text(o.url ?? offer.url), variants,
  }
}
const variantOf = (v: J): RawVariant => { const of = offersOf(v)[0] ?? {}; return { size: text(v.size), color: text(v.color), sku: text(v.sku), availability: text(of.availability), price: of.price ?? null } }

/** Producto de la página o null si la tienda no publica metadatos de producto. `how` indica qué se ha usado. */
export function extractProduct(html: string, pageUrl: string): { product: RawProduct; how: 'json-ld' | 'opengraph' } | null {
  const blocks = jsonLdBlocks(html)
  const group = blocks.find((b) => typeIs(b, 'ProductGroup'))
  if (group) {
    const vs = arr(group.hasVariant).filter((v: J) => typeIs(v, 'Product')) as J[]
    const p = fromProduct(group, vs.map(variantOf))
    if (p.price == null && vs[0]) { const of = offersOf(vs[0])[0] ?? {}; p.price = of.price; p.currency = text(of.priceCurrency); p.availability = text(of.availability) }
    if (!p.images?.length && vs[0]) p.images = arr(vs[0].image).map((x: any) => (typeof x === 'string' ? x : x?.url)).filter(Boolean)
    if (!p.color) p.color = text(vs[0]?.color)
    if (!p.material) p.material = text(vs[0]?.material)
    return { product: { ...p, url: p.url ?? pageUrl }, how: 'json-ld' }
  }
  const prod = blocks.find((b) => typeIs(b, 'Product'))
  if (prod) return { product: { ...fromProduct(prod), url: text(prod.url) ?? pageUrl }, how: 'json-ld' }
  const m = metaTags(html)
  const isProduct = /product/i.test(m['og:type'] ?? '') || m['product:price:amount'] || m['og:price:amount']
  if (!isProduct || !m['og:title']) return null
  return {
    product: {
      name: m['og:title'], description: m['og:description'] ?? m.description ?? null, url: m['og:url'] ?? pageUrl, images: m['og:image'] ? [m['og:image']] : [],
      price: m['product:price:amount'] ?? m['og:price:amount'] ?? null, currency: m['product:price:currency'] ?? m['og:price:currency'] ?? null,
      availability: m['product:availability'] ?? m['og:availability'] ?? null, brand: m['product:brand'] ?? m['og:site_name'] ?? null, color: m['product:color'] ?? null,
      material: m['product:material'] ?? null, external_id: m['product:retailer_item_id'] ?? null,
    }, how: 'opengraph',
  }
}
