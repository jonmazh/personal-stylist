import type { RawProduct } from './normalize'
import { FETCH_LIMITS } from './taxonomy'

/**
 * Feeds autorizados (programas de afiliación, catálogos que te cede una marca): CSV/TSV, JSON o XML (Google Merchant / RSS).
 * Se reconocen las columnas habituales (Google Merchant, Awin, Clickwise…). Las filas con el mismo item_group_id se
 * agrupan como variantes (tallas y colores) de un mismo producto.
 */
type Row = Record<string, string>
const KEYS: Record<keyof RawProduct | 'group' | 'size' | 'sale_price', string[]> = {
  name: ['title', 'product_name', 'name', 'nombre'], description: ['description', 'product_short_description', 'descripcion'],
  url: ['link', 'aw_deep_link', 'merchant_deep_link', 'deeplink', 'product_url', 'url', 'enlace'],
  images: ['image_link', 'aw_image_url', 'merchant_image_url', 'large_image', 'image', 'image_url', 'imagen'],
  price: ['price', 'search_price', 'store_price', 'precio'], sale_price: ['sale_price', 'precio_oferta'], currency: ['currency', 'moneda'],
  availability: ['availability', 'stock_status', 'in_stock', 'disponibilidad'], brand: ['brand', 'brand_name', 'marca'],
  color: ['color', 'colour'], material: ['material', 'composition', 'composicion', 'fabric'], category_text: ['product_type', 'merchant_category', 'category_name', 'category', 'categoria', 'google_product_category'],
  external_id: ['id', 'aw_product_id', 'merchant_product_id', 'sku', 'gtin'], group: ['item_group_id', 'parent_product_id', 'group_id'], size: ['size', 'talla'],
  variants: [], retailer_name: ['merchant_name', 'store', 'tienda'],
}
const pick = (r: Row, k: keyof typeof KEYS) => { for (const c of KEYS[k]) { const v = r[c]; if (v != null && String(v).trim() !== '') return String(v).trim() } return null }

/** CSV con comillas (RFC 4180); detecta coma, punto y coma, tabulador o barra vertical. */
export function parseCsv(text: string): Row[] {
  const head = text.slice(0, text.indexOf('\n') > 0 ? text.indexOf('\n') : text.length)
  const sep = ['\t', ';', '|', ','].sort((a, z) => head.split(z).length - head.split(a).length)[0]
  const rows: string[][] = []; let row: string[] = [], cell = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++ } else q = false } else cell += c; continue }
    if (c === '"') q = true
    else if (c === sep) { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some((x) => x.trim())) rows.push(row); row = [] }
    else cell += c
  }
  row.push(cell); if (row.some((x) => x.trim())) rows.push(row)
  const [h, ...rest] = rows; if (!h) return []
  const cols = h.map((x) => x.trim().toLowerCase().replace(/^\ufeff/, '').replace(/^g:/, ''))
  return rest.map((r) => Object.fromEntries(cols.map((c, i) => [c, (r[i] ?? '').trim()])))
}
export function parseJsonFeed(text: string): Row[] {
  const v = JSON.parse(text)
  const list = Array.isArray(v) ? v : v.products ?? v.items ?? v.data ?? v.entries ?? []
  return (Array.isArray(list) ? list : []).map((o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).map(([k, x]) => [k.toLowerCase().replace(/^g:/, ''), Array.isArray(x) ? String(x[0] ?? '') : x != null && typeof x === 'object' ? String((x as Record<string, unknown>).value ?? (x as Record<string, unknown>).name ?? '') : String(x ?? '')])))
}
const xmlDecode = (s: string) => s.replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim()
export function parseXmlFeed(text: string): Row[] {
  const items = [...text.matchAll(/<(item|entry|product)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => m[2])
  return items.map((body) => {
    const r: Row = {}
    for (const m of body.matchAll(/<([a-zA-Z_:][\w:.-]*)\b[^>]*>([\s\S]*?)<\/\1>/g)) { const k = m[1].toLowerCase().replace(/^g:/, ''); if (!(k in r)) r[k] = xmlDecode(m[2]) }
    for (const m of body.matchAll(/<link\b[^>]*href="([^"]+)"[^>]*\/?>/gi)) if (!r.link) r.link = m[1]
    return r
  })
}
export function detectFormat(text: string, hint?: string | null): 'csv' | 'json' | 'xml' {
  if (hint === 'csv' || hint === 'json' || hint === 'xml') return hint
  const t = text.trimStart()
  return t.startsWith('{') || t.startsWith('[') ? 'json' : t.startsWith('<') ? 'xml' : 'csv'
}

/** Feed → productos «crudos» (agrupando variantes). Lanza Error con un mensaje legible si el feed no se entiende. */
export function parseFeed(text: string, format?: string | null): RawProduct[] {
  const f = detectFormat(text, format)
  let rows: Row[]
  try { rows = f === 'json' ? parseJsonFeed(text) : f === 'xml' ? parseXmlFeed(text) : parseCsv(text) } catch { throw new Error(`El feed no es un ${f.toUpperCase()} válido.`) }
  const byGroup = new Map<string, RawProduct>(); const out: RawProduct[] = []
  for (const r of rows.slice(0, FETCH_LIMITS.feedMaxItems * 4)) {
    const name = pick(r, 'name'); if (!name) continue
    const sale = pick(r, 'sale_price'), size = pick(r, 'size'), availability = pick(r, 'availability')
    const p: RawProduct = {
      name, description: pick(r, 'description'), url: pick(r, 'url'), images: [pick(r, 'images')].filter(Boolean) as string[], price: sale ?? pick(r, 'price'),
      currency: pick(r, 'currency'), availability: availability === '1' || availability === 'yes' ? 'in stock' : availability === '0' || availability === 'no' ? 'out of stock' : availability,
      brand: pick(r, 'brand'), color: pick(r, 'color'), material: pick(r, 'material'), category_text: pick(r, 'category_text'), external_id: pick(r, 'external_id'), retailer_name: pick(r, 'retailer_name'),
      variants: size ? [{ size, color: pick(r, 'color'), sku: pick(r, 'external_id'), availability: availability ?? null, price: sale ?? pick(r, 'price') }] : [],
    }
    const g = pick(r, 'group')
    const prev = g ? byGroup.get(g) : undefined
    if (prev) { prev.variants = [...(prev.variants ?? []), ...(p.variants ?? [])]; if (prev.availability !== 'in stock' && /in.?stock/i.test(String(p.availability))) prev.availability = p.availability; continue }
    if (g) { byGroup.set(g, p); p.external_id = g }
    out.push(p)
    if (out.length >= FETCH_LIMITS.feedMaxItems) break
  }
  return out
}
