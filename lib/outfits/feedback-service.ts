import { z } from 'zod'
import { WardrobeError, type Sb } from '@/lib/wardrobe/service'
import { FLAGS, RATINGS, REASONS } from './feedback'
import { detectPatterns, metrics, type Pattern } from './learning'
import { learningData } from './generate-service'
import { saveProposal } from './generate-service'
import { garmentsWithPhotos } from './service'

/** Outfit Feedback y registro de uso (fase 3D). */
const ids = <T extends { id: string }>(xs: readonly T[]) => xs.map((x) => x.id) as [string, ...string[]]
export const FeedbackInput = z.object({
  outfit_id: z.string().uuid().optional(), result_id: z.string().uuid().optional(),
  rating: z.enum(ids(RATINGS)).nullable().optional(),
  flags: z.array(z.enum(ids(FLAGS))).max(4).default([]),
  reasons: z.array(z.enum(ids(REASONS))).max(8).default([]),
  garment_id: z.string().uuid().nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  worn_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})
const dbErr = (m: string) => new WardrobeError(/schema cache|does not exist/i.test(m) ? 'Ejecuta la migración 0014 en Supabase.' : m, 500)
type Row = Record<string, any>

export const WearInput = z.object({
  worn_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), occasion: z.string().max(40).nullable().optional(),
  comfortable: z.boolean().nullable().optional(), well_dressed: z.boolean().nullable().optional(), note: z.string().trim().max(500).nullable().optional(),
})

/** Registrar que te has puesto un conjunto (fecha, comodidad, confianza). Una formula de la que salio pasa a «probada». */
export async function registerWear(sb: Sb, uid: string, outfitId: string, raw: unknown) {
  const p = WearInput.safeParse(raw ?? {}); if (!p.success) throw new WardrobeError('Registro de uso no válido')
  const { data: o } = await sb.from('outfits').select('id, occasion, formula_id, outfit_items(garment_id)').eq('id', outfitId).maybeSingle()
  if (!o) throw new WardrobeError('Conjunto no encontrado', 404)
  const today = new Date().toISOString().slice(0, 10)
  if (p.data.worn_on && p.data.worn_on > today) throw new WardrobeError('La fecha de uso no puede ser futura.')
  const { data, error } = await sb.from('outfit_wear_events').insert({
    user_id: uid, outfit_id: outfitId, worn_on: p.data.worn_on ?? today, occasion: p.data.occasion ?? o.occasion ?? null,
    garment_ids: (o.outfit_items ?? []).map((i: Row) => i.garment_id).filter(Boolean), comfortable: p.data.comfortable ?? null, well_dressed: p.data.well_dressed ?? null, note: p.data.note || null,
  }).select('id').single()
  if (error) throw dbErr(error.message)
  if (o.formula_id) await sb.from('style_formulas').update({ status: 'tested' }).eq('id', o.formula_id).eq('status', 'pending')
  return { id: data.id as string }
}

/**
 * Valorar un conjunto guardado o una propuesta. «Me lo he puesto» registra el uso (si es una propuesta, primero se
 * guarda como conjunto). Una valoracion sola no cambia tus preferencias: alimenta patrones.
 */
export async function addFeedback(sb: Sb, uid: string, raw: unknown) {
  const p = FeedbackInput.safeParse(raw ?? {}); if (!p.success) throw new WardrobeError('Valoración no válida')
  const d = p.data
  if (!d.outfit_id && !d.result_id) throw new WardrobeError('Indica qué conjunto valoras.')
  if (!d.rating && !d.flags.length) throw new WardrobeError('Elige una valoración o marca algo de tu experiencia.')
  if (d.rating !== 'dislike' && d.reasons.length) throw new WardrobeError('Los motivos solo se indican cuando algo no te convence.')
  let outfitId = d.outfit_id ?? null, garmentIds: string[] = [], occasion: string | null = null
  if (outfitId) {
    const { data: o } = await sb.from('outfits').select('id, occasion, outfit_items(garment_id)').eq('id', outfitId).maybeSingle()
    if (!o) throw new WardrobeError('Conjunto no encontrado', 404)
    garmentIds = (o.outfit_items ?? []).map((i: Row) => i.garment_id).filter(Boolean); occasion = o.occasion
  } else {
    const { data: r } = await sb.from('outfit_generation_results').select('id, garment_ids, saved_outfit_id, outfit_generations(request)').eq('id', d.result_id!).maybeSingle()
    if (!r) throw new WardrobeError('Propuesta no encontrada', 404)
    garmentIds = r.garment_ids; occasion = (r.outfit_generations as Row | null)?.request?.occasion ?? null
    if (d.flags.includes('worn')) outfitId = r.saved_outfit_id ?? (await saveProposal(sb, uid, r.id)).id
  }
  if (d.garment_id && !garmentIds.includes(d.garment_id)) throw new WardrobeError('Esa prenda no está en el conjunto.')
  if (d.reasons.includes('garment') && !d.garment_id) throw new WardrobeError('Indica qué prenda no te gusta.')
  const { data, error } = await sb.from('outfit_feedback').insert({
    user_id: uid, outfit_id: d.outfit_id ?? null, result_id: d.result_id ?? null, rating: d.rating ?? null, flags: d.flags, reasons: d.reasons,
    garment_id: d.garment_id ?? null, garment_ids: garmentIds, occasion, note: d.note || null,
  }).select('id').single()
  if (error) throw dbErr(error.message)
  let wear: string | null = null
  if (d.flags.includes('worn') && outfitId) wear = (await registerWear(sb, uid, outfitId, { worn_on: d.worn_on, comfortable: d.flags.includes('comfortable') || null, well_dressed: d.flags.includes('well_dressed') || null })).id
  return { id: data.id as string, outfit_id: outfitId, wear_id: wear }
}

export async function outfitHistory(sb: Sb, outfitId: string) {
  const [f, w] = await Promise.all([
    sb.from('outfit_feedback').select('*').eq('outfit_id', outfitId).order('created_at', { ascending: false }),
    sb.from('outfit_wear_events').select('*').eq('outfit_id', outfitId).order('worn_on', { ascending: false }),
  ])
  return { feedback: f.data ?? [], wears: w.data ?? [] }
}

/** Patrones detectados (con su estado) y métricas. */
export async function learningView(sb: Sb) {
  const [learn, { data: outfits }] = await Promise.all([learningData(sb), sb.from('outfits').select('id, source, status')])
  const gids = [...new Set([...learn.feedback.flatMap((f) => [...(f.garment_ids ?? []), f.garment_id]), ...learn.wears.flatMap((w) => w.garment_ids ?? [])].filter(Boolean))] as string[]
  const garments = await garmentsWithPhotos(sb, gids)
  return { patterns: detectPatterns(learn.feedback, learn.wears, garments, learn.decisions), metrics: metrics(learn.feedback, learn.wears, outfits ?? []), feedback: learn.feedback, wears: learn.wears }
}

/** Confirmar o descartar un patrón (o volver a dejarlo en «detectado»). No toca el Style Blueprint. */
export async function decidePattern(sb: Sb, uid: string, key: string, action: 'confirm' | 'dismiss' | 'reset') {
  if (action === 'reset') { await sb.from('style_learning').delete().eq('key', key); return { key, status: 'detected' } }
  const v = await learningView(sb)
  const p = v.patterns.find((x: Pattern) => x.key === key)
  if (!p) throw new WardrobeError('Ese patrón ya no se observa en tus valoraciones.', 404)
  const status = action === 'confirm' ? 'confirmed' : 'dismissed'
  const { error } = await sb.from('style_learning').upsert({ user_id: uid, key, label: p.label, status, evidence: { count: p.evidence, refs: p.refs }, decided_at: new Date().toISOString() }, { onConflict: 'user_id,key' })
  if (error) throw dbErr(error.message)
  return { key, status }
}

/** Frecuencia de uso por prenda (para la ficha y la auditoría): sale del registro de uso, nunca de las fotos. */
export async function garmentWear(sb: Sb, garmentId: string) {
  const { data } = await sb.from('outfit_wear_events').select('worn_on').contains('garment_ids', [garmentId]).order('worn_on', { ascending: false })
  return { count: data?.length ?? 0, last: data?.[0]?.worn_on ?? null }
}
