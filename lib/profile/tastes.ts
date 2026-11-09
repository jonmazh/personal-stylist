import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { COLOR_NAMES } from './questionnaire'
import { ELEMENTS, ELEMENT_IDS, elementLabel } from '@/lib/style/catalog'
import { PALETTE_OF } from '@/lib/style/references'

/**
 * Perfil de gustos desde la conversacion con el estilista: lo que dices CLARAMENTE que no te gusta se guarda en el mismo
 * sitio que si lo marcaras tu (es una preferencia declarada, no una deduccion):
 * - una prenda concreta → patron confirmado «no me gusta» (style_learning): el estilista deja de proponerla;
 * - un rasgo o tipo de prenda (catalogo de elementos) → elementos rechazados de tu identidad estetica (style_preferences);
 * - un color → colores que evitas (color_profiles).
 * Todo se puede deshacer desde Aprendizaje, Identidad estetica o el Estudio cromatico.
 */
type Sb = SupabaseClient
type Row = Record<string, any>

/** Solo se gasta una llamada de IA en el chat libre cuando el mensaje expresa un rechazo. */
export const DISLIKE_HINT = /\b(no me (gusta|gustan|convence|convencen|va|van|veo)|odio|detesto|no soporto|nunca me (pondr|pongo)|no me pondr|no quiero (volver a )?llevar|no me sienta|no me sientan|evito|quita(r|me)? .* (de|del) armario)/i

export const DislikesSchema = z.object({
  garment_ids: z.array(z.string()).max(8).default([]),
  elements: z.array(z.string()).max(8).default([]),
  colors: z.array(z.string()).max(8).default([]),
})
export type Dislikes = z.infer<typeof DislikesSchema>

export const DISLIKE_RULES = `Si el usuario dice CLARAMENTE que algo no le gusta (no un «hoy no» ni una duda), añadelo en "dislikes":
- garment_ids: ids de PRENDAS de su armario que dice que no le gustan;
- elements: ids de RASGOS (tipos de prenda o rasgos de estilo) que rechaza en general;
- colors: colores de la lista COLORES que no le gustan.
Si no rechaza nada, deja las listas vacias.`
export const tasteLists = () => [
  `RASGOS (id: nombre): ${ELEMENTS.map((e) => `${e.id}: ${e.label}`).join('; ')}`,
  `COLORES: ${COLOR_NAMES.join(', ')}`,
].join('\n')

export const TASTE_EXTRACTOR = `Eres el EXTRACTOR DE GUSTOS de Personal Stylist. Lees un mensaje del usuario a su estilista y devuelves solo lo que dice claramente que NO le gusta.
${DISLIKE_RULES}
Usa SOLO ids y valores de las listas. No inventes. Devuelve UNICAMENTE el JSON {"garment_ids":[],"elements":[],"colors":[]}.`
export const extractorPrompt = (message: string, inventory: { id: string; title: string }[]) =>
  [`MENSAJE: """${message.slice(0, 1200)}"""`, '', 'PRENDAS (id: prenda):', ...inventory.slice(0, 150).map((g) => `${g.id}: ${g.title}`), '', tasteLists()].join('\n')

/** Valida contra el inventario y las listas cerradas. */
export function normalizeDislikes(d: Dislikes, inventory: Map<string, { title: string }>) {
  const dropped: string[] = []
  const garments = [...new Set(d.garment_ids)].filter((id) => (inventory.has(id) ? true : (dropped.push('una prenda que no está en tu armario'), false)))
  const elements = [...new Set(d.elements)].filter((e) => (ELEMENT_IDS.includes(e) ? true : (dropped.push(`el rasgo «${e}»`), false)))
  const names = COLOR_NAMES as readonly string[]
  const colors = [...new Set(d.colors.map((c) => names.find((n) => n.toLowerCase() === c.toLowerCase()) ?? PALETTE_OF[c] ?? c))].filter((c) => (names.includes(c) ? true : (dropped.push(`el color «${c}»`), false)))
  return { garments, elements, colors, dropped }
}
export const isEmpty = (n: { garments: string[]; elements: string[]; colors: string[] }) => !n.garments.length && !n.elements.length && !n.colors.length

export interface Learned { kind: 'garment' | 'element' | 'color'; ref: string; label: string }
/** Guarda lo que no te gusta en tu perfil de gustos. Devuelve lo anotado (para decírtelo y poder deshacerlo). */
export async function recordDislikes(sb: Sb, uid: string, n: { garments: string[]; elements: string[]; colors: string[] }, ctx: { inventory: Map<string, { title: string }>; source: string; message: string; session_id?: string | null; results?: Row[] }) {
  const learned: Learned[] = []
  const now = new Date().toISOString()
  for (const id of n.garments) {
    const title = ctx.inventory.get(id)?.title ?? 'una prenda'
    await sb.from('style_learning').upsert({ user_id: uid, key: `garment_dislike:${id}`, label: `No te gusta «${title}»`, status: 'confirmed', evidence: { source: ctx.source, session_id: ctx.session_id ?? null, message: ctx.message.slice(0, 300), count: 1 }, decided_at: now }, { onConflict: 'user_id,key' })
    // Si esta en una propuesta de la conversacion, queda tambien como valoracion de esa propuesta
    for (const r of ctx.results ?? []) if ((r.garment_ids ?? []).includes(id)) await sb.from('outfit_feedback').insert({ user_id: uid, result_id: r.id, rating: 'dislike', reasons: ['garment'], garment_id: id, garment_ids: r.garment_ids, note: ctx.message.slice(0, 500) })
    learned.push({ kind: 'garment', ref: id, label: title })
  }
  if (n.elements.length) {
    const { data: sp } = await sb.from('style_preferences').select('liked_elements, rejected_elements').eq('user_id', uid).maybeSingle()
    const rejected = [...new Set([...(sp?.rejected_elements ?? []), ...n.elements])]
    const liked = (sp?.liked_elements ?? []).filter((e: string) => !n.elements.includes(e))
    await sb.from('style_preferences').upsert({ user_id: uid, rejected_elements: rejected, liked_elements: liked })
    for (const e of n.elements) learned.push({ kind: 'element', ref: e, label: elementLabel(e) })
  }
  if (n.colors.length) {
    const { data: cp } = await sb.from('color_profiles').select('likes, avoids').eq('user_id', uid).maybeSingle()
    const avoids = [...new Set([...(cp?.avoids ?? []), ...n.colors])]
    const likes = (cp?.likes ?? []).filter((c: string) => !n.colors.includes(c))
    await sb.from('color_profiles').upsert({ user_id: uid, avoids, likes })
    for (const c of n.colors) learned.push({ kind: 'color', ref: c, label: c })
  }
  if (learned.length) await sb.from('ai_runs').insert({ user_id: uid, kind: 'taste_update', model: 'reglas', meta: { source: ctx.source, learned } })
  return learned
}

/** Frase para el usuario: qué se ha anotado y dónde deshacerlo. */
export function learnedSentence(l: Learned[]) {
  if (!l.length) return ''
  const g = l.filter((x) => x.kind === 'garment').map((x) => `«${x.label}» (no te la volveré a proponer)`)
  const e = l.filter((x) => x.kind === 'element').map((x) => x.label.toLowerCase())
  const c = l.filter((x) => x.kind === 'color').map((x) => x.label.toLowerCase())
  return `He anotado en tu perfil de gustos: ${[...g, ...(e.length ? [`rechazas ${e.join(', ')}`] : []), ...(c.length ? [`evitas el ${c.join(', ')}`] : [])].join('; ')}.`
}
