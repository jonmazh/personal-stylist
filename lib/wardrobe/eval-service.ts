import { configError, MODEL_VISION, providerId } from '@/lib/ai/client'
import { effectiveModel, generateStructured, newUsage } from '@/lib/ai/structured'
import { loadBundle, type Bundle } from '@/lib/profile/data'
import { DECISIONS, evaluateGarment, snapshot, type DecisionId } from './compatibility'
import { FIT_ASSESSOR, FIT_PROMPT_VERSION, FitAISchema, MAX_WORN, buildFitPrompt, normalizeFit, type ReviewDim } from './fit'
import { WardrobeError, type Sb } from './service'

/**
 * Evaluacion personal (fase 2C): compatibilidad y valor estrategico se calculan con reglas en cada consulta
 * (si cambia tu perfil o tu armario, cambian); el ajuste real sale de la ultima evaluacion confirmada.
 */
const missingTable = (m?: string) => !!m && /schema cache|does not exist/i.test(m)

export async function latestFitReviews(sb: Sb, garmentId: string) {
  const { data, error } = await sb.from('garment_fit_reviews').select('*').eq('garment_id', garmentId).order('created_at', { ascending: false }).limit(10)
  if (error && !missingTable(error.message)) throw new WardrobeError(error.message, 500)
  return data ?? []
}
export async function decisionsOf(sb: Sb, garmentId: string) {
  const { data, error } = await sb.from('garment_decisions').select('*').eq('garment_id', garmentId).order('created_at', { ascending: false }).limit(20)
  if (error && !missingTable(error.message)) throw new WardrobeError(error.message, 500)
  return data ?? []
}

export async function evaluationFor(sb: Sb, uid: string, g: Record<string, any>, imageCount: number, bundle?: Bundle) {
  const [b, reviews] = await Promise.all([bundle ?? loadBundle(sb, uid), latestFitReviews(sb, g.id)])
  const confirmed = reviews.find((r) => r.status === 'confirmed') ?? null
  const proposed = reviews.find((r) => r.status === 'proposed') ?? null
  return { ...evaluateGarment(g, b, { others: b.garments, imageCount, fitReview: confirmed }), reviews, confirmed, proposed, bundle: b }
}

/** Evaluaciones de todo el armario de una vez (tarjetas del panel). */
export async function evaluationsForList(sb: Sb, uid: string, rows: Record<string, any>[], bundle?: Bundle) {
  if (!rows.length) return new Map<string, ReturnType<typeof evaluateGarment>>()
  const b = bundle ?? await loadBundle(sb, uid)
  const { data: fr } = await sb.from('garment_fit_reviews').select('*').eq('status', 'confirmed').in('garment_id', rows.map((r) => r.id)).order('created_at', { ascending: false })
  const fit = new Map<string, Record<string, any>>()
  for (const r of fr ?? []) if (!fit.has(r.garment_id)) fit.set(r.garment_id, r)
  return new Map(rows.map((g) => [g.id as string, evaluateGarment(g, b, { others: b.garments, imageCount: g.image_count ?? 0, fitReview: fit.get(g.id) })]))
}

/** Propuesta de ajuste con IA a partir de las fotos «llevandola puesta». No cuenta hasta que la confirmas. */
export async function assessFit(sb: Sb, uid: string, garmentId: string) {
  const cfg = configError()
  if (cfg) throw new WardrobeError(cfg, 503)
  const { data: g } = await sb.from('garments').select('*').eq('id', garmentId).maybeSingle()
  if (!g) throw new WardrobeError('Prenda no encontrada', 404)
  if (!g.subcategory && !g.category) throw new WardrobeError('Indica primero qué tipo de prenda es.')
  const { data: imgs } = await sb.from('garment_images').select('id, storage_path, position').eq('garment_id', garmentId).eq('role', 'worn').order('position')
  const worn = (imgs ?? []).slice(0, MAX_WORN)
  if (!worn.length) throw new WardrobeError('Sube al menos una foto tuya llevándola puesta (función «Llevándola puesta»): el ajuste no se puede valorar con la prenda sola.')
  const parts: { type: 'image_url'; image_url: { url: string; detail: 'high' } }[] = []
  let bytes = 0
  for (const i of worn) {
    const { data: blob } = await sb.storage.from('wardrobe-originals').download(i.storage_path)
    if (!blob) throw new WardrobeError('No se pudo leer una de las fotos', 500)
    const buf = Buffer.from(await blob.arrayBuffer()); bytes += buf.length
    parts.push({ type: 'image_url', image_url: { url: `data:${blob.type || 'image/jpeg'};base64,${buf.toString('base64')}`, detail: 'high' } })
  }
  const usage = newUsage()
  const ai = await generateStructured({ kind: 'vision', model: MODEL_VISION(), schema: FitAISchema, system: FIT_ASSESSOR, usage, user: [{ type: 'text', text: buildFitPrompt(g, worn.length) }, ...parts] })
  const n = normalizeFit(ai, g)
  const model = `${providerId()}:${effectiveModel('vision', MODEL_VISION())}`
  await sb.from('garment_fit_reviews').update({ status: 'superseded' }).eq('garment_id', garmentId).eq('status', 'proposed')
  const { data: row, error } = await sb.from('garment_fit_reviews').insert({
    user_id: uid, garment_id: garmentId, source: 'ia', status: 'proposed', model_id: model, prompt_version: FIT_PROMPT_VERSION, image_ids: worn.map((i) => i.id),
    dimensions: n.dimensions, overall: n.overall, provisional: n.provisional, photo_issues: n.issues, limitations: n.limitations, notes: ai.summary || null, ai_result: ai, usage,
  }).select('*').single()
  if (error) throw new WardrobeError(missingTable(error.message) ? 'Ejecuta la migración 0009 en Supabase.' : error.message, 500)
  await sb.from('garment_events').insert({ user_id: uid, garment_id: garmentId, kind: 'fit_reviewed', source: 'ia', changes: { review_id: row.id, status: 'proposed', overall: n.overall } })
  await sb.from('ai_runs').insert({ user_id: uid, kind: 'fit_assessment', model, meta: { garment_id: garmentId, review_id: row.id, images: worn.length, bytes, usage } })
  return row
}

/**
 * Guarda una evaluacion de ajuste: confirmando (y corrigiendo) la propuesta de la IA o como autoevaluacion.
 * La anterior confirmada queda como historial («superseded»).
 */
export async function saveFitReview(sb: Sb, uid: string, garmentId: string, input: { dims: ReviewDim[]; notes?: string | null; proposalId?: string | null }) {
  const { data: g } = await sb.from('garments').select('id').eq('id', garmentId).maybeSingle()
  if (!g) throw new WardrobeError('Prenda no encontrada', 404)
  if (!input.dims.some((d) => d.score !== null)) throw new WardrobeError('Valora al menos una dimensión (o déjala en «no lo sé» si no puedes juzgarla).')
  const seen = input.dims.filter((d) => d.score !== null)
  const overall = Math.round((seen.reduce((s, d) => s + d.score!, 0) / seen.length) * 10) / 10
  const provisional = seen.length < input.dims.length
  const now = new Date().toISOString()
  let id: string
  if (input.proposalId) {
    const { data: p } = await sb.from('garment_fit_reviews').select('*').eq('id', input.proposalId).eq('garment_id', garmentId).maybeSingle()
    if (!p) throw new WardrobeError('Propuesta no encontrada', 404)
    if (p.status !== 'proposed') throw new WardrobeError('Esta propuesta ya se revisó o fue sustituida.', 409)
    // Conserva la confianza de la IA en lo que no se ha cambiado
    const dims = input.dims.map((d) => { const o = (p.dimensions as ReviewDim[]).find((x) => x.key === d.key); return { ...d, confidence: o && o.score === d.score ? o.confidence : null, edited: !o || o.score !== d.score } })
    await sb.from('garment_fit_reviews').update({ status: 'superseded' }).eq('garment_id', garmentId).eq('status', 'confirmed')
    const { error } = await sb.from('garment_fit_reviews').update({ status: 'confirmed', dimensions: dims, overall, provisional: provisional || (p.provisional && !dims.some((d) => d.edited)), notes: input.notes ?? p.notes, confirmed_at: now }).eq('id', p.id)
    if (error) throw new WardrobeError(error.message, 500)
    id = p.id
  } else {
    await sb.from('garment_fit_reviews').update({ status: 'superseded' }).eq('garment_id', garmentId).in('status', ['confirmed', 'proposed'])
    const { data, error } = await sb.from('garment_fit_reviews').insert({ user_id: uid, garment_id: garmentId, source: 'usuario', status: 'confirmed', dimensions: input.dims, overall, provisional, notes: input.notes ?? null, confirmed_at: now }).select('id').single()
    if (error) throw new WardrobeError(missingTable(error.message) ? 'Ejecuta la migración 0009 en Supabase.' : error.message, 500)
    id = data.id
  }
  await sb.from('garment_events').insert({ user_id: uid, garment_id: garmentId, kind: 'fit_reviewed', changes: { review_id: id, status: 'confirmed', overall, source: input.proposalId ? 'ia' : 'usuario' } })
  return { id, overall, provisional }
}

export async function discardFitProposal(sb: Sb, garmentId: string, proposalId: string) {
  await sb.from('garment_fit_reviews').update({ status: 'discarded' }).eq('id', proposalId).eq('garment_id', garmentId).eq('status', 'proposed')
}

/** Decision sobre la prenda: siempre la toma el usuario; se guarda con la propuesta y las puntuaciones de ese momento. */
export async function decideGarment(sb: Sb, uid: string, garmentId: string, input: { decision: string; reason?: string | null; alteration?: string | null }) {
  if (!DECISIONS.some((d) => d.id === input.decision)) throw new WardrobeError('Decisión no válida')
  const { data: g } = await sb.from('garments').select('*').eq('id', garmentId).maybeSingle()
  if (!g) throw new WardrobeError('Prenda no encontrada', 404)
  const { count } = await sb.from('garment_images').select('id', { count: 'exact', head: true }).eq('garment_id', garmentId)
  const ev = await evaluationFor(sb, uid, g, count ?? 0)
  const snap = snapshot(ev)
  const { error } = await sb.from('garment_decisions').insert({
    user_id: uid, garment_id: garmentId, decision: input.decision as DecisionId, reason: input.reason?.slice(0, 500) || null,
    alteration: input.decision === 'modify' ? input.alteration?.slice(0, 300) || null : null, proposed: ev.proposal.decision, followed_proposal: ev.proposal.decision === input.decision, scores: snap,
  })
  if (error) throw new WardrobeError(missingTable(error.message) ? 'Ejecuta la migración 0009 en Supabase.' : error.message, 500)
  await sb.from('garments').update({ decision: input.decision, decision_at: new Date().toISOString() }).eq('id', garmentId)
  await sb.from('garment_events').insert({ user_id: uid, garment_id: garmentId, kind: 'decided', changes: { decision: [g.decision ?? null, input.decision], proposed: ev.proposal.decision } })
  return { decision: input.decision, proposed: ev.proposal.decision, scores: snap }
}
