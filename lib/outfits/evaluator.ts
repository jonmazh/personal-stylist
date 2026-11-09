import { z } from 'zod'
import { roleLabel } from './taxonomy'
import { OUTFIT_STYLIST } from './stylist/contracts'

/**
 * Outfit Evaluator (fase 3D).
 * Modo A (teorico): el motor puntua la combinacion; la IA, como estilista, opina y sugiere cambios con ids que se validan.
 * Modo B (visual): la IA mira una foto del conjunto puesto. La foto ayuda a ver el resultado, pero no verifica todos
 * los detalles de ajuste y construccion: lo que no se ve debe decirse.
 */
export const EVALUATOR_VERSION = 'outfit-evaluator@1'
export const VISUAL_VERSION = 'outfit-visual@1'

export const EVALUATOR = `${OUTFIT_STYLIST}

EVALUACION DE UN CONJUNTO elegido por el usuario. Recibes las prendas, el contexto y la puntuacion interna del motor (orientativa).
- "verdict": tu opinion honesta en 2-3 frases (compatibilidad de estilos, armonia cromatica, volumenes, adecuacion a la ocasion, coherencia con su identidad).
- "strengths" y "risks": breves y concretos.
- "suggestions": cambios opcionales usando SOLO ids de PRENDAS DISPONIBLES (role + garment_id + motivo). Si no hace falta cambiar nada, lista vacia.
- No valores como le queda (no hay foto): eso es otra evaluacion.`
export const EvalSchema = z.object({
  verdict: z.string().max(800), strengths: z.array(z.string().max(200)).max(5).default([]), risks: z.array(z.string().max(200)).max(5).default([]),
  suggestions: z.array(z.object({ role: z.string(), garment_id: z.string(), reason: z.string().max(240) })).max(3).default([]),
})
export type EvalAI = z.infer<typeof EvalSchema>
export function evaluatorPrompt(o: { context: string; profile: string; items: { garment_id: string; role: string; title: string }[]; score: number; criteria: { label: string; points: number; weight: number; cons: string[] }[]; available: { id: string; title: string; roles: string[] }[] }) {
  return [
    `CONTEXTO: ${o.context}`, `PERFIL (resumen): ${o.profile}`, '',
    'CONJUNTO:', ...o.items.map((i) => `- ${roleLabel(i.role)}: ${i.title} (${i.garment_id})`), '',
    `PUNTUACION DEL MOTOR (orientativa): ${o.score}/100 · ${o.criteria.map((c) => `${c.label} ${c.points}/${c.weight}${c.cons.length ? ` [${c.cons.join(' ')}]` : ''}`).join(' · ')}`, '',
    'PRENDAS DISPONIBLES (id: prenda · funciones):', ...o.available.slice(0, 60).map((g) => `${g.id}: ${g.title} · ${g.roles.join('/')}`), '',
    'Forma: {"verdict":"...","strengths":["..."],"risks":["..."],"suggestions":[{"role":"footwear","garment_id":"<id>","reason":"..."}]}',
  ].join('\n')
}

export const ASPECTS = [
  { key: 'integration', label: 'Cómo se integran las prendas' }, { key: 'proportions', label: 'Proporciones reales' }, { key: 'lengths', label: 'Largo de las prendas' },
  { key: 'drape', label: 'Caída' }, { key: 'layering', label: 'Superposición de capas' }, { key: 'harmony', label: 'Armonía general' },
] as const
export const VISUAL = `Eres Personal Stylist evaluando una FOTOGRAFIA del usuario con un conjunto puesto.
REGLAS:
1. Evalua solo lo que se ve en la foto. Si un aspecto no se aprecia (encuadre, postura, luz, una prenda tapa otra), "visible": false, "score": null, y explica por que.
2. La foto ayuda a ver el resultado, pero no permite verificar con precision todos los detalles de ajuste y construccion: dilo cuando aplique y listalo en "not_visible".
3. No opines sobre el cuerpo, el peso ni el fisico de la persona: solo sobre como funciona el conjunto.
4. Si te dan el conjunto previsto, indica si la foto corresponde ("si", "parcial", "no" o "desconocido") y que difiere.
5. Puntuaciones de 1 a 10 orientativas. Espanol, tono profesional y constructivo. Devuelve UNICAMENTE el JSON.`
export const VisualSchema = z.object({
  photo_quality: z.object({ suitable: z.boolean(), issues: z.array(z.string()).max(6).default([]) }),
  aspects: z.array(z.object({ key: z.string(), observation: z.string().max(400), score: z.number().min(1).max(10).nullable(), visible: z.boolean() })).max(8),
  matches_plan: z.object({ value: z.enum(['si', 'parcial', 'no', 'desconocido']), notes: z.string().max(300).default('') }),
  not_visible: z.array(z.string().max(200)).max(8).default([]),
  summary: z.string().max(600), suggestions: z.array(z.string().max(240)).max(5).default([]),
})
export type VisualAI = z.infer<typeof VisualSchema>
export function visualPrompt(planned: { role: string; title: string }[] | null, context: string) {
  return [
    `CONTEXTO: ${context}`,
    planned?.length ? `CONJUNTO PREVISTO: ${planned.map((p) => `${roleLabel(p.role)}: ${p.title}`).join('; ')}` : 'No se indica conjunto previsto: matches_plan "desconocido".',
    `ASPECTOS (usa estas claves): ${ASPECTS.map((a) => `${a.key} (${a.label})`).join(', ')}`,
    'Forma: {"photo_quality":{"suitable":true,"issues":[]},"aspects":[{"key":"proportions","observation":"...","score":8,"visible":true}],"matches_plan":{"value":"si","notes":""},"not_visible":["..."],"summary":"...","suggestions":["..."]}',
  ].join('\n')
}
/** Normaliza: aspectos fijos (los que falten, no observables); con foto no apta, sin puntuaciones. */
export function normalizeVisual(ai: VisualAI) {
  const aspects = ASPECTS.map((a) => {
    const x = ai.aspects.find((y) => y.key === a.key)
    const visible = !!x?.visible && ai.photo_quality.suitable
    return { key: a.key, label: a.label, observation: x?.observation || 'No evaluado.', score: visible && x?.score != null ? Math.round(x.score) : null, visible }
  })
  const seen = aspects.filter((a) => a.score != null)
  return { ...ai, aspects, overall: seen.length ? Math.round((seen.reduce((s, a) => s + a.score!, 0) / seen.length) * 10) / 10 : null, provisional: seen.length < aspects.length || !ai.photo_quality.suitable }
}
