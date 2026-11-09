import { z } from 'zod'
import { WardrobeError, type Sb } from '@/lib/wardrobe/service'
import { GenerateRequest, resolveContext } from './engine/context'
import { eligible, learnedContext } from './engine/generate'
import { scoreEnv } from './engine/scoring'
import { FORMULA_STATUSES } from './feedback'
import { coverage, detectFormulas, formulaText, matches, signatureOf, slotsFromItems, tryFormula, type Slot } from './formulas'
import { learningData, prepareEngine } from './generate-service'
import { createOutfit, garmentsWithPhotos } from './service'
import { ITEM_ROLES } from './taxonomy'

/** Style Formulas (fase 3D): crear, detectar, probar y gestionar el estado. */
const dbErr = (m: string) => new WardrobeError(/schema cache|does not exist/i.test(m) ? 'Ejecuta la migración 0014 en Supabase.' : m, 500)
type Row = Record<string, any>
const ids = <T extends { id: string }>(xs: readonly T[]) => xs.map((x) => x.id) as [string, ...string[]]
export const SlotInput = z.object({
  role: z.enum(ids(ITEM_ROLES)), subcategories: z.array(z.string()).max(8).default([]), colors: z.array(z.string()).max(10).default([]), cuts: z.array(z.string()).max(6).default([]),
  formality_min: z.number().int().min(1).max(5).nullable().default(null), formality_max: z.number().int().min(1).max(5).nullable().default(null), optional: z.boolean().default(false),
})
export const FormulaInput = z.object({
  name: z.string().trim().min(1, 'Ponle un nombre a la fórmula').max(80), description: z.string().trim().max(500).nullable().optional(),
  slots: z.array(SlotInput).min(2, 'Una fórmula necesita al menos dos piezas').max(8), source: z.enum(['stylist', 'user']).default('user'), origin_outfit_id: z.string().uuid().nullable().optional(),
})

async function insertFormula(sb: Sb, uid: string, f: z.infer<typeof FormulaInput>) {
  const { data, error } = await sb.from('style_formulas').insert({ user_id: uid, name: f.name, description: f.description ?? null, source: f.source, origin_outfit_id: f.origin_outfit_id ?? null, signature: signatureOf(f.slots) }).select('id').single()
  if (error) throw dbErr(error.message)
  const { error: se } = await sb.from('style_formula_slots').insert(f.slots.map((s, i) => ({ ...s, user_id: uid, formula_id: data.id, position: i })))
  if (se) { await sb.from('style_formulas').delete().eq('id', data.id); throw dbErr(se.message) }
  return data.id as string
}

export async function createFormula(sb: Sb, uid: string, raw: unknown) {
  const p = FormulaInput.safeParse(raw); if (!p.success) throw new WardrobeError(p.error.issues.map((i) => i.message).join('; '))
  for (const s of p.data.slots) if (s.formality_min && s.formality_max && s.formality_min > s.formality_max) throw new WardrobeError('El rango de formalidad no es válido.')
  return insertFormula(sb, uid, p.data)
}

/** Fórmula a partir de un conjunto guardado: se abstrae por tipo de prenda (no por la prenda concreta). */
export async function formulaFromOutfit(sb: Sb, uid: string, outfitId: string, name?: string) {
  const { data: o } = await sb.from('outfits').select('id, name, outfit_items(garment_id, item_role)').eq('id', outfitId).maybeSingle()
  if (!o) throw new WardrobeError('Conjunto no encontrado', 404)
  const gs = await garmentsWithPhotos(sb, (o.outfit_items ?? []).map((i: Row) => i.garment_id))
  const items = (o.outfit_items ?? []).filter((i: Row) => gs.has(i.garment_id)).map((i: Row) => ({ role: i.item_role, g: gs.get(i.garment_id)! }))
  const slots = slotsFromItems(items)
  if (slots.length < 2) throw new WardrobeError('El conjunto necesita al menos dos prendas (sin contar complementos) para convertirse en fórmula.')
  return insertFormula(sb, uid, { name: (name?.trim() || o.name).slice(0, 80), description: `Creada a partir de «${o.name}».`, slots, source: 'user', origin_outfit_id: o.id })
}

export async function listFormulas(sb: Sb) {
  const { data, error } = await sb.from('style_formulas').select('*, style_formula_slots(*)').order('updated_at', { ascending: false })
  if (error) { if (/schema cache|does not exist/i.test(error.message)) return []; throw dbErr(error.message) }
  return (data ?? []).map((f) => ({ ...f, slots: [...(f.style_formula_slots ?? [])].sort((a: Row, z: Row) => a.position - z.position) as (Slot & Row)[] }))
}

/** Vista de fórmulas: cobertura con tu armario y fórmulas que repites sin haberlas guardado. */
export async function formulasView(sb: Sb, uid: string) {
  const [formulas, prep, learn, { data: outfits }] = await Promise.all([listFormulas(sb), prepareEngine(sb, uid), learningData(sb), sb.from('outfits').select('id, name, outfit_items(garment_id, item_role)').neq('status', 'archived')])
  const pool = prep.garments.filter((g) => !prep.signals.exclude.has(g.id) && g.decision !== 'replace' && g.decision !== 'donate_sell')
  const withCov = formulas.map((f) => { const c = coverage(f.slots, pool); return { ...f, text: formulaText(f.slots), variations: c.variations, per: c.per.map((x) => ({ role: x.slot.role, count: x.garments.length, examples: x.garments.slice(0, 3).map((g) => g.title) })), missing: c.missing.map((s) => s.role) } })
  const positive = new Set([...learn.feedback.filter((f) => f.outfit_id && (f.rating === 'love' || f.rating === 'like' || (f.flags ?? []).includes('would_repeat'))).map((f) => f.outfit_id), ...learn.wears.map((w) => w.outfit_id)])
  const items = (outfits ?? []).map((o) => ({ id: o.id, name: o.name, positive: positive.has(o.id), items: (o.outfit_items ?? []).filter((i: Row) => prep.byId.has(i.garment_id)).map((i: Row) => ({ role: i.item_role, g: prep.byId.get(i.garment_id)! })) }))
  const suggestions = detectFormulas(items, new Set(formulas.map((f) => f.signature).filter(Boolean)))
  return { formulas: withCov, suggestions }
}

export async function acceptSuggestion(sb: Sb, uid: string, signature: string, name: string) {
  const v = await formulasView(sb, uid)
  const s = v.suggestions.find((x) => x.signature === signature)
  if (!s) throw new WardrobeError('Esa fórmula ya no se detecta (o ya la tienes).', 404)
  return insertFormula(sb, uid, { name: name.trim().slice(0, 80) || s.text.slice(0, 80), description: `Detectada en ${s.outfits.length} conjuntos que te gustaron o te pusiste: ${s.outfits.map((o) => o.name).join(', ')}.`, slots: s.slots, source: 'stylist' })
}

export async function setFormulaStatus(sb: Sb, id: string, status: string) {
  if (!FORMULA_STATUSES.some((x) => x.id === status)) throw new WardrobeError('Estado no válido')
  const { data } = await sb.from('style_formulas').update({ status }).eq('id', id).select('id').maybeSingle()
  if (!data) throw new WardrobeError('Fórmula no encontrada', 404)
}
export async function deleteFormula(sb: Sb, id: string) {
  const { data } = await sb.from('style_formulas').delete().eq('id', id).select('id').maybeSingle()
  if (!data) throw new WardrobeError('Fórmula no encontrada', 404)
}

/** Probar: mejores combinaciones de tu armario para la fórmula, puntuadas por el motor (contexto opcional). */
export async function tryFormulaFor(sb: Sb, uid: string, id: string, occasion?: string | null) {
  const f = (await listFormulas(sb)).find((x) => x.id === id)
  if (!f) throw new WardrobeError('Fórmula no encontrada', 404)
  const prep = await prepareEngine(sb, uid)
  const req = GenerateRequest.parse({ occasion: occasion || null })
  const ctx = learnedContext(resolveContext(req), prep.signals)
  const pool = eligible(prep.garments, { ...ctx, hardMin: 1, noLayers: false, forbiddenRoles: [] }, prep.signals).ok
  const r = tryFormula(f.slots, pool, scoreEnv(ctx, prep.bundle, prep.evals, undefined, prep.signals))
  return { formula: { ...f, text: formulaText(f.slots) }, evaluated: r.evaluated, combos: r.combos.map((c) => ({ score: c.score, why: c.why, items: c.items.map((i) => ({ garment_id: i.g.id as string, role: i.role, title: i.g.title as string, thumb_url: i.g.thumb_url ?? null })) })) }
}

/** Guardar una combinación de la fórmula como conjunto (queda enlazado a la fórmula). */
export async function saveFormulaCombo(sb: Sb, uid: string, id: string, items: { garment_id: string; role: string }[]) {
  const f = (await listFormulas(sb)).find((x) => x.id === id)
  if (!f) throw new WardrobeError('Fórmula no encontrada', 404)
  const gs = await garmentsWithPhotos(sb, items.map((i) => i.garment_id))
  for (const it of items) { const g = gs.get(it.garment_id); if (!g || !f.slots.some((s: Slot) => s.role === it.role && matches(s, g))) throw new WardrobeError(`«${g?.title ?? 'Una prenda'}» no cumple la fórmula.`) }
  const r = await createOutfit(sb, uid, { name: f.name, description: `Desde la fórmula «${f.name}»: ${formulaText(f.slots)}.`, status: 'saved' }, items)
  await sb.from('outfits').update({ formula_id: id }).eq('id', r.id)
  return r
}
