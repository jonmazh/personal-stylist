import { createHash } from 'node:crypto'
import { z } from 'zod'
import { WardrobeError, type Sb } from '@/lib/wardrobe/service'
import { GARMENT_COLORS, SUBS } from '@/lib/wardrobe/taxonomy'
import { NeedSpec } from './taxonomy'
import { AVAILABILITY, FETCH_LIMITS, STALE_DAYS, type Availability } from './catalog/taxonomy'
import { canonicalUrl, normalizeProduct, retailerForUrl, type NormalizedProduct } from './catalog/normalize'
import { FetchBlocked, safeFetch } from './catalog/net'
import { parseFeed } from './catalog/feed'
import { queryFromNeed, queryFromText, type ProductSearchQuery } from './catalog/query'
import { feedSource, manualProduct, searchAll, searchProviderConfig, searchProviderSource, urlImportSource, type ProductSource, type RetailerRef, type SearchHit } from './catalog/sources'

/** Product Discovery (fase 4B): tiendas, fuentes autorizadas, búsqueda, importación y catálogo de candidatos. */
type Row = Record<string, any>
const ids = <T extends { id: string }>(xs: readonly T[]) => xs.map((x) => x.id) as [string, ...string[]]
const dbErr = (m: string) => new WardrobeError(/schema cache|does not exist/i.test(m) ? 'Ejecuta la migración 0017 en Supabase.' : m, 500)
const zmsg = (e: z.ZodError) => e.issues.map((i) => `${i.path.join('.') || 'dato'}: ${i.message}`).join('; ')
const CACHE_HOURS = 24

// ── Tiendas ──
export async function listRetailers(sb: Sb): Promise<(RetailerRef & { user_id: string | null; group_name: string | null; market: string })[]> {
  const { data, error } = await sb.from('retailers').select('*').order('user_id', { nullsFirst: true }).order('name')
  if (error) { if (/schema cache|does not exist/i.test(error.message)) return []; throw dbErr(error.message) }
  return (data ?? []) as never
}
/** Solo en pruebas automáticas (SHOPPING_FETCH_ALLOW_HOSTS) se admite un host local como «dominio» de una tienda. */
const testHosts = () => (process.env.SHOPPING_FETCH_ALLOW_HOSTS ?? '').split(',').map((h) => h.trim().split(':')[0]).filter(Boolean)
const domainRe = /^(?!-)[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})+$/
export const RetailerInput = z.object({
  name: z.string().trim().min(1, 'Ponle un nombre').max(80),
  domains: z.array(z.string().trim().toLowerCase().transform((d) => d.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')).refine((d) => domainRe.test(d) || testHosts().includes(d), 'Dominio no válido')).min(1, 'Indica al menos un dominio').max(5),
  url_policy: z.enum(['metadata', 'manual_only']).default('manual_only'),
  policy_note: z.string().trim().max(400).nullable().optional(),
})
export async function addRetailer(sb: Sb, uid: string, raw: unknown) {
  const p = RetailerInput.safeParse(raw); if (!p.success) throw new WardrobeError(zmsg(p.error))
  const slug = p.data.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'tienda'
  const existing = await listRetailers(sb)
  if (existing.some((r) => r.domains.some((d) => p.data.domains.includes(d)))) throw new WardrobeError('Ese dominio ya pertenece a una tienda de la lista.')
  const { data, error } = await sb.from('retailers').insert({ ...p.data, slug: `u-${slug}`.slice(0, 40), user_id: uid }).select('id').single()
  if (error) throw new WardrobeError(/duplicate|unique/i.test(error.message) ? 'Ya tienes una tienda con ese nombre.' : error.message)
  return data.id as string
}
export async function deleteRetailer(sb: Sb, id: string) {
  const { data } = await sb.from('retailers').delete().eq('id', id).not('user_id', 'is', null).select('id')
  if (!data?.length) throw new WardrobeError('Solo puedes quitar tiendas que hayas añadido tú.', 404)
}

// ── Fuentes autorizadas (feeds) ──
export const SourceInput = z.object({
  name: z.string().trim().min(1, 'Ponle un nombre').max(80), kind: z.enum(['feed']).default('feed'), retailer_id: z.string().uuid().nullable().optional(),
  feed_url: z.string().trim().url('URL no válida').regex(/^https?:\/\//, 'Solo http(s)').max(1000).nullable().optional(), format: z.enum(['csv', 'json', 'xml']).nullable().optional(),
  authorization_note: z.string().trim().min(3, 'Indica quién te autoriza a usar este catálogo (p. ej. «Programa de afiliación de X»)').max(300),
})
export async function listSources(sb: Sb) {
  const { data, error } = await sb.from('product_sources').select('*, retailers(name)').order('created_at')
  if (error) { if (/schema cache|does not exist/i.test(error.message)) return []; throw dbErr(error.message) }
  return data ?? []
}
export async function createSource(sb: Sb, uid: string, raw: unknown) {
  const p = SourceInput.safeParse(raw); if (!p.success) throw new WardrobeError(zmsg(p.error))
  const { data, error } = await sb.from('product_sources').insert({ ...p.data, user_id: uid }).select('id').single()
  if (error) throw new WardrobeError(/row-level/i.test(error.message) ? 'Esa tienda no está disponible.' : error.message)
  return data.id as string
}
export async function deleteSource(sb: Sb, id: string) { const { data } = await sb.from('product_sources').delete().eq('id', id).select('id'); if (!data?.length) throw new WardrobeError('Fuente no encontrada', 404) }

/** Sincroniza un feed (desde su URL o desde el archivo que subes): sustituye sus productos normalizados. */
export async function syncSource(sb: Sb, uid: string, id: string, uploaded?: string | null) {
  const { data: src } = await sb.from('product_sources').select('*').eq('id', id).maybeSingle()
  if (!src) throw new WardrobeError('Fuente no encontrada', 404)
  const fail = async (msg: string) => { await sb.from('product_sources').update({ status: 'error', last_error: msg }).eq('id', id); throw new WardrobeError(msg) }
  let text = uploaded ?? null
  if (!text) {
    if (!src.feed_url) return fail('Sube el archivo del feed o indica su URL.')
    try { const r = await safeFetch(src.feed_url, { maxBytes: FETCH_LIMITS.feedMaxBytes, timeoutMs: 20000 }); if (r.status >= 400) return fail(`El feed respondió ${r.status}.`); text = r.body }
    catch (e) { return fail(e instanceof FetchBlocked ? e.message : 'No se pudo descargar el feed.') }
  }
  if (text.length > FETCH_LIMITS.feedMaxBytes) return fail('El feed es demasiado grande (máx. 4 MB).')
  let raw
  try { raw = parseFeed(text, src.format) } catch (e) { return fail((e as Error).message) }
  const items = raw.map((r) => normalizeProduct(r, 'feed', 'feed')).filter((x): x is NormalizedProduct => !!x)
  if (!items.length) return fail('El feed no contiene productos con nombre.')
  await sb.from('product_feed_items').delete().eq('source_id', id)
  for (let i = 0; i < items.length; i += 500) {
    const { error } = await sb.from('product_feed_items').insert(items.slice(i, i + 500).map((p) => ({ user_id: uid, source_id: id, external_id: p.external_product_id, product: p, search_text: `${p.product_name} ${p.description ?? ''}`.toLowerCase().slice(0, 1000) })))
    if (error) return fail(error.message)
  }
  await sb.from('product_sources').update({ status: 'active', last_error: null, item_count: items.length, last_sync_at: new Date().toISOString() }).eq('id', id)
  return { items: items.length }
}

// ── Búsqueda ──
async function prefsOf(sb: Sb) { const { data } = await sb.from('shopping_preferences').select('preferred_retailers, excluded_retailers').maybeSingle(); return data }
async function buildSources(sb: Sb, retailers: RetailerRef[]): Promise<ProductSource[]> {
  const { data: feeds } = await sb.from('product_sources').select('id, name, retailer_id').eq('kind', 'feed').eq('status', 'active')
  const out: ProductSource[] = []
  for (const f of feeds ?? []) {
    const { data: items } = await sb.from('product_feed_items').select('product').eq('source_id', f.id).limit(FETCH_LIMITS.feedMaxItems)
    out.push(feedSource(f, (items ?? []).map((i) => i.product as NormalizedProduct), retailers, retailers.find((r) => r.id === f.retailer_id) ?? null))
  }
  out.push(searchProviderSource(searchProviderConfig(), retailers))
  return out
}
const slim = (h: SearchHit) => ({ ...h, raw_attributes: {}, description: h.description?.slice(0, 600) ?? null, retailer: h.retailer ? { id: h.retailer.id, slug: h.retailer.slug, name: h.retailer.name, url_policy: h.retailer.url_policy, domains: h.retailer.domains } : null })

/** Busca en las fuentes autorizadas para una necesidad o un texto. Reutiliza la misma búsqueda de las últimas 24 h (caché). */
export async function searchProducts(sb: Sb, uid: string, raw: { need_id?: string | null; text?: string | null; force?: boolean }) {
  const prefs = await prefsOf(sb)
  let q: ProductSearchQuery
  if (raw.need_id) {
    const { data: n } = await sb.from('shopping_needs').select('*').eq('id', raw.need_id).maybeSingle()
    if (!n) throw new WardrobeError('Necesidad no encontrada', 404)
    q = queryFromNeed({ ...n, spec: NeedSpec.parse(n.spec) }, prefs)
  } else {
    const t = (raw.text ?? '').trim(); if (t.length < 3) throw new WardrobeError('Describe qué buscas (al menos 3 letras) o elige una necesidad.')
    q = queryFromText(t, prefs)
  }
  const cache_key = createHash('sha256').update(JSON.stringify(q)).digest('hex').slice(0, 32)
  if (!raw.force) {
    const since = new Date(Date.now() - CACHE_HOURS * 3600e3).toISOString()
    const { data: hit } = await sb.from('shopping_searches').select('*').eq('cache_key', cache_key).gte('created_at', since).order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (hit) return { id: hit.id as string, query: q, results: hit.results as Row[], sources: hit.sources as Row[], cached: true, created_at: hit.created_at as string }
  }
  const retailers = await listRetailers(sb)
  const { results, statuses } = await searchAll(q, await buildSources(sb, retailers))
  const { data: s, error } = await sb.from('shopping_searches').insert({ user_id: uid, need_id: q.need_id, query: q, query_text: q.text, cache_key, sources: statuses, results: results.map(slim), result_count: results.length }).select('id, created_at').single()
  if (error) throw dbErr(error.message)
  await sb.from('ai_runs').insert({ user_id: uid, kind: 'product_search', model: 'reglas', meta: { search_id: s.id, results: results.length, sources: statuses.map((x) => `${x.kind}:${x.status}`) } })
  return { id: s.id as string, query: q, results: results.map(slim) as Row[], sources: statuses as Row[], cached: false, created_at: s.created_at as string }
}
export async function getSearch(sb: Sb, id: string) {
  const { data } = await sb.from('shopping_searches').select('*').eq('id', id).maybeSingle()
  if (!data) throw new WardrobeError('Búsqueda no encontrada', 404)
  return data
}

// ── Catálogo de candidatos ──
const COLS = ['product_name', 'brand', 'product_url', 'canonical_url', 'external_product_id', 'description', 'category', 'subcategory', 'primary_color', 'colors', 'confirmed_composition', 'current_price', 'currency', 'availability_status', 'images'] as const
const userFields = (fs: Row) => new Set(Object.entries(fs ?? {}).filter(([, v]) => (v as Row)?.source === 'user').map(([k]) => k))

/** Guarda (o actualiza, sin pisar lo que corregiste tú) un producto normalizado; variantes y precio con fecha. */
async function upsertProduct(sb: Sb, uid: string, p: NormalizedProduct, extra: { need_id?: string | null; search_id?: string | null; source_id?: string | null; retailer_id?: string | null; verify_note?: string | null }) {
  const now = new Date().toISOString()
  const existing = p.canonical_url ? (await sb.from('external_products').select('*').eq('canonical_url', p.canonical_url).maybeSingle()).data : null
  const row: Row = { source_kind: p.source_kind, last_verified_at: p.source_kind === 'search' ? null : now, verify_note: extra.verify_note ?? null }
  for (const k of COLS) row[k] = (p as never as Row)[k]
  if (extra.retailer_id !== undefined) row.retailer_id = extra.retailer_id
  if (extra.source_id) row.source_id = extra.source_id
  let id: string
  if (existing) {
    const mine = userFields(existing.field_sources)
    for (const k of mine) delete row[k]
    if (mine.has('primary_color')) delete row.colors
    row.field_sources = { ...p.field_sources, ...Object.fromEntries([...mine].map((k) => [k, existing.field_sources[k]])) }
    if (extra.need_id && !existing.need_id) row.need_id = extra.need_id
    if (existing.images?.some((i: Row) => i.origin === 'user')) row.images = [...existing.images.filter((i: Row) => i.origin === 'user'), ...(row.images ?? p.images)]
    const { error } = await sb.from('external_products').update(row).eq('id', existing.id)
    if (error) throw dbErr(error.message)
    id = existing.id
  } else {
    const { data, error } = await sb.from('external_products').insert({ ...row, user_id: uid, field_sources: p.field_sources, need_id: extra.need_id ?? null, search_id: extra.search_id ?? null }).select('id').single()
    if (error) throw new WardrobeError(/row-level/i.test(error.message) ? 'La necesidad o la fuente no son tuyas.' : error.message)
    id = data.id
  }
  if (p.variants.length) {
    await sb.from('external_product_variants').delete().eq('product_id', id)
    await sb.from('external_product_variants').insert(p.variants.map((v) => ({ ...v, user_id: uid, product_id: id, checked_at: now })))
  }
  if (p.source_kind !== 'search' && (p.current_price != null || p.availability_status !== 'unknown')) await recordPrice(sb, uid, id, p.current_price, p.currency, p.availability_status, p.source_kind)
  return { id, updated: !!existing }
}
async function recordPrice(sb: Sb, uid: string, productId: string, price: number | null, currency: string, availability: string, source_kind: string) {
  const { data: last } = await sb.from('product_price_history').select('price, availability').eq('product_id', productId).order('observed_at', { ascending: false }).limit(1).maybeSingle()
  if (last && Number(last.price) === Number(price) && last.availability === availability) return false
  await sb.from('product_price_history').insert({ user_id: uid, product_id: productId, price, currency, availability, source_kind })
  return true
}

/** Guarda como candidato un resultado de búsqueda. */
export async function saveSearchResult(sb: Sb, uid: string, searchId: string, index: number) {
  const s = await getSearch(sb, searchId)
  const h = (s.results as Row[])[index]
  if (!h) throw new WardrobeError('Ese resultado ya no está disponible.', 404)
  return upsertProduct(sb, uid, h as never, { need_id: s.need_id, search_id: s.id, source_id: h.source_id, retailer_id: h.retailer?.id ?? null, verify_note: h.source_kind === 'search' ? 'Datos del buscador: impórtalo o verifícalo en la tienda.' : null })
}

/** Importación por URL. Si la tienda o robots.txt no lo permiten, no se descarga nada y se ofrece la importación asistida. */
export async function importFromUrl(sb: Sb, uid: string, raw: { url?: string; need_id?: string | null }) {
  const url = String(raw.url ?? '').trim()
  if (!/^https?:\/\//i.test(url)) throw new WardrobeError('Pega la dirección completa del producto (https://…).')
  const retailers = await listRetailers(sb)
  const r = await urlImportSource(retailers).getProduct!(url)
  await sb.from('ai_runs').insert({ user_id: uid, kind: 'product_import', model: 'reglas', meta: { ok: r.ok, reason: r.ok ? r.how : r.reason, retailer: r.retailer?.slug ?? null } })
  if (!r.ok) return { ok: false as const, reason: r.reason, message: r.message, url, retailer: r.retailer ? { id: r.retailer.id, name: r.retailer.name } : null }
  const saved = await upsertProduct(sb, uid, r.product, { need_id: raw.need_id ?? null, retailer_id: r.retailer?.id ?? null, verify_note: r.note })
  return { ok: true as const, id: saved.id, updated: saved.updated, note: r.note }
}

export const ManualInput = z.object({
  product_name: z.string().trim().min(1, 'Ponle un nombre').max(200), product_url: z.string().trim().regex(/^https?:\/\//, 'URL no válida').max(1000).nullable().optional(),
  retailer_id: z.string().uuid().nullable().optional(), brand: z.string().trim().max(80).nullable().optional(), price: z.number().min(0).max(100000).nullable().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).default('EUR'), subcategory: z.enum(SUBS.map((x) => x.id) as [string, ...string[]]).nullable().optional(),
  color: z.enum(GARMENT_COLORS as [string, ...string[]]).nullable().optional(), composition: z.string().trim().max(300).nullable().optional(),
  description: z.string().trim().max(4000).nullable().optional(), sizes: z.string().trim().max(200).nullable().optional(), need_id: z.string().uuid().nullable().optional(),
  availability: z.enum(ids(AVAILABILITY)).default('unknown'),
})
/** Importación asistida: tus datos (todo con procedencia «tú»); las capturas se añaden después en la ficha. */
export async function createManualProduct(sb: Sb, uid: string, raw: unknown) {
  const p = ManualInput.safeParse(raw); if (!p.success) throw new WardrobeError(zmsg(p.error))
  const d = p.data
  const retailers = await listRetailers(sb)
  const retailer = d.retailer_id ? retailers.find((r) => r.id === d.retailer_id) : retailerForUrl(d.product_url, retailers)
  if (d.retailer_id && !retailer) throw new WardrobeError('Esa tienda no está disponible.', 400)
  const n = manualProduct({ name: d.product_name, url: d.product_url, brand: d.brand ?? retailer?.name ?? null, price: d.price, currency: d.currency, color: d.color, description: d.description, availability: d.availability, variants: (d.sizes ?? '').split(/[,;/]+/).map((x) => x.trim()).filter(Boolean).slice(0, 20).map((size) => ({ size, availability: null })) })!
  const at = new Date().toISOString()
  if (d.subcategory) { const s = SUBS.find((x) => x.id === d.subcategory)!; n.subcategory = s.id; n.category = s.group; n.field_sources.subcategory = n.field_sources.category = { source: 'user', at } }
  if (d.composition) { n.confirmed_composition = d.composition; n.field_sources.confirmed_composition = { source: 'user', at } }
  if (d.availability !== 'unknown') n.field_sources.availability_status = { source: 'user', at }
  n.variants = n.variants.map((v) => ({ ...v, availability: 'unknown' as Availability }))
  return (await upsertProduct(sb, uid, n, { need_id: d.need_id ?? null, retailer_id: retailer?.id ?? null, verify_note: 'Datos introducidos por ti.' })).id
}

export async function listProducts(sb: Sb, opts: { need_id?: string | null; status?: string } = {}) {
  let q = sb.from('external_products').select('*, retailers(name, url_policy), shopping_needs(id, title)').order('created_at', { ascending: false })
  if (opts.need_id) q = q.eq('need_id', opts.need_id)
  q = opts.status === 'all' ? q : opts.status ? q.eq('status', opts.status) : q.neq('status', 'discarded')
  const { data, error } = await q
  if (error) { if (/schema cache|does not exist/i.test(error.message)) return []; throw dbErr(error.message) }
  return (data ?? []).map((p) => ({ ...p, stale: isStale(p.last_verified_at) }))
}
export const isStale = (at?: string | null, now = Date.now()) => !at || now - new Date(at).getTime() > STALE_DAYS * 864e5

export async function getProduct(sb: Sb, id: string) {
  const { data: p, error } = await sb.from('external_products').select('*, retailers(id, name, url_policy, policy_note, domains), shopping_needs(id, title, spec)').eq('id', id).maybeSingle()
  if (error) throw dbErr(error.message)
  if (!p) throw new WardrobeError('Producto no encontrado', 404)
  const [{ data: variants }, { data: history }] = await Promise.all([
    sb.from('external_product_variants').select('*').eq('product_id', id).order('size'),
    sb.from('product_price_history').select('*').eq('product_id', id).order('observed_at', { ascending: false }).limit(30),
  ])
  const own = (p.images as Row[]).filter((i) => i.origin === 'user' && i.storage_path)
  const signed = own.length ? (await sb.storage.from('shopping-private').createSignedUrls(own.map((i) => i.storage_path), 600)).data ?? [] : []
  const images = (p.images as Row[]).map((i) => (i.storage_path ? { ...i, signed_url: signed.find((x) => x.path === i.storage_path)?.signedUrl ?? null } : i))
  return { ...p, images, variants: variants ?? [], history: history ?? [], stale: isStale(p.last_verified_at) }
}

export const ProductPatch = z.object({
  product_name: z.string().trim().min(1).max(200).optional(), brand: z.string().trim().max(80).nullable().optional(),
  current_price: z.number().min(0).max(100000).nullable().optional(), subcategory: z.enum(SUBS.map((x) => x.id) as [string, ...string[]]).nullable().optional(),
  primary_color: z.enum(GARMENT_COLORS as [string, ...string[]]).nullable().optional(), confirmed_composition: z.string().trim().max(300).nullable().optional(),
  description: z.string().trim().max(4000).nullable().optional(), availability_status: z.enum(ids(AVAILABILITY)).optional(),
  need_id: z.string().uuid().nullable().optional(), status: z.enum(['candidate', 'saved', 'discarded']).optional(), discard_reason: z.string().trim().max(300).nullable().optional(),
})
/** Correcciones tuyas (procedencia «tú», no se pisan al reimportar) y estado (descartar exige motivo). */
export async function updateProduct(sb: Sb, uid: string, id: string, raw: unknown) {
  const p = ProductPatch.safeParse(raw); if (!p.success) throw new WardrobeError(zmsg(p.error))
  const sent = raw && typeof raw === 'object' ? new Set(Object.keys(raw)) : new Set<string>()
  const d = Object.fromEntries(Object.entries(p.data).filter(([k]) => sent.has(k))) as Row
  const { data: cur } = await sb.from('external_products').select('*').eq('id', id).maybeSingle()
  if (!cur) throw new WardrobeError('Producto no encontrado', 404)
  if (d.status === 'discarded' && !(d.discard_reason ?? cur.discard_reason)) throw new WardrobeError('Indica por qué lo descartas: así no volveré a proponerlo por lo mismo.')
  const at = new Date().toISOString()
  const fs = { ...(cur.field_sources ?? {}) }
  const patch: Row = { ...d }
  for (const k of ['product_name', 'brand', 'current_price', 'primary_color', 'confirmed_composition', 'description', 'availability_status']) if (k in d) fs[k] = { source: 'user', at }
  if ('subcategory' in d) { const s = SUBS.find((x) => x.id === d.subcategory); patch.category = s?.group ?? null; fs.subcategory = fs.category = { source: 'user', at } }
  if ('primary_color' in d) patch.colors = d.primary_color ? [d.primary_color, ...(cur.colors ?? []).filter((c: string) => c !== d.primary_color)] : []
  if (d.status && d.status !== 'discarded') patch.discard_reason = null
  patch.field_sources = fs
  const { error } = await sb.from('external_products').update(patch).eq('id', id)
  if (error) throw new WardrobeError(/row-level/i.test(error.message) ? 'Esa necesidad no es tuya.' : error.message)
  if ('current_price' in d || 'availability_status' in d) await recordPrice(sb, uid, id, d.current_price ?? cur.current_price, cur.currency, d.availability_status ?? cur.availability_status, 'manual')
  return { id }
}
export async function deleteProduct(sb: Sb, id: string) {
  const { data: p } = await sb.from('external_products').select('images').eq('id', id).maybeSingle()
  if (!p) throw new WardrobeError('Producto no encontrado', 404)
  const paths = (p.images as Row[]).filter((i) => i.storage_path).map((i) => i.storage_path)
  if (paths.length) await sb.storage.from('shopping-private').remove(paths)
  await sb.from('external_products').delete().eq('id', id)
}

/**
 * Verificación de precio, disponibilidad y tallas antes de decidir. Se vuelve a consultar la misma fuente si lo permite
 * (página con metadatos o feed); si no (tienda «solo manual» o buscador), confirmas tú lo que ves en la tienda.
 */
export async function verifyProduct(sb: Sb, uid: string, id: string, manual?: { price?: number | null; availability?: string | null; sizes?: string | null } | null) {
  const p = await getProduct(sb, id)
  const now = new Date().toISOString()
  if (manual && (manual.price != null || manual.availability)) {
    const av = AVAILABILITY.some((a) => a.id === manual.availability) ? manual.availability as Availability : p.availability_status
    const fs = { ...p.field_sources, ...(manual.price != null ? { current_price: { source: 'user', at: now } } : {}), ...(manual.availability ? { availability_status: { source: 'user', at: now } } : {}) }
    await sb.from('external_products').update({ current_price: manual.price ?? p.current_price, availability_status: av, field_sources: fs, last_verified_at: now, verify_note: 'Comprobado por ti en la tienda.' }).eq('id', id)
    if (manual.sizes) { await sb.from('external_product_variants').delete().eq('product_id', id); await sb.from('external_product_variants').insert(manual.sizes.split(/[,;/]+/).map((x) => x.trim()).filter(Boolean).slice(0, 20).map((size) => ({ user_id: uid, product_id: id, size, availability: 'in_stock', checked_at: now }))) }
    const changed = await recordPrice(sb, uid, id, manual.price ?? p.current_price, p.currency, av, 'manual')
    return { ok: true, how: 'user', changed, note: 'Comprobado por ti en la tienda.' }
  }
  if (p.source_kind === 'feed' && p.source_id) {
    const { data: items } = await sb.from('product_feed_items').select('product').eq('source_id', p.source_id).limit(FETCH_LIMITS.feedMaxItems)
    const it = (items ?? []).map((i) => i.product as NormalizedProduct).find((x) => (x.canonical_url && x.canonical_url === p.canonical_url) || (x.external_product_id && x.external_product_id === p.external_product_id))
    if (!it) { await sb.from('external_products').update({ availability_status: 'out_of_stock', verify_note: 'Ya no aparece en el feed: probablemente esté agotado o retirado.', last_verified_at: now }).eq('id', id); await recordPrice(sb, uid, id, p.current_price, p.currency, 'out_of_stock', 'feed'); return { ok: true, how: 'feed', changed: true, note: 'Ya no aparece en el feed.' } }
    const { data: src } = await sb.from('product_sources').select('last_sync_at').eq('id', p.source_id).single()
    await upsertProduct(sb, uid, it, { verify_note: `Según el feed sincronizado el ${new Date(src?.last_sync_at ?? now).toLocaleDateString('es-ES')}.` })
    return { ok: true, how: 'feed', changed: true, note: 'Actualizado desde el feed.' }
  }
  if (p.product_url) {
    const r = await importFromUrl(sb, uid, { url: p.product_url })
    if (r.ok) return { ok: true, how: 'url', changed: true, note: r.note }
    await sb.from('external_products').update({ verify_note: r.message }).eq('id', id)
    return { ok: false, how: 'manual', changed: false, note: `${r.message} Indica tú el precio y la disponibilidad que ves en la tienda.` }
  }
  return { ok: false, how: 'manual', changed: false, note: 'Sin enlace ni fuente: indica tú el precio y la disponibilidad.' }
}

/** Capturas o fotos de la importación asistida (subidas por el navegador a tu carpeta privada). */
export async function addProductImage(sb: Sb, uid: string, id: string, storagePath: string) {
  if (!storagePath.startsWith(`${uid}/${id}/`) || storagePath.includes('..')) throw new WardrobeError('Ruta de imagen no válida', 403)
  const { data: p } = await sb.from('external_products').select('images').eq('id', id).maybeSingle()
  if (!p) throw new WardrobeError('Producto no encontrado', 404)
  if ((p.images as Row[]).filter((i) => i.origin === 'user').length >= 6) throw new WardrobeError('Como máximo 6 capturas por producto.')
  await sb.from('external_products').update({ images: [...p.images, { storage_path: storagePath, origin: 'user', permission: 'stored' }] }).eq('id', id)
}
export async function removeProductImage(sb: Sb, uid: string, id: string, storagePath: string) {
  if (!storagePath.startsWith(`${uid}/`)) throw new WardrobeError('Ruta de imagen no válida', 403)
  const { data: p } = await sb.from('external_products').select('images').eq('id', id).maybeSingle()
  if (!p) throw new WardrobeError('Producto no encontrado', 404)
  await sb.storage.from('shopping-private').remove([storagePath])
  await sb.from('external_products').update({ images: (p.images as Row[]).filter((i) => i.storage_path !== storagePath) }).eq('id', id)
}
export const searchConfigured = () => { const c = searchProviderConfig(); return !!(c.provider && c.key) }
export { canonicalUrl }
