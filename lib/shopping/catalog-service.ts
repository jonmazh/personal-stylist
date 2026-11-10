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
import { ucpConfig, UcpError, type UcpRetailer } from './catalog/ucp'
import { connectorSource } from './catalog/registry'
import { Channel3Error, Channel3Meter, channel3Config, channel3Label, forEvaluation, channel3Source, isChannel3, type C3Meta } from './catalog/channel3'
import { buildShopperContext } from './intelligence/context'
import { discoveryQueries } from './intelligence/discovery'
import { rankHits } from './intelligence/rank'
import { DISCOVERY_C3_BUDGET, diversify, facetQuery, matchOpportunity, opportunityFacets } from '@/lib/stylist/discovery'
import { suggestColors } from './intelligence/color'
import { channel3SizeFilter, resolveSizes, sizeGroupOf, type SizeContext } from './intelligence/sizes'
import { ageOut, eligibilityOf, gateVerdict, GATE_VERSION } from './intelligence/eligibility'
import { EVAL_VERSION, evaluatePurchase, type PurchaseEvaluation } from './evaluate'
import { listNeeds, shoppingContext } from './service'
import { feedSource, manualProduct, searchAll, searchProviderConfig, searchProviderSource, urlImportSource, type ProductSource, type RetailerRef, type SearchHit } from './catalog/sources'

/** Product Discovery (fase 4B): tiendas, fuentes autorizadas, búsqueda, importación y catálogo de candidatos. */
type Row = Record<string, any>
const ids = <T extends { id: string }>(xs: readonly T[]) => xs.map((x) => x.id) as [string, ...string[]]
const dbErr = (m: string) => new WardrobeError(/schema cache|does not exist/i.test(m) ? 'Ejecuta la migración 0017 en Supabase.' : m, 500)
const zmsg = (e: z.ZodError) => e.issues.map((i) => `${i.path.join('.') || 'dato'}: ${i.message}`).join('; ')
const CACHE_HOURS = 24
export const UCP_CACHE_MINUTES = 15

// ── Tiendas ──
export async function listRetailers(sb: Sb): Promise<(RetailerRef & { user_id: string | null; group_name: string | null; market: string; connector?: string | null })[]> {
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
async function buildSources(sb: Sb, retailers: RetailerRef[], meter?: Channel3Meter, sizes?: SizeContext | null, c3opts: { localOnly?: boolean; budget?: () => number } = {}): Promise<ProductSource[]> {
  const { data: feeds } = await sb.from('product_sources').select('id, name, retailer_id, last_sync_at').eq('kind', 'feed').eq('status', 'active')
  const out: ProductSource[] = []
  for (const f of feeds ?? []) {
    const { data: items } = await sb.from('product_feed_items').select('product').eq('source_id', f.id).limit(FETCH_LIMITS.feedMaxItems)
    // La disponibilidad de un feed es la de su última sincronización
    out.push(feedSource(f, (items ?? []).map((i) => ({ ...(i.product as NormalizedProduct), raw_attributes: { ...((i.product as NormalizedProduct).raw_attributes ?? {}), fetched_at: f.last_sync_at } })), retailers, retailers.find((r) => r.id === f.retailer_id) ?? null))
  }
  // Tiendas con conector UCP (p. ej. Grimey): catálogo oficial, consultado bajo demanda
  for (const r of retailers as UcpRetailer[]) if (r.connector === 'ucp') out.push(connectorSource(r))
  // Channel3: catálogo multimarca (solo descubrimiento) para las tiendas sin conector propio
  const c3 = channel3Config()
  if (c3.key) out.push(channel3Source((retailers as UcpRetailer[]).filter((r) => r.connector !== 'ucp'), c3, { meter }, { sizesFor: (q) => channel3SizeFilter(sizeGroupOf(q.subcategory, q.category), sizes ?? null), ...c3opts }))
  // El buscador genérico no repite las tiendas que ya se consultan por su catálogo oficial
  out.push(searchProviderSource(searchProviderConfig(), (retailers as UcpRetailer[]).filter((r) => r.connector !== 'ucp')))
  return out
}
const KEEP_RAW = ['gender', 'age', 'fetched_at', 'tags', 'collections']
const slim = (h: SearchHit) => ({ ...h, raw_attributes: h.source_kind === 'api' ? h.raw_attributes : Object.fromEntries(Object.entries(h.raw_attributes ?? {}).filter(([k]) => KEEP_RAW.includes(k))), description: h.description?.slice(0, 600) ?? null, retailer: h.retailer ? { id: h.retailer.id, slug: h.retailer.slug, name: h.retailer.name, url_policy: h.retailer.url_policy, domains: h.retailer.domains } : null })

/**
 * La caché depende de la búsqueda Y de las fuentes disponibles: si configuras el buscador, añades o sincronizas un feed
 * o cambias las tiendas, la misma búsqueda se repite en lugar de devolver un resultado antiguo.
 */
export const sourcesSignature = (cfg: { provider: string | null; key: string | null; market: string }, feeds: { id: string; last_sync_at?: string | null }[], retailers: { id: string; domains: readonly string[] }[]) =>
  JSON.stringify({ search: cfg.provider && cfg.key ? `${cfg.provider}:${cfg.market}` : null, feeds: feeds.map((f) => `${f.id}@${f.last_sync_at ?? ''}`).sort(), shops: retailers.map((r) => `${r.id}:${r.domains.join(',')}`).sort() })
export const searchCacheKey = (q: ProductSearchQuery, signature: string) => createHash('sha256').update(JSON.stringify(q) + '|' + signature).digest('hex').slice(0, 32)

/** Busca en las fuentes autorizadas para una necesidad o un texto. Reutiliza la misma búsqueda de las últimas 24 h (caché). */
/** Evaluación compacta que viaja con cada resultado (la completa se guarda al abrir o evaluar el producto). */
function compactEval(e: PurchaseEvaluation) {
  return {
    version: e.version, score: e.score, verdict: e.verdict, verdict_text: e.verdict_text, confidence: e.confidence, confidence_score: e.confidence_score, completeness: e.completeness,
    redundancy_score: e.redundancy_score, redundancy: { level: e.redundancy.level, garments: e.redundancy.garments.slice(0, 2).map((g) => ({ id: g.id, title: g.title, similarity: g.similarity })) },
    criteria: e.criteria.map((c) => ({ key: c.key, label: c.label, weight: c.weight, value: c.value, points: c.points, known: c.known, confidence: c.confidence, reasons: c.reasons.slice(0, 3), missing: c.missing.slice(0, 2) })),
    color: e.color ? { label: e.color.label, saturation: e.color.wardrobe.saturation, personal: e.color.personal.verdict, confidence: e.color.confidence } : null,
    wva: { score: e.wva.score, new_outfits: e.wva.new_outfits, total_outfits: e.wva.total_outfits, outfit_samples: e.wva.outfit_samples, occasions_new: e.wva.occasions_new, gaps: e.wva.gaps, reasons: e.wva.reasons.slice(0, 3) },
    combines_with: e.combines_with.slice(0, 6), reasons: e.reasons, risks: e.risks.slice(0, 4), missing_info: e.missing_info.slice(0, 4), discard_reasons: e.discard_reasons, sizes: e.indicators.sizes,
  }
}

const c3Signature = () => { const c = channel3Config(); return c.key ? `|c3:${c.country}:${c.mode}:${c.foreignMarkets ? 'fx' : 'local'}` : '' }
/**
 * Evaluación 4C de un candidato (sin cambiar el motor). Un precio en otra moneda (mercado extranjero de Channel3) no se
 * compara con tu presupuesto en euros: para la evaluación queda como desconocido (neutro) y se avisa.
 */
function evalHit(h: Row, o: { ctx: ReturnType<typeof buildShopperContext>; need: Row | null; needs: Row[]; fast: boolean }) {
  try {
    const { product: p, foreign } = forEvaluation(h, channel3Config().currency)
    const e = compactEval(evaluatePurchase(p as never, { garments: o.ctx.garments, evals: o.ctx.evals, bundle: o.ctx.bundle, ctx: o.ctx, need: o.need as never, openNeeds: o.needs as never, analyzed: false, staleDays: h.source_kind === 'search' ? null : 0, fast: o.fast }))
    const note = isChannel3(h) ? channel3Label(h.raw_attributes as C3Meta) : null
    if (foreign || note) e.missing_info = [...(note ? [`${note}: el precio (${h.current_price ?? '—'} ${h.currency}) no se compara con tu presupuesto.`] : []), ...e.missing_info].slice(0, 5)
    return e
  } catch { return null /* sin evaluar: se muestra aparte */ }
}
type EvalEnv = { ctx: ReturnType<typeof buildShopperContext>; need: Row | null; needs: Row[]; sizes: SizeContext }
/** Tallas de cada grupo a partir de tus datos (PersonalizedSizeResolver). */
async function sizeContextFor(sb: Sb, sc: Awaited<ReturnType<typeof shoppingContext>>) {
  const { data: refs } = await sb.from('garment_measurements').select('garment_id, fits_well')
  const b = sc.prep.bundle as Row
  return resolveSizes({ declared: b.profile?.sizes ?? null, garments: sc.prep.garments, fitScore: (id) => (sc.prep.evals.get(id) as Row | undefined)?.fit?.score ?? null, references: (refs ?? []) as never, measures: b.measures ?? {}, fitPrefs: b.fit?.prefs ?? {}, generalFit: b.profile?.fit_pref ?? null })
}
async function evalEnvFor(sb: Sb, uid: string, needId: string | null): Promise<EvalEnv> {
  const [sc, needs] = await Promise.all([shoppingContext(sb, uid), listNeeds(sb)])
  const ctx = buildShopperContext({ bundle: sc.prep.bundle, garments: sc.prep.garments, evals: sc.prep.evals, signals: sc.prep.signals, needs, prefs: sc.prefs, use: sc.use })
  let need: Row | null = null
  if (needId) { const { data: n } = await sb.from('shopping_needs').select('*').eq('id', needId).maybeSingle(); if (n) need = { ...n, spec: NeedSpec.parse(n.spec) } }
  return { ctx, need, needs, sizes: await sizeContextFor(sb, sc) }
}
/**
 * Condiciones previas (moda masculina, tu talla y su disponibilidad por variante) y, si no queda excluido, evaluación 4C.
 * Excluido (mujer/infantil, sin tu talla, agotado en tu talla) → no se evalúa. Pendiente → se evalúa, pero no se recomienda.
 */
function processHit(h: Row, ev: EvalEnv, n: number) {
  const eligibility = eligibilityOf(h, ev.sizes, Date.now(), channel3Config().country)
  if (eligibility.excluded) return { ...h, eligibility, evaluation: null }
  return { ...h, eligibility, evaluation: gateVerdict(evalHit(h, { ctx: ev.ctx, need: ev.need, needs: ev.needs, fast: n > 25 }), eligibility) }
}
/** Ficha actual (gratis) de resultados de Channel3: precio, disponibilidad por talla (del color seleccionado) y variantes. */
async function hydrateChannel3(rows: Row[], meter: Channel3Meter, which: (h: Row) => boolean) {
  const c3 = channel3Source([], channel3Config(), { meter })
  const out = [...rows]
  const idx = out.map((h, i) => (isChannel3(h) && which(h) ? i : -1)).filter((i) => i >= 0)
  for (let k = 0; k < idx.length; k += 6) {
    await Promise.all(idx.slice(k, k + 6).map(async (i) => {
      const h = out[i]; const m = h.raw_attributes as C3Meta
      try {
        const { product } = await c3.getById(m.channel3_id, { market: m.market, domain: m.domain })
        const f = product.raw_attributes as unknown as C3Meta
        out[i] = { ...h, current_price: product.current_price, currency: product.currency, availability_status: product.availability_status, variants: product.variants, raw_attributes: { ...m, fetched_at: f.fetched_at, previous_price: f.previous_price, selected_color: f.selected_color, gender: f.gender ?? m.gender, age: f.age ?? m.age, refresh: 'ok' }, _touched: true }
      } catch (e) {
        const gone = e instanceof Channel3Error && e.code === 'not_found'
        // Sin ficha actual, ninguna disponibilidad cuenta como confirmada
        out[i] = { ...h, ...(gone ? { availability_status: 'out_of_stock', variants: (h.variants ?? []).map((v: Row) => ({ ...v, availability: 'out_of_stock' })) } : { variants: (h.variants ?? []).map((v: Row) => ({ ...v, availability: 'unknown' })) }), raw_attributes: { ...m, refresh: gone ? 'gone' : 'failed', refresh_error: (e as Error).message }, _touched: true }
      }
    }))
  }
  return out
}

/**
 * Antes de mostrar una búsqueda (de la caché o al volver a la página): la disponibilidad confirmada hace demasiado deja
 * de contar como confirmada y los resultados de Channel3 con ficha de más de `maxAgeMin` minutos se actualizan (gratis),
 * se vuelven a filtrar por talla y stock, se reevalúan y se reordenan. Se guarda el nuevo orden (los índices de
 * «Guardar como candidato» y «Ver oferta actual» deben coincidir con lo guardado).
 */
async function refreshSearchRow(sb: Sb, uid: string, row: Row, ev: EvalEnv | null, maxAgeMin = 30) {
  const before = JSON.stringify((row.results as Row[]).map((h) => [h.eligibility?.ok, h.evaluation?.verdict]))
  let results = (row.results as Row[]).map((h) => ageOut(h))
  const old = (h: Row) => Date.now() - new Date((h.raw_attributes as C3Meta).fetched_at).getTime() >= maxAgeMin * 60e3
  const meter = new Channel3Meter()
  if (results.some((h) => isChannel3(h) && old(h)) && channel3Config().key) {
    ev ??= await evalEnvFor(sb, uid, row.need_id ?? null)
    results = (await hydrateChannel3(results, meter, old)).map((h) => { if (!h._touched) return h; const { _touched: _t, ...x } = h; return processHit(x, ev!, results.length) })
  }
  if (!meter.calls.length && before === JSON.stringify(results.map((h) => [h.eligibility?.ok, h.evaluation?.verdict]))) return row.results as Row[]
  results = rankHits(results as never) as Row[]
  await sb.from('shopping_searches').update({ results }).eq('id', row.id)
  if (meter.calls.length) await sb.from('ai_runs').insert({ user_id: uid, kind: 'product_search', model: 'reglas', meta: { search_id: row.id, refreshed: true, channel3: meter.summary() } })
  return results
}
/** Búsqueda guardada lista para mostrar: precio, stock y tallas de Channel3 actualizados si tienen más de 30 min. */
export async function getSearchForDisplay(sb: Sb, uid: string, id: string) {
  const row = await getSearch(sb, id)
  return { ...row, results: await refreshSearchRow(sb, uid, row, null).catch(() => row.results) }
}

/**
 * Personal Shopper Intelligence: perfil → diagnóstico → necesidad → descubrimiento → evaluación → recomendación.
 * 1) Contexto personal (colorimetría, ajuste, estilo, armario, uso, aprendizaje, necesidades).
 * 2) Descubrimiento ampliado en las fuentes (tipo de prenda sin exigir el color escrito + colores que te favorecen y faltan).
 * 3) Cada candidato se normaliza, se quitan duplicados y se evalúa con tu perfil y tu armario (Outfit Engine incluido).
 * 4) Orden por compatibilidad personal, nunca por precio ni por coincidencia textual. Caché ligada a tu perfil y armario.
 */
export async function searchProducts(sb: Sb, uid: string, raw: { need_id?: string | null; text?: string | null; force?: boolean }) {
  const prefs = await prefsOf(sb)
  let q: ProductSearchQuery
  let need: Row | null = null
  if (raw.need_id) {
    const { data: n } = await sb.from('shopping_needs').select('*').eq('id', raw.need_id).maybeSingle()
    if (!n) throw new WardrobeError('Necesidad no encontrada', 404)
    need = { ...n, spec: NeedSpec.parse(n.spec) }
    q = queryFromNeed(need as never, prefs)
  } else {
    const t = (raw.text ?? '').trim(); if (t.length < 3) throw new WardrobeError('Describe qué buscas (al menos 3 letras) o elige una necesidad.')
    q = queryFromText(t, prefs)
  }
  return runSearch(sb, uid, { q, need, force: raw.force })
}

/** Núcleo común de la búsqueda (necesidad, texto u oportunidad de estilo): descubrimiento, filtros previos y evaluación 4C. */
interface RunOpts {
  q: ProductSearchQuery; need: Row | null; force?: boolean
  plan?: (ctx: ReturnType<typeof buildShopperContext>) => { queries: ProductSearchQuery[]; notes: string[] }
  c3?: { localOnly?: boolean; budget?: () => number }; matcher?: (h: Row) => ReturnType<typeof matchOpportunity>; diversify?: boolean
  extraQuery?: Row; cacheExtra?: string; opportunityId?: string; facetsInfo?: () => Row[]
}
async function runSearch(sb: Sb, uid: string, o: RunOpts) {
  const { q, need } = o
  const [sc, needs] = await Promise.all([shoppingContext(sb, uid), listNeeds(sb)])
  const ctx = buildShopperContext({ bundle: sc.prep.bundle, garments: sc.prep.garments, evals: sc.prep.evals, signals: sc.prep.signals, needs, prefs: sc.prefs, use: sc.use })
  const sizes = await sizeContextFor(sb, sc)
  const ev: EvalEnv = { ctx, need, needs, sizes }
  const plan = o.plan ? o.plan(ctx) : discoveryQueries(q, ctx)
  const retailers = await listRetailers(sb)
  const { data: feeds } = await sb.from('product_sources').select('id, last_sync_at').eq('kind', 'feed').eq('status', 'active')
  const ucp = (retailers as UcpRetailer[]).some((r) => r.connector === 'ucp' && !q.excluded.includes(r.slug) && (!q.retailers.length || q.retailers.includes(r.slug)))
  const cache_key = searchCacheKey(q, sourcesSignature(searchProviderConfig(), feeds ?? [], retailers) + (ucp && ucpConfig().profileUrl ? '|ucp' : '') + c3Signature() + (o.cacheExtra ?? '') + `|ctx:${ctx.hash}|sz:${sizes.fingerprint}|${GATE_VERSION}|${EVAL_VERSION}`)
  if (!o.force) {
    // UCP: las respuestas de catálogo no deben reutilizarse entre sesiones sin revalidar → caché de 15 minutos
    const since = new Date(Date.now() - (ucp ? UCP_CACHE_MINUTES * 60e3 : CACHE_HOURS * 3600e3)).toISOString()
    const { data: hit } = await sb.from('shopping_searches').select('*').eq('cache_key', cache_key).gte('created_at', since).order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (hit) {
      // Caché de descubrimiento (IDs y evaluación); precio, stock y tallas de Channel3 se vuelven a pedir (gratis) antes de mostrarlos
      const results = await refreshSearchRow(sb, uid, hit, ev, 0)
      return { id: hit.id as string, query: hit.query as ProductSearchQuery, results, sources: hit.sources as Row[], cached: true, created_at: hit.created_at as string }
    }
  }
  // Descubrimiento (consultas en serie: respeta los límites de cada tienda)
  const meter = new Channel3Meter()
  const sources = await buildSources(sb, retailers, meter, sizes, o.c3 ? { localOnly: o.c3.localOnly, budget: o.c3.budget ? () => o.c3!.budget!() - meter.summary().credits : undefined } : {})
  const byKey = new Map<string, SearchHit>(); const stat = new Map<string, Row>(); const facetsOf = new Map<string, string[]>()
  for (const dq of plan.queries) {
    const { results, statuses } = await searchAll(dq, sources, 30)
    for (const h of results) {
      const k = h.canonical_url ?? `${h.source_label}:${h.external_product_id ?? h.product_name}`
      if (!byKey.has(k)) byKey.set(k, h)
      if (dq.facet) facetsOf.set(k, [...new Set([...(facetsOf.get(k) ?? []), dq.facet])])
    }
    for (const st of statuses) { const k = `${st.kind}:${st.id ?? st.label}`; const prev = stat.get(k); stat.set(k, prev ? { ...prev, count: prev.count + st.count, status: prev.status === 'ok' || st.status === 'ok' ? 'ok' : st.status, message: prev.message ?? st.message } : { ...st }) }
  }
  // Evaluación personal de cada candidato
  const t0 = Date.now()
  // Búsqueda estratégica: solo los productos que materializan la oportunidad (lo desconocido no excluye; queda marcado)
  let offTarget = 0
  const keyOf = (h: SearchHit) => h.canonical_url ?? `${h.source_label}:${h.external_product_id ?? h.product_name}`
  const pool = [...byKey.values()].filter((h) => { if (!o.matcher) return true; const m = o.matcher(h); if (m && m.misses.length) { offTarget++; return false } return true })
  const candidates = pool.slice(0, 40).map((h) => ({ ...h, ...(o.matcher ? { opportunity_match: o.matcher(h), facets: facetsOf.get(keyOf(h)) ?? [] } : {}) }) as SearchHit)
  // Disponibilidad por talla: la búsqueda de Channel3 no la trae; su ficha (gratis) sí, para el mercado consultado
  const hydrated = await hydrateChannel3(candidates.map((h) => slim(h) as Row), meter, () => true)
  const evaluated = hydrated.map(({ _touched: _t, ...h }) => processHit(h, ev, candidates.length))
  const ranked = (o.diversify ? diversify(rankHits(evaluated as never) as Row[]) : rankHits(evaluated as never)) as Row[]
  const gate = { excluded_gender: ranked.filter((h) => h.eligibility?.gender && !h.eligibility.gender.ok && h.eligibility.excluded && ['female', 'kids'].includes(h.eligibility.gender.class)).length, excluded_size: ranked.filter((h) => h.eligibility?.excluded && ['sin_talla_compatible', 'agotada_en_tu_talla'].includes(h.eligibility.size.status)).length, pending: ranked.filter((h) => h.eligibility && !h.eligibility.ok && !h.eligibility.excluded).length, available: ranked.filter((h) => h.eligibility?.ok).length }
  const groupSizes = (() => { const g = sizeGroupOf(q.subcategory, q.category); return g ? { group: g, label: sizes.groups[g].label, principal: sizes.groups[g].principal?.size.original ?? null, alternatives: sizes.groups[g].alternatives.map((a) => a.size.original), confidence: sizes.groups[g].confidence, reason: sizes.groups[g].reason, missing: sizes.groups[g].missing } : null })()
  // Recuento por fuente de productos únicos (la misma prenda puede salir en varias consultas)
  const statuses = [...stat.values()].map((st) => { const count = [...byKey.values()].filter((h) => (st.id ? h.source_id === st.id : h.source_label === st.label)).length; return { ...st, count, status: count ? 'ok' : st.status === 'ok' ? 'empty' : st.status } as Row })
  const query = { ...q, ...(o.extraQuery ?? {}), ...(o.facetsInfo ? { facets: o.facetsInfo() } : {}), plan: plan.queries.map((x) => x.text), notes: plan.notes, ...(o.matcher ? { off_target: offTarget, coverage: { candidates: byKey.size, brands: new Set(ranked.map((h) => String(h.brand ?? '').toLowerCase()).filter(Boolean)).size, retailers: new Set(ranked.map((h) => h.retailer?.slug).filter(Boolean)).size, channel3_credits: meter.summary().credits } } : {}), gate, sizes: groupSizes, sizes_fingerprint: sizes.fingerprint, ctx_hash: ctx.hash, engine: EVAL_VERSION, completeness: ctx.completeness, known: { color: !!ctx.color.temp, color_confidence: ctx.color.confidence, fit: !!(ctx.fit.general || Object.keys(ctx.fit.prefs).length), style: ctx.style.source !== 'ninguna' }, eval_ms: Date.now() - t0 }
  const { data: s, error } = await sb.from('shopping_searches').insert({ user_id: uid, need_id: q.need_id, ...(o.opportunityId ? { opportunity_id: o.opportunityId } : {}), query, query_text: q.text, cache_key, sources: statuses, results: ranked, result_count: ranked.length }).select('id, created_at').single()
  if (error) throw dbErr(error.message)
  await sb.from('ai_runs').insert({ user_id: uid, kind: 'product_search', model: 'reglas', meta: { search_id: s.id, results: ranked.length, queries: plan.queries.length, sources: statuses.map((x) => `${x.kind}:${x.status}`), eval_ms: query.eval_ms, ...(meter.calls.length ? { channel3: meter.summary() } : {}) } })
  return { id: s.id as string, query, results: ranked as Row[], sources: statuses as Row[], cached: false, created_at: s.created_at as string }
}
export async function getSearch(sb: Sb, id: string) {
  const { data } = await sb.from('shopping_searches').select('*').eq('id', id).maybeSingle()
  if (!data) throw new WardrobeError('Búsqueda no encontrada', 404)
  return data
}

// ── Catálogo de candidatos ──
const COLS = ['product_name', 'brand', 'product_url', 'canonical_url', 'external_product_id', 'description', 'category', 'subcategory', 'primary_color', 'colors', 'cut', 'silhouette', 'confirmed_composition', 'current_price', 'currency', 'availability_status', 'images'] as const
const userFields = (fs: Row) => new Set(Object.entries(fs ?? {}).filter(([, v]) => (v as Row)?.source === 'user').map(([k]) => k))

/** Guarda (o actualiza, sin pisar lo que corregiste tú) un producto normalizado; variantes y precio con fecha. */
async function upsertProduct(sb: Sb, uid: string, p: NormalizedProduct, extra: { need_id?: string | null; search_id?: string | null; source_id?: string | null; retailer_id?: string | null; verify_note?: string | null }) {
  const now = new Date().toISOString()
  const existing = p.canonical_url ? (await sb.from('external_products').select('*').eq('canonical_url', p.canonical_url).maybeSingle()).data : null
  const row: Row = { source_kind: p.source_kind, last_verified_at: p.source_kind === 'search' ? null : now, verify_note: extra.verify_note ?? null }
  for (const k of COLS) row[k] = (p as never as Row)[k]
  if (p.raw_attributes && Object.keys(p.raw_attributes).length) row.raw_attributes = p.raw_attributes
  if (extra.retailer_id !== undefined) row.retailer_id = extra.retailer_id
  if (extra.source_id) row.source_id = extra.source_id
  let id: string
  if (existing) {
    const mine = userFields(existing.field_sources)
    for (const k of mine) delete row[k]
    if (mine.has('primary_color')) delete row.colors
    row.field_sources = { ...p.field_sources, ...Object.fromEntries([...mine].map((k) => [k, existing.field_sources[k]])) }
    if (row.raw_attributes) row.raw_attributes = { ...(existing.raw_attributes ?? {}), ...row.raw_attributes }
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
  return upsertProduct(sb, uid, h as never, { need_id: s.need_id, search_id: s.id, source_id: h.source_id, retailer_id: h.retailer?.id ?? null, verify_note: h.source_kind === 'search' ? 'Datos del buscador: impórtalo o verifícalo en la tienda.' : isChannel3(h) ? `Datos de Channel3 (${(h.raw_attributes as C3Meta).market_name}) del ${new Date((h.raw_attributes as C3Meta).fetched_at).toLocaleString('es-ES')}.` : null })
}

/** Importación por URL. Si la tienda o robots.txt no lo permiten, no se descarga nada y se ofrece la importación asistida. */
export async function importFromUrl(sb: Sb, uid: string, raw: { url?: string; need_id?: string | null }) {
  const url = String(raw.url ?? '').trim()
  if (!/^https?:\/\//i.test(url)) throw new WardrobeError('Pega la dirección completa del producto (https://…).')
  const retailers = await listRetailers(sb)
  const ucpShop = (retailers as UcpRetailer[]).find((x) => x.connector === 'ucp' && retailerForUrl(url, [x]))
  let r = ucpShop ? await connectorSource(ucpShop).getProduct!(url) : await urlImportSource(retailers).getProduct!(url)
  // Tienda «solo enlace» (no se lee su página): si Channel3 está configurado, se consulta su catálogo (1 crédito, sin lectura en vivo)
  if (!r.ok && r.reason === 'policy' && channel3Config().key) {
    const meter = new Channel3Meter()
    const c3 = await channel3Source(retailers, channel3Config(), { meter }).getProduct(url)
    await sb.from('ai_runs').insert({ user_id: uid, kind: 'product_import', model: 'reglas', meta: { channel3: meter.summary(), ok: c3.ok } })
    if (c3.ok) r = c3
  }
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
  if (isChannel3(p)) {
    const m = p.raw_attributes as C3Meta
    const meter = new Channel3Meter()
    try {
      const { product } = await channel3Source([], channel3Config(), { meter }).getById(m.channel3_id, { market: m.market, domain: m.domain })
      await upsertProduct(sb, uid, product, { verify_note: `Comprobado en Channel3 (${m.market_name}) el ${new Date().toLocaleString('es-ES')}.` })
      return { ok: true, how: 'channel3', changed: true, note: `Precio, disponibilidad y tallas actualizados desde Channel3 (${m.market_name}).` }
    } catch (e) {
      if (e instanceof Channel3Error && e.code === 'not_found') { await sb.from('external_products').update({ availability_status: 'out_of_stock', verify_note: 'Ya no está en el catálogo de Channel3.', last_verified_at: now }).eq('id', id); await recordPrice(sb, uid, id, p.current_price, p.currency, 'out_of_stock', 'api'); return { ok: true, how: 'channel3', changed: true, note: 'Ya no está en el catálogo de Channel3.' } }
      const msg = e instanceof Channel3Error ? e.message : 'No se pudo consultar Channel3.'
      await sb.from('external_products').update({ verify_note: msg }).eq('id', id)
      return { ok: false, how: 'manual', changed: false, note: `${msg} Indica tú el precio y la disponibilidad que ves en la tienda.` }
    } finally { await sb.from('ai_runs').insert({ user_id: uid, kind: 'product_verify', model: 'reglas', meta: { channel3: meter.summary() } }) }
  }
  const shop = p.source_kind === 'api' && p.retailer_id ? ((await listRetailers(sb)) as UcpRetailer[]).find((x) => x.id === p.retailer_id && x.connector === 'ucp') : null
  if (shop && p.external_product_id) {
    try {
      const fresh = await connectorSource(shop).getById(p.external_product_id)
      const old = (p.variants as Row[]).filter((v) => v.availability !== 'unknown').length
      if (fresh.variants.every((v) => v.availability === 'unknown') && old) fresh.variants = []   // el detalle no trae tallas: se conservan las comprobadas
      await upsertProduct(sb, uid, fresh, { verify_note: `Comprobado en el catálogo oficial de ${shop.name} (UCP) el ${new Date().toLocaleString('es-ES')}.` })
      return { ok: true, how: 'ucp', changed: true, note: `Precio y disponibilidad comprobados en ${shop.name}.` }
    } catch (e) {
      if (e instanceof UcpError && e.code === 'not_found') { await sb.from('external_products').update({ availability_status: 'out_of_stock', verify_note: 'Ya no está en el catálogo de la tienda.', last_verified_at: now }).eq('id', id); await recordPrice(sb, uid, id, p.current_price, p.currency, 'out_of_stock', 'api'); return { ok: true, how: 'ucp', changed: true, note: 'Ya no está en el catálogo de la tienda.' } }
      const m = e instanceof UcpError ? e.message : 'No se pudo consultar la tienda.'
      await sb.from('external_products').update({ verify_note: m }).eq('id', id)
      return { ok: false, how: 'manual', changed: false, note: `${m} Indica tú el precio y la disponibilidad que ves en la tienda.` }
    }
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

/**
 * Enlace de compra de un resultado o producto de Channel3: se pide la ficha ACTUAL (gratis) en el momento del clic y se
 * devuelve su enlace de oferta (temporal, nunca guardado). Solo para productos de tus búsquedas o de tu lista.
 */
export async function channel3OfferUrl(sb: Sb, uid: string, ref: { search_id?: string | null; index?: number | null; product_id?: string | null }) {
  let m: C3Meta | null = null
  if (ref.product_id) { const { data } = await sb.from('external_products').select('raw_attributes').eq('id', ref.product_id).maybeSingle(); if (data && isChannel3(data)) m = data.raw_attributes as C3Meta }
  else if (ref.search_id && ref.index != null) { const s = await getSearch(sb, ref.search_id); const h = (s.results as Row[])[ref.index]; if (h && isChannel3(h)) m = h.raw_attributes as C3Meta }
  if (!m) throw new WardrobeError('Ese producto no viene de Channel3.', 404)
  const meter = new Channel3Meter()
  try {
    const { offerUrl } = await channel3Source([], channel3Config(), { meter }).getById(m.channel3_id, { market: m.market, domain: m.domain })
    if (!offerUrl) throw new WardrobeError('Channel3 ya no tiene una oferta para este producto.', 404)
    return offerUrl
  } catch (e) {
    if (e instanceof Channel3Error) throw new WardrobeError(e.code === 'not_found' ? 'Ese producto ya no está en el catálogo de Channel3.' : e.message, e.code === 'not_found' ? 404 : 502)
    throw e
  } finally { await sb.from('ai_runs').insert({ user_id: uid, kind: 'product_offer', model: 'reglas', meta: { channel3: meter.summary() } }) }
}
export const channel3Configured = () => !!channel3Config().key

/** Antes de mostrar un producto de Channel3: si su ficha tiene más de 30 min, se pide la actual (gratis) y se guarda. */
export async function refreshChannel3Product(sb: Sb, uid: string, id: string, maxAgeMin = 30) {
  const { data } = await sb.from('external_products').select('id, raw_attributes, last_verified_at').eq('id', id).maybeSingle()
  if (!data || !isChannel3(data) || !channel3Config().key) return null
  if (data.last_verified_at && Date.now() - new Date(data.last_verified_at).getTime() < maxAgeMin * 60e3) return null
  return verifyProduct(sb, uid, id)
}

/**
 * Búsqueda estratégica (2.0E): productos reales que materializan una oportunidad de estilo. Varias consultas
 * complementarias (facetas), solo en tu mercado y dentro del presupuesto de Channel3 de la estrategia; los mismos
 * filtros previos (moda masculina, tu talla disponible) y la misma evaluación 4C; selección diversificada por marca.
 */
export async function searchForOpportunity(sb: Sb, uid: string, opportunityId: string, opts: { force?: boolean } = {}) {
  const { data: op } = await sb.from('style_opportunities').select('*').eq('id', opportunityId).maybeSingle()
  if (!op) throw new WardrobeError('Oportunidad no encontrada', 404)
  const t = op.detail?.target
  if (!op.purchase || !t) throw new WardrobeError('Esta oportunidad no requiere comprar nada o no tiene un objetivo concreto que buscar.')
  // Presupuesto de Channel3 de la estrategia (créditos ya gastados en sus búsquedas)
  const { data: siblings } = await sb.from('style_opportunities').select('id').eq('strategy_id', op.strategy_id)
  const { data: prev } = await sb.from('shopping_searches').select('query').in('opportunity_id', (siblings ?? []).map((x) => x.id))
  const spent = (prev ?? []).reduce((n, r) => n + (Number((r.query as Row)?.coverage?.channel3_credits) || 0), 0)
  const prefs = await prefsOf(sb)
  const q: ProductSearchQuery = { text: `${t.label} hombre`, category: t.category, subcategory: t.subcategory, colors: [], cut: t.cut ?? null, materials: t.material ?? null, price_min: null, price_max: null, retailers: prefs?.preferred_retailers ?? [], excluded: prefs?.excluded_retailers ?? [], need_id: null }
  let facets: ReturnType<typeof opportunityFacets> = []
  const res = await runSearch(sb, uid, {
    q, need: null, force: opts.force, opportunityId: op.id, diversify: true, cacheExtra: `|op:${op.id}:${op.key}`,
    plan: (ctx) => {
      const fav = t.category && !(t.colors_ok ?? []).length && !t.material ? suggestColors(t.category, ctx, 2) : []
      facets = opportunityFacets(t, { favorableColors: fav })
      return { queries: facets.map((f) => facetQuery(q, f)), notes: [`Búsqueda para la oportunidad «${op.title}»: ${facets.length} consultas complementarias.`] }
    },
    c3: { localOnly: true, budget: () => DISCOVERY_C3_BUDGET - spent },
    facetsInfo: () => facets.map((f) => ({ id: f.id, label: f.label, text: f.text })),
    matcher: (h) => matchOpportunity(h, t),
    extraQuery: { opportunity: { id: op.id, title: op.title, mode: op.mode, strategy_id: op.strategy_id }, budget: { strategy_c3: DISCOVERY_C3_BUDGET, spent_before: spent } },
  })
  return { ...res, facets }
}
