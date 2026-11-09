import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { COLOR_NAMES } from './questionnaire'
import { PREFS } from './areas'
import { ELEMENTS, ELEMENT_IDS, elementLabel } from '@/lib/style/catalog'
import { PALETTE_OF } from '@/lib/style/references'

/**
 * Perfil de gustos desde la conversacion con el estilista. Lo que dices CLARAMENTE que te gusta o no te gusta se guarda
 * en el mismo sitio que si lo marcaras tu (preferencia declarada, no deduccion):
 * - una prenda concreta → «te gusta» / «no te gusta» confirmado (style_learning): el motor la favorece o deja de proponerla;
 * - un rasgo o tipo de prenda (catalogo) → rasgos preferidos / rechazados de tu identidad estetica (style_preferences);
 * - un color → colores que te gustan / que evitas (color_profiles);
 * - un corte por tipo de prenda («pantalones anchos») → corte preferido (fit_preferences), que usa la compatibilidad.
 * Gustar algo lo quita de rechazados y al reves. Todo se puede deshacer.
 */
type Sb = SupabaseClient
type Row = Record<string, any>

/** Solo se gasta una llamada de IA en el chat libre cuando el mensaje expresa un gusto o un rechazo. */
export const TASTE_HINT = /\b(no me (gusta|gustan|convence|convencen|va|van|veo)|odio|detesto|no soporto|nunca me (pondr|pongo)|no me pondr|no quiero (volver a )?llevar|no me sienta|no me sientan|evito|me (gusta|gustan|encanta|encantan|chifla|chiflan)|prefiero|me quedan? bien|me siento (bien|c[oó]modo) con)/i
export const DISLIKE_HINT = TASTE_HINT

const PolaritySchema = z.object({
  garment_ids: z.array(z.string()).max(8).default([]),
  elements: z.array(z.string()).max(8).default([]),
  colors: z.array(z.string()).max(8).default([]),
  cuts: z.array(z.object({ key: z.string(), value: z.string() })).max(6).default([]),
})
export const DislikesSchema = PolaritySchema
export const EMPTY_POLARITY = () => ({ garment_ids: [] as string[], elements: [] as string[], colors: [] as string[], cuts: [] as { key: string; value: string }[] })
export const TastesSchema = z.object({ likes: PolaritySchema.default(EMPTY_POLARITY), dislikes: PolaritySchema.default(EMPTY_POLARITY) })
export type Tastes = z.infer<typeof TastesSchema>
export const emptyTastes = (): Tastes => TastesSchema.parse({})

const prefsText = () => Object.entries(PREFS).map(([k, v]) => `${k}: ${v.join(' | ')}`).join('; ')
export const TASTE_RULES = `Si el usuario expresa CLARAMENTE un gusto general o un rechazo (no un «hoy no», ni una duda, ni su opinion sobre una propuesta concreta como «me gusta la P2»), añadelo:
- en "likes" lo que le gusta y en "dislikes" lo que no;
- garment_ids: ids de PRENDAS de su armario;
- elements: ids de RASGOS (tipos de prenda o rasgos de estilo), p. ej. «pantalones anchos» → leg-wide;
- colors: colores de la lista COLORES;
- cuts: corte preferido por tipo de prenda, solo en "likes" ({"key":"pantalones","value":"Amplio"}), con las claves y valores de CORTES.
Si no expresa ninguno, deja las listas vacias.`
export const DISLIKE_RULES = TASTE_RULES
export const tasteLists = () => [
  `RASGOS (id: nombre): ${ELEMENTS.map((e) => `${e.id}: ${e.label}`).join('; ')}`,
  `COLORES: ${COLOR_NAMES.join(', ')}`,
  `CORTES (clave: valores): ${prefsText()}`,
].join('\n')

export const TASTE_EXTRACTOR = `Eres el EXTRACTOR DE GUSTOS de Personal Stylist. Lees un mensaje del usuario a su estilista y devuelves solo lo que dice claramente que le gusta o no le gusta, en general.
${TASTE_RULES}
Usa SOLO ids y valores de las listas. No inventes. Devuelve UNICAMENTE el JSON {"likes":{"garment_ids":[],"elements":[],"colors":[],"cuts":[]},"dislikes":{"garment_ids":[],"elements":[],"colors":[],"cuts":[]}}.`
export const extractorPrompt = (message: string, inventory: { id: string; title: string }[]) =>
  [`MENSAJE: """${message.slice(0, 1200)}"""`, '', 'PRENDAS (id: prenda):', ...inventory.slice(0, 150).map((g) => `${g.id}: ${g.title}`), '', tasteLists()].join('\n')

export interface Clean { garments: string[]; elements: string[]; colors: string[]; cuts: { key: string; value: string }[] }
export interface Normalized { likes: Clean; dislikes: Clean; dropped: string[] }
/** Valida contra el inventario y las listas cerradas; si algo aparece en gustos y rechazos a la vez, se descarta. */
export function normalizeTastes(t: Tastes, inventory: Map<string, { title: string }>): Normalized {
  const dropped: string[] = []
  const names = COLOR_NAMES as readonly string[]
  const one = (p: Tastes['likes'], liked: boolean): Clean => ({
    garments: [...new Set(p.garment_ids)].filter((id) => (inventory.has(id) ? true : (dropped.push('una prenda que no está en tu armario'), false))),
    elements: [...new Set(p.elements)].filter((e) => (ELEMENT_IDS.includes(e) ? true : (dropped.push(`el rasgo «${e}»`), false))),
    colors: [...new Set(p.colors.map((c) => names.find((n) => n.toLowerCase() === c.toLowerCase()) ?? PALETTE_OF[c] ?? c))].filter((c) => (names.includes(c) ? true : (dropped.push(`el color «${c}»`), false))),
    cuts: liked ? p.cuts.filter((c) => (PREFS[c.key]?.includes(c.value) ? true : (dropped.push(`el corte «${c.key}: ${c.value}»`), false))).filter((c, i, a) => a.findIndex((x) => x.key === c.key) === i) : [],
  })
  const likes = one(t.likes, true), dislikes = one(t.dislikes, false)
  for (const k of ['garments', 'elements', 'colors'] as const) {
    const both = likes[k].filter((x) => dislikes[k].includes(x))
    if (both.length) { dropped.push('algo que aparecía a la vez como gusto y como rechazo'); likes[k] = likes[k].filter((x) => !both.includes(x)); dislikes[k] = dislikes[k].filter((x) => !both.includes(x)) }
  }
  return { likes, dislikes, dropped }
}
/** Compatibilidad: solo rechazos (forma anterior). */
export const normalizeDislikes = (d: z.infer<typeof DislikesSchema>, inventory: Map<string, { title: string }>) => { const n = normalizeTastes({ likes: emptyTastes().likes, dislikes: d }, inventory); return { ...n.dislikes, dropped: n.dropped } }
const emptyClean = (c: Clean) => !c.garments.length && !c.elements.length && !c.colors.length && !c.cuts.length
export const isEmpty = (n: Normalized | Clean) => ('likes' in n ? emptyClean(n.likes) && emptyClean(n.dislikes) : emptyClean(n))

export interface Learned { kind: 'garment' | 'element' | 'color' | 'cut'; ref: string; label: string; polarity: 'like' | 'dislike' }
/** Guarda gustos y rechazos en tu perfil. Devuelve lo anotado (para decírtelo y poder deshacerlo). */
export async function recordTastes(sb: Sb, uid: string, n: Normalized, ctx: { inventory: Map<string, { title: string }>; source: string; message: string; session_id?: string | null; results?: Row[] }) {
  const learned: Learned[] = []
  const now = new Date().toISOString()
  const evidence = { source: ctx.source, session_id: ctx.session_id ?? null, message: ctx.message.slice(0, 300), count: 1 }
  for (const [pol, list] of [['like', n.likes.garments], ['dislike', n.dislikes.garments]] as const) for (const id of list) {
    const title = ctx.inventory.get(id)?.title ?? 'una prenda'
    const [key, other] = pol === 'like' ? [`garment_favorite:${id}`, `garment_dislike:${id}`] : [`garment_dislike:${id}`, `garment_favorite:${id}`]
    await sb.from('style_learning').delete().eq('key', other)
    await sb.from('style_learning').upsert({ user_id: uid, key, label: pol === 'like' ? `Te gusta «${title}»` : `No te gusta «${title}»`, status: 'confirmed', evidence, decided_at: now }, { onConflict: 'user_id,key' })
    if (pol === 'dislike') for (const r of ctx.results ?? []) if ((r.garment_ids ?? []).includes(id)) await sb.from('outfit_feedback').insert({ user_id: uid, result_id: r.id, rating: 'dislike', reasons: ['garment'], garment_id: id, garment_ids: r.garment_ids, note: ctx.message.slice(0, 500) })
    learned.push({ kind: 'garment', ref: id, label: title, polarity: pol })
  }
  if (n.likes.elements.length || n.dislikes.elements.length) {
    const { data: sp } = await sb.from('style_preferences').select('liked_elements, rejected_elements').eq('user_id', uid).maybeSingle()
    const liked = [...new Set([...(sp?.liked_elements ?? []).filter((e: string) => !n.dislikes.elements.includes(e)), ...n.likes.elements])]
    const rejected = [...new Set([...(sp?.rejected_elements ?? []).filter((e: string) => !n.likes.elements.includes(e)), ...n.dislikes.elements])]
    await sb.from('style_preferences').upsert({ user_id: uid, liked_elements: liked, rejected_elements: rejected })
    for (const e of n.likes.elements) learned.push({ kind: 'element', ref: e, label: elementLabel(e), polarity: 'like' })
    for (const e of n.dislikes.elements) learned.push({ kind: 'element', ref: e, label: elementLabel(e), polarity: 'dislike' })
  }
  if (n.likes.colors.length || n.dislikes.colors.length) {
    const { data: cp } = await sb.from('color_profiles').select('likes, avoids').eq('user_id', uid).maybeSingle()
    const likes = [...new Set([...(cp?.likes ?? []).filter((c: string) => !n.dislikes.colors.includes(c)), ...n.likes.colors])]
    const avoids = [...new Set([...(cp?.avoids ?? []).filter((c: string) => !n.likes.colors.includes(c)), ...n.dislikes.colors])]
    await sb.from('color_profiles').upsert({ user_id: uid, likes, avoids })
    for (const c of n.likes.colors) learned.push({ kind: 'color', ref: c, label: c, polarity: 'like' })
    for (const c of n.dislikes.colors) learned.push({ kind: 'color', ref: c, label: c, polarity: 'dislike' })
  }
  if (n.likes.cuts.length) {
    const { data: fp } = await sb.from('fit_preferences').select('prefs').eq('user_id', uid).maybeSingle()
    const prefs = { ...(fp?.prefs ?? {}), ...Object.fromEntries(n.likes.cuts.map((c) => [c.key, c.value])) }
    await sb.from('fit_preferences').upsert({ user_id: uid, prefs })
    for (const c of n.likes.cuts) learned.push({ kind: 'cut', ref: `${c.key}:${c.value}`, label: `${c.key}: ${c.value}`, polarity: 'like' })
  }
  if (learned.length) await sb.from('ai_runs').insert({ user_id: uid, kind: 'taste_update', model: 'reglas', meta: { source: ctx.source, learned } })
  return learned
}
/** Compatibilidad: solo rechazos (forma anterior). */
export const recordDislikes = (sb: Sb, uid: string, d: Clean, ctx: Parameters<typeof recordTastes>[3]) => recordTastes(sb, uid, { likes: { garments: [], elements: [], colors: [], cuts: [] }, dislikes: d, dropped: [] }, ctx)

/** Frase para el usuario: qué se ha anotado en su perfil. */
export function learnedSentence(l: Learned[]) {
  if (!l.length) return ''
  const lk = l.filter((x) => x.polarity === 'like'), dl = l.filter((x) => x.polarity === 'dislike')
  const lower = (xs: Learned[]) => xs.map((x) => x.label.toLowerCase()).join(', ')
  const parts = [
    ...lk.filter((x) => x.kind === 'garment').map((x) => `te gusta «${x.label}» (la tendré más en cuenta)`),
    ...(lk.some((x) => x.kind === 'element') ? [`te gustan: ${lower(lk.filter((x) => x.kind === 'element'))}`] : []),
    ...(lk.some((x) => x.kind === 'color') ? [`te gusta el ${lower(lk.filter((x) => x.kind === 'color'))}`] : []),
    ...lk.filter((x) => x.kind === 'cut').map((x) => `corte preferido en ${x.label.toLowerCase()}`),
    ...dl.filter((x) => x.kind === 'garment').map((x) => `«${x.label}» (no te la volveré a proponer)`),
    ...(dl.some((x) => x.kind === 'element') ? [`rechazas ${lower(dl.filter((x) => x.kind === 'element'))}`] : []),
    ...(dl.some((x) => x.kind === 'color') ? [`evitas el ${lower(dl.filter((x) => x.kind === 'color'))}`] : []),
  ]
  return `He anotado en tu perfil de gustos: ${parts.join('; ')}.`
}
