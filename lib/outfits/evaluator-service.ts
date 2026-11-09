import { z } from 'zod'
import { configError, MODEL_CHAT, MODEL_VISION, providerId } from '@/lib/ai/client'
import { effectiveModel, generateStructured, newUsage } from '@/lib/ai/structured'
import { WardrobeError, type Sb } from '@/lib/wardrobe/service'
import { GenerateRequest, resolveContext } from './engine/context'
import { learnedContext } from './engine/generate'
import { scoreEnv, scoreOutfit } from './engine/scoring'
import { EVALUATOR, EVALUATOR_VERSION, EvalSchema, VISUAL, VISUAL_VERSION, VisualSchema, evaluatorPrompt, normalizeVisual, visualPrompt } from './evaluator'
import { prepareEngine } from './generate-service'
import { profileSummary } from './stylist/service'
import { checkComposition, rolesFor, snapshotOf } from './taxonomy'

/** Outfit Evaluator (fase 3D): evaluaciones teóricas y visuales, guardadas con su modelo y versión. */
const BUCKET = 'outfits-private'
const dbErr = (m: string) => new WardrobeError(/schema cache|does not exist/i.test(m) ? 'Ejecuta la migración 0014 en Supabase.' : m, 500)
type Row = Record<string, any>
export const TheoreticalInput = z.object({
  outfit_id: z.string().uuid().optional(), items: z.array(z.object({ garment_id: z.string().uuid(), role: z.string() })).max(12).optional(),
  occasion: z.string().nullable().optional(), dress_code: z.string().nullable().optional(), weather: z.string().nullable().optional(),
})

async function outfitItems(sb: Sb, outfitId: string) {
  const { data: o } = await sb.from('outfits').select('id, occasion, outfit_items(garment_id, item_role)').eq('id', outfitId).maybeSingle()
  if (!o) throw new WardrobeError('Conjunto no encontrado', 404)
  return { occasion: o.occasion as string | null, items: (o.outfit_items ?? []).filter((i: Row) => i.garment_id).map((i: Row) => ({ garment_id: i.garment_id as string, role: i.item_role as string })) }
}

/** Modo A: seleccionas prendas (o un conjunto) y el motor + el estilista lo evalúan. No necesita foto. */
export async function evaluateTheoretical(sb: Sb, uid: string, raw: unknown) {
  const p = TheoreticalInput.safeParse(raw ?? {}); if (!p.success) throw new WardrobeError('Evaluación no válida')
  let items = p.data.items ?? [], occasion = p.data.occasion ?? null
  if (p.data.outfit_id) { const o = await outfitItems(sb, p.data.outfit_id); items = o.items; occasion = occasion ?? o.occasion }
  if (items.length < 2) throw new WardrobeError('Elige al menos dos prendas para evaluar un conjunto.')
  const prep = await prepareEngine(sb, uid)
  for (const i of items) if (!prep.byId.has(i.garment_id)) throw new WardrobeError('Alguna prenda no está en tu armario activo.')
  const req = GenerateRequest.safeParse({ occasion, dress_code: p.data.dress_code ?? null, weather: p.data.weather ?? null })
  if (!req.success) throw new WardrobeError('Contexto no válido')
  const errors = checkComposition(items, prep.byId).filter((x) => x.level === 'error')
  if (errors.length) throw new WardrobeError(errors.map((e) => e.text).join(' '))
  const ctx = learnedContext(resolveContext(req.data), prep.signals)
  const slots = items.map((i) => ({ role: i.role, g: prep.byId.get(i.garment_id)! }))
  const sc = scoreOutfit(slots, scoreEnv(ctx, prep.bundle, prep.evals, undefined, prep.signals))
  let ai: Row | null = null, usage = null, modelId: string | null = null
  if (!configError()) {
    try {
      const u = newUsage()
      const out = await generateStructured({ kind: 'chat', model: MODEL_CHAT(), schema: EvalSchema, system: EVALUATOR, usage: u, user: evaluatorPrompt({
        context: `${ctx.summary.join(' · ') || 'sin ocasión indicada'}; formalidad ${ctx.formality.join('–')}/5`, profile: profileSummary(prep.bundle),
        items: slots.map((s) => ({ garment_id: s.g.id, role: s.role, title: s.g.title })), score: sc.total, criteria: sc.criteria,
        available: prep.garments.map((g) => ({ id: g.id, title: g.title, roles: rolesFor(g) })),
      }) })
      // Sugerencias: solo prendas reales que puedan ocupar esa funcion
      const dropped: string[] = []
      const suggestions = out.suggestions.filter((s) => { const g = prep.byId.get(s.garment_id); const ok = !!g && rolesFor(g).includes(s.role as never); if (!ok) dropped.push('Una sugerencia citaba una prenda que no está en tu armario o no encaja en esa función.'); return ok })
        .map((s) => ({ ...s, title: prep.byId.get(s.garment_id)!.title }))
      ai = { ...out, suggestions, dropped }
      usage = u; modelId = `${providerId()}:${effectiveModel('chat', MODEL_CHAT())}`
      await sb.from('ai_runs').insert({ user_id: uid, kind: 'outfit_evaluation', model: modelId, meta: { usage, mode: 'theoretical' } })
    } catch (e) { ai = { error: e instanceof Error ? e.message.slice(0, 160) : 'error' } }
  }
  const { data, error } = await sb.from('outfit_evaluations').insert({
    user_id: uid, outfit_id: p.data.outfit_id ?? null, mode: 'theoretical', garment_ids: items.map((i) => i.garment_id),
    items: slots.map((s) => ({ garment_id: s.g.id, role: s.role, title: s.g.title, snapshot: snapshotOf(s.g, s.g.title) })),
    context: { request: req.data, summary: ctx.summary, formality: ctx.formality }, score: sc.total, breakdown: { criteria: sc.criteria, confidence: sc.confidence, confidenceWhy: sc.confidenceWhy, warnings: sc.warnings },
    ai, model: modelId, prompt_version: ai && !ai.error ? EVALUATOR_VERSION : null, usage,
  }).select('id').single()
  if (error) throw dbErr(error.message)
  return data.id as string
}

export const VisualInput = z.object({ photo_path: z.string().min(10), outfit_id: z.string().uuid().nullable().optional(), keep_photo: z.boolean().default(false), occasion: z.string().nullable().optional() })

/** Modo B: foto del conjunto puesto. La foto es privada y, salvo que pidas conservarla, se borra tras el análisis. */
export async function evaluateVisual(sb: Sb, uid: string, raw: unknown) {
  const p = VisualInput.safeParse(raw ?? {}); if (!p.success) throw new WardrobeError('Evaluación no válida')
  if (!p.data.photo_path.startsWith(`${uid}/`)) throw new WardrobeError('La foto no es tuya.', 403)
  const cfg = configError(); if (cfg) throw new WardrobeError(`La evaluación visual necesita la IA: ${cfg}`, 503)
  let planned: { garment_id: string; role: string; title: string }[] | null = null, occasion = p.data.occasion ?? null
  if (p.data.outfit_id) {
    const o = await outfitItems(sb, p.data.outfit_id)
    const { data: gs } = await sb.from('garments').select('*').in('id', o.items.map((i) => i.garment_id))
    planned = o.items.map((i) => { const g = (gs ?? []).find((x) => x.id === i.garment_id); return { ...i, title: g?.name ?? g?.subcategory ?? 'Prenda' } })
    occasion = occasion ?? o.occasion
  }
  const { data: blob, error: de } = await sb.storage.from(BUCKET).download(p.data.photo_path)
  if (de || !blob) throw new WardrobeError('No se pudo leer la foto.', 400)
  const buf = Buffer.from(await blob.arrayBuffer())
  const usage = newUsage()
  const ai = await generateStructured({ kind: 'vision', model: MODEL_VISION(), schema: VisualSchema, system: VISUAL, usage, user: [
    { type: 'text', text: visualPrompt(planned, occasion ?? 'sin ocasión indicada') },
    { type: 'image_url', image_url: { url: `data:${blob.type || 'image/jpeg'};base64,${buf.toString('base64')}`, detail: 'high' } },
  ] })
  const n = normalizeVisual(ai)
  const modelId = `${providerId()}:${effectiveModel('vision', MODEL_VISION())}`
  let photoPath: string | null = p.data.photo_path, deletedAt: string | null = null
  if (!p.data.keep_photo) { await sb.storage.from(BUCKET).remove([p.data.photo_path]); photoPath = null; deletedAt = new Date().toISOString() }
  const { data, error } = await sb.from('outfit_evaluations').insert({
    user_id: uid, outfit_id: p.data.outfit_id ?? null, mode: 'visual', garment_ids: planned?.map((x) => x.garment_id) ?? [], items: planned ?? [],
    context: { occasion }, score: n.overall != null ? Math.round(n.overall * 10) : null, ai: n, photo_path: photoPath, photo_deleted_at: deletedAt,
    model: modelId, prompt_version: VISUAL_VERSION, usage,
  }).select('id').single()
  if (error) throw dbErr(error.message)
  await sb.from('ai_runs').insert({ user_id: uid, kind: 'outfit_evaluation', model: modelId, meta: { usage, mode: 'visual', bytes: buf.length } })
  return data.id as string
}

export async function getEvaluation(sb: Sb, id: string) {
  const { data, error } = await sb.from('outfit_evaluations').select('*').eq('id', id).maybeSingle()
  if (error) throw dbErr(error.message)
  if (!data) throw new WardrobeError('Evaluación no encontrada', 404)
  let photo_url: string | null = null
  if (data.photo_path) { const { data: s } = await sb.storage.from(BUCKET).createSignedUrl(data.photo_path, 600); photo_url = s?.signedUrl ?? null }
  return { ...data, photo_url }
}
export async function listEvaluations(sb: Sb, outfitId?: string) {
  let q = sb.from('outfit_evaluations').select('id, mode, score, created_at, outfit_id, items, photo_path').order('created_at', { ascending: false }).limit(20)
  if (outfitId) q = q.eq('outfit_id', outfitId)
  const { data, error } = await q
  if (error) { if (/schema cache|does not exist/i.test(error.message)) return []; throw dbErr(error.message) }
  return data ?? []
}
export async function deleteEvaluationPhoto(sb: Sb, id: string) {
  const { data } = await sb.from('outfit_evaluations').select('photo_path').eq('id', id).maybeSingle()
  if (!data) throw new WardrobeError('Evaluación no encontrada', 404)
  if (data.photo_path) await sb.storage.from(BUCKET).remove([data.photo_path])
  await sb.from('outfit_evaluations').update({ photo_path: null, photo_deleted_at: new Date().toISOString() }).eq('id', id)
}
