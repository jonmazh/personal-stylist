import { createHash } from 'node:crypto'
import { z } from 'zod'
import { configError, MODEL_CHAT, MODEL_VISION, providerId } from '@/lib/ai/client'
import { effectiveModel, generateStructured, newUsage } from '@/lib/ai/structured'
import { WardrobeError, type Sb } from '@/lib/wardrobe/service'
import { garmentTitle } from '@/lib/wardrobe/display'
import { prepareEngine } from '@/lib/outfits/generate-service'
import { MAX_PRODUCT_IMAGES, PRODUCT_ANALYST, PRODUCT_PROMPT_VERSION, PRODUCT_SCHEMA_VERSION, ProductAnalysisSchema, applyAnalysis, buildProductPrompt, normalizeProductAnalysis, type NormalizedProductAnalysis } from './analyzer'
import { evaluatePurchase, type PurchaseEvaluation } from './evaluate'
import { MEASURES, measureSet, recommendSize } from './sizing'
import { getProduct } from './catalog-service'
import { listNeeds } from './service'
import { safeFetch } from './catalog/net'
import { NeedSpec } from './taxonomy'

/** Product Analyzer y Purchase Evaluator (fase 4C): análisis con IA versionado, evaluación de compra, tallas y comparación. */
type Row = Record<string, any>
const dbErr = (m: string) => new WardrobeError(/schema cache|does not exist/i.test(m) ? 'Ejecuta la migración 0018 en Supabase.' : m, 500)

/** Imágenes que se pueden enviar a la IA: tus capturas y las de un feed autorizado. Las de páginas de tiendas solo se enlazan. */
async function analysisImages(sb: Sb, p: Row) {
  const out: { origin: 'user' | 'feed'; ref: string; url: string; bytes: number }[] = []
  for (const i of (p.images as Row[]).filter((x) => x.origin === 'user' && x.storage_path)) {
    if (out.length >= MAX_PRODUCT_IMAGES) break
    const { data: blob } = await sb.storage.from('shopping-private').download(i.storage_path)
    if (!blob) continue
    const buf = Buffer.from(await blob.arrayBuffer())
    out.push({ origin: 'user', ref: i.storage_path, url: `data:${blob.type || 'image/jpeg'};base64,${buf.toString('base64')}`, bytes: buf.length })
  }
  if (p.source_kind === 'feed') for (const i of (p.images as Row[]).filter((x) => x.origin === 'store' && x.url)) {
    if (out.length >= MAX_PRODUCT_IMAGES) break
    try {
      const r = await safeFetch(i.url, { binary: true, accept: /^image\//, maxBytes: 5_000_000, timeoutMs: 8000 })
      if (r.status < 400 && r.bytes) out.push({ origin: 'feed', ref: i.url, url: `data:${r.contentType.split(';')[0]};base64,${r.bytes.toString('base64')}`, bytes: r.bytes.length })
    } catch { /* imagen no disponible: se analiza sin ella */ }
  }
  return out
}

/** Analiza un producto con IA (texto de la tienda + imágenes permitidas). Repetir el mismo análisis no vuelve a llamar a la IA. */
export async function analyzeProduct(sb: Sb, uid: string, id: string, opts: { force?: boolean } = {}) {
  const cfg = configError(); if (cfg) throw new WardrobeError(cfg, 503)
  const p = await getProduct(sb, id)
  const imgs = await analysisImages(sb, p)
  const key = createHash('sha256').update([PRODUCT_PROMPT_VERSION, PRODUCT_SCHEMA_VERSION, p.product_name, p.description ?? '', p.confirmed_composition ?? '', p.field_sources?.subcategory?.source === 'user' ? p.subcategory : '', ...imgs.map((i) => createHash('sha256').update(i.url).digest('hex'))].join('|')).digest('hex').slice(0, 40)
  if (!opts.force) {
    const { data: prev } = await sb.from('product_analyses').select('*').eq('product_id', id).eq('input_key', key).eq('status', 'ok').order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (prev) { await sb.from('ai_runs').insert({ user_id: uid, kind: 'product_analysis', model: prev.model_id, meta: { product_id: id, analysis_id: prev.id, cached: true } }); return { analysis: prev, cached: true } }
  }
  const kind = imgs.length ? 'vision' : 'chat'
  const configured = imgs.length ? MODEL_VISION() : MODEL_CHAT()
  const model = `${providerId()}:${effectiveModel(kind, configured)}`
  const usage = newUsage()
  let ai
  try {
    ai = await generateStructured({
      kind, model: configured, schema: ProductAnalysisSchema, system: PRODUCT_ANALYST, usage,
      user: imgs.length ? [{ type: 'text', text: buildProductPrompt(p, imgs) }, ...imgs.map((i) => ({ type: 'image_url' as const, image_url: { url: i.url, detail: 'high' as const } }))] : buildProductPrompt(p, []),
    })
  } catch (e) {
    await sb.from('product_analyses').insert({ user_id: uid, product_id: id, prompt_version: PRODUCT_PROMPT_VERSION, schema_version: PRODUCT_SCHEMA_VERSION, model_id: model, input_key: key, status: 'failed', error: (e as Error).message.slice(0, 500), usage })
    throw new WardrobeError(`No se pudo analizar el producto: ${(e as Error).message}`, 502)
  }
  const n = normalizeProductAnalysis(ai, p, imgs.length > 0)
  const { data: row, error } = await sb.from('product_analyses').insert({
    user_id: uid, product_id: id, prompt_version: PRODUCT_PROMPT_VERSION, schema_version: PRODUCT_SCHEMA_VERSION, model_id: model, input_key: key,
    images_used: imgs.map((i) => ({ origin: i.origin, ref: i.ref })), result: ai, normalized: n, quality: n.quality, overall_confidence: n.overall, usage,
  }).select('*').single()
  if (error) throw dbErr(error.message)
  const patch = applyAnalysis(p, n, row.id)
  await sb.from('external_products').update(patch).eq('id', id)
  await sb.from('ai_runs').insert({ user_id: uid, kind: 'product_analysis', model, meta: { product_id: id, analysis_id: row.id, images: imgs.map((i) => i.origin), bytes: imgs.reduce((s, i) => s + i.bytes, 0), usage, cached: false } })
  return { analysis: row, cached: false }
}

export async function latestAnalysis(sb: Sb, productId: string) {
  const { data } = await sb.from('product_analyses').select('*').eq('product_id', productId).eq('status', 'ok').order('created_at', { ascending: false }).limit(1).maybeSingle()
  return data as (Row & { normalized: NormalizedProductAnalysis }) | null
}

// ── Medidas y tallas ──
const Measures = z.record(z.string(), z.number().min(1).max(250))
export async function setGarmentMeasurements(sb: Sb, uid: string, garmentId: string, raw: unknown) {
  const p = z.object({ measurements: Measures, fits_well: z.boolean().default(true), note: z.string().trim().max(300).nullable().optional() }).safeParse(raw)
  if (!p.success) throw new WardrobeError('Medidas no válidas: en centímetros, entre 1 y 250.')
  const { data: g } = await sb.from('garments').select('id, subcategory, category').eq('id', garmentId).maybeSingle()
  if (!g) throw new WardrobeError('Prenda no encontrada', 404)
  const set = measureSet(g.subcategory, g.category)
  if (!set) throw new WardrobeError('Para este tipo de prenda no se comparan medidas.')
  const m = Object.fromEntries(Object.entries(p.data.measurements).filter(([k]) => set.some((x) => x.key === k)))
  if (!Object.keys(m).length) throw new WardrobeError(`Indica al menos una medida: ${set.map((x) => x.label.toLowerCase()).join(', ')}.`)
  const { error } = await sb.from('garment_measurements').upsert({ user_id: uid, garment_id: garmentId, measurements: m, fits_well: p.data.fits_well, note: p.data.note ?? null, measured_at: new Date().toISOString() }, { onConflict: 'garment_id' })
  if (error) throw dbErr(error.message)
}
/** Guía de medidas de un producto, copiada por ti de la web de la tienda (procedencia «tú»). */
export async function setSizeChart(sb: Sb, uid: string, productId: string, raw: unknown) {
  const p = z.array(z.object({ size: z.string().trim().min(1).max(30), measurements: Measures })).min(1).max(20).safeParse(raw)
  if (!p.success) throw new WardrobeError('Guía de medidas no válida.')
  const prod = await getProduct(sb, productId)
  const set = measureSet(prod.subcategory, prod.category)
  if (!set) throw new WardrobeError('Identifica antes el tipo de prenda (o analiza el producto).')
  const now = new Date().toISOString()
  for (const r of p.data) {
    const m = Object.fromEntries(Object.entries(r.measurements).filter(([k]) => set.some((x) => x.key === k)))
    const existing = (prod.variants as Row[]).find((v) => String(v.size).toLowerCase() === r.size.toLowerCase())
    if (existing) await sb.from('external_product_variants').update({ measurements: m, measurements_source: 'user' }).eq('id', existing.id)
    else await sb.from('external_product_variants').insert({ user_id: uid, product_id: productId, size: r.size, measurements: m, measurements_source: 'user', availability: 'unknown', checked_at: now })
  }
}
/** Prendas tuyas con medidas que sirven de referencia para este tipo de prenda (primero las del mismo tipo). */
export async function referenceGarments(sb: Sb, product: Row) {
  const set = measureSet(product.subcategory, product.category)
  if (!set) return []
  const { data } = await sb.from('garment_measurements').select('*, garments(id, name, brand, category, subcategory, primary_color, size_label, size_fit, wardrobe_status)').eq('fits_well', true)
  return (data ?? []).filter((r) => r.garments && measureSet(r.garments.subcategory, r.garments.category) === set)
    .sort((a, z) => Number(z.garments.subcategory === product.subcategory) - Number(a.garments.subcategory === product.subcategory))
    .map((r) => ({ id: r.garment_id as string, title: garmentTitle(r.garments), measurements: r.measurements as Record<string, number>, garment: r.garments }))
}

// ── Evaluación de compra ──
export async function evaluateProduct(sb: Sb, uid: string, id: string, opts: { reference_id?: string | null } = {}) {
  const p = await getProduct(sb, id)
  const [prep, needs, analysis, refs] = await Promise.all([prepareEngine(sb, uid), listNeeds(sb), latestAnalysis(sb, id), referenceGarments(sb, p)])
  const need = p.need_id ? (needs.find((n: Row) => n.id === p.need_id) ?? (await sb.from('shopping_needs').select('*').eq('id', p.need_id).maybeSingle()).data) : null
  const needT = need ? { ...need, spec: NeedSpec.safeParse(need.spec).success ? NeedSpec.parse(need.spec) : need.spec } : null
  const reference = refs.find((r) => r.id === opts.reference_id) ?? refs[0] ?? null
  const sameBrand = prep.garments.find((g) => g.size_fit && p.brand && String(g.brand ?? '').toLowerCase() === String(p.brand).toLowerCase() && measureSet(g.subcategory, g.category) === measureSet(p.subcategory, p.category))
  const size = recommendSize({
    subcategory: p.subcategory, category: p.category, composition: p.confirmed_composition, reference,
    chart: (p.variants as Row[]).map((v) => ({ size: v.size, measurements: v.measurements ?? {}, availability: v.availability })),
    usualSize: sameBrand ? { size: sameBrand.size_fit, from: `«${garmentTitle(sameBrand)}» (${sameBrand.brand})` } : null,
  })
  const hist = (p.history as Row[]).filter((h) => h.price != null)
  const first = hist.length ? Number(hist[hist.length - 1].price) : null
  const drop = first != null && p.current_price != null && first > Number(p.current_price) ? Math.round((first - Number(p.current_price)) * 100) / 100 : null
  const staleDays = p.last_verified_at ? (Date.now() - new Date(p.last_verified_at).getTime()) / 864e5 : null
  const { data: needAssess } = need ? await sb.from('shopping_need_assessments').select('expected_wears_month').eq('need_id', need.id).order('created_at', { ascending: false }).limit(1).maybeSingle() : { data: null }
  const e: PurchaseEvaluation = evaluatePurchase(p, {
    garments: prep.garments, evals: prep.evals, bundle: prep.bundle, signals: prep.signals, need: needT, openNeeds: needs, size, staleDays,
    analyzed: !!analysis, quality: analysis?.normalized?.quality ?? null, modelPhotos: !!analysis?.normalized?.model_photos, priceDrop: drop,
    usesPerMonth: needAssess?.expected_wears_month != null ? Number(needAssess.expected_wears_month) : null,
  })
  const { data: row, error } = await sb.from('purchase_evaluations').insert({
    user_id: uid, product_id: id, need_id: need?.id ?? null, engine_version: e.version, weights: e.weights, score: e.score, confidence: e.confidence, criteria: e.criteria,
    // Detalle de Personal Shopper Intelligence (sin columnas nuevas): WVA, color, confianza, completitud, redundancia, motivos
    indicators: { ...e.indicators, detail: { wva: e.wva, combines_with: e.combines_with, color: e.color, confidence_score: e.confidence_score, completeness: e.completeness, redundancy_score: e.redundancy_score, missing_info: e.missing_info, discard_reasons: e.discard_reasons } },
    redundancy: e.redundancy, size, verdict: e.verdict, verdict_text: e.verdict_text, reasons: e.reasons, risks: e.risks, limitations: e.limitations,
  }).select('*').single()
  if (error) throw dbErr(error.message)
  return flatten(row)
}
const flatten = (row: Row | null) => (row ? { ...row, ...(row.indicators?.detail ?? {}) } : row)
export async function latestEvaluation(sb: Sb, productId: string) {
  const { data } = await sb.from('purchase_evaluations').select('*').eq('product_id', productId).order('created_at', { ascending: false }).limit(1).maybeSingle()
  return flatten(data)
}

/** Comparar varios candidatos: su última evaluación (o una nueva si no la tienen), ordenados por puntuación de compra. */
export async function compareProducts(sb: Sb, uid: string, ids: string[]) {
  const uniq = [...new Set(ids)].slice(0, 4)
  if (uniq.length < 2) throw new WardrobeError('Elige al menos dos productos para comparar.')
  const out = []
  for (const id of uniq) {
    const p = await getProduct(sb, id)
    const ev = (await latestEvaluation(sb, id)) ?? (await evaluateProduct(sb, uid, id))
    out.push({ product: p, evaluation: ev })
  }
  return out.sort((a, z) => Number(z.evaluation.score) - Number(a.evaluation.score))
}
export { MEASURES }
