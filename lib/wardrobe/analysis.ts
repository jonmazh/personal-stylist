import { z } from 'zod'
import {
  ATTRIBUTES, CUTS, GARMENT_COLORS, GROUPS, IMAGE_ROLES, PATTERNS, SEASONS, SILHOUETTES, SUBS, familyOf, subOf, type Family,
} from './taxonomy'

/**
 * Garment AI (fase 2B): contrato de salida, prompt especializado y normalizacion.
 * La IA devuelve una PROPUESTA con confianza por atributo; la aplicacion la ajusta a la taxonomia y el usuario
 * decide que acepta. Nada se escribe en la ficha sin confirmacion. Ver docs/ARMARIO.md.
 */
export const PROMPT_VERSION = 'garment-analyst@1'
export const SCHEMA_VERSION = 'garment-analysis@1'
export const MAX_IMAGES = 4
/** Funciones de foto que se envian al analisis, por prioridad. «Llevandola puesta» es para el Fit Assessment, no para identificar. */
export const ANALYSIS_ROLES = ['front', 'back', 'label', 'detail', 'other']

const C = z.number().min(0).max(1)
const Val = z.object({ value: z.string().nullable(), confidence: C })
export const GarmentAnalysisSchema = z.object({
  category: Val,
  subcategory: Val,
  primary_color: Val,
  secondary_colors: z.array(z.object({ value: z.string(), confidence: C })).max(4).default([]),
  pattern: Val,
  cut: Val,
  silhouette: Val,
  apparent_material: Val,
  composition: z.object({ value: z.string().nullable(), confidence: C, source: z.enum(['label', 'none']).default('none') }).nullable().default(null),
  label: z.object({ brand: z.string().nullable().default(null), size: z.string().nullable().default(null), confidence: C.default(0) }).nullable().default(null),
  attributes: z.array(z.object({ key: z.string(), value: z.string().nullable(), confidence: C })).max(14).default([]),
  formality: z.object({ value: z.number().int().min(1).max(5).nullable(), confidence: C }),
  seasons: z.array(z.string()).max(4).default([]),
  observations: z.array(z.string()).max(8).default([]),
  inferences: z.array(z.string()).max(6).default([]),
  unknown: z.array(z.object({ field: z.string(), reason: z.string(), photo: z.string().nullable().default(null) })).max(10).default([]),
  additional_photos_requested: z.array(z.string()).max(4).default([]),
})
export type GarmentAnalysisAI = z.infer<typeof GarmentAnalysisSchema>

// ── Prompt ──
const attrLines = (f: Family) => [
  ...(CUTS[f].length ? [`  - cut: ${CUTS[f].join(' | ')}`] : []),
  ...ATTRIBUTES[f].map((d) => `  - attributes.${d.key} (${d.label}): ${d.options.join(' | ')}`),
]

export const GARMENT_ANALYST = `Eres Garment Analyst, el especialista en identificacion, clasificacion y analisis tecnico de prendas masculinas de la aplicacion Personal Stylist.
Tu funcion es analizar fotografias de prendas y extraer caracteristicas visuales de forma estructurada.

REGLAS FUNDAMENTALES:
1. Identifica exclusivamente caracteristicas que puedan observarse razonablemente en las fotografias.
2. No inventes marcas, precios, composicion, tallas ni informacion comercial que no sea visible o aportada por el usuario.
3. Diferencia el material aparente (lo que parece) de la composicion textil confirmada (solo la que se LEE en una etiqueta: source "label").
4. Distingue el corte disenado de la prenda de como queda sobre el cuerpo del usuario.
5. No evalues el ajuste real: no tienes fotografias de la persona llevandola. No hables de como le queda.
6. Si no puedes identificar una caracteristica, devuelve value null y explica en "unknown" que fotografia permitiria resolverlo.
7. Utiliza la taxonomia masculina proporcionada: SOLO los valores de las listas, escritos exactamente igual.
8. El color puede verse afectado por la iluminacion: elige el nombre mas cercano de la lista; no des valores RGB.
9. No inventes propiedades de calidad o durabilidad que no puedan verificarse.
10. Devuelve UNICAMENTE el JSON con el esquema indicado.
11. Manten separados: "observations" (lo que se ve), "inferences" (lo que deduces) y lo que haya indicado el usuario.
12. Explica con lenguaje profesional, concreto y comprensible, en espanol.
"confidence" es tu seguridad entre 0 y 1 para cada campo; con poca informacion usa valores bajos o null.`

export function buildUserPrompt(opts: { roles: string[]; hint?: { category?: string | null; subcategory?: string | null }; family?: Family }) {
  const roleLabel = (r: string) => IMAGE_ROLES.find((x) => x.id === r)?.label ?? r
  const fams: Family[] = opts.family ? [opts.family] : (['bottom', 'jacket', 'shirt', 'top', 'footwear', 'accessory'] as Family[])
  const hint = opts.hint?.subcategory ? `El usuario ha indicado que es: ${subOf(opts.hint.subcategory)?.label} (${opts.hint.subcategory}). Respetalo salvo que las fotos lo contradigan claramente.`
    : opts.hint?.category ? `El usuario ha indicado la categoria: ${GROUPS.find((g) => g.id === opts.hint!.category)?.label} (${opts.hint.category}).` : 'El usuario no ha indicado el tipo de prenda.'
  return [
    `Fotografias en este orden: ${opts.roles.map((r, i) => `${i + 1}) ${roleLabel(r)}`).join('; ')}.`,
    opts.roles.includes('label') ? 'Hay foto de etiqueta: lee composicion, marca y talla SOLO si se leen con claridad (composition.source = "label").' : 'NO hay foto de etiqueta: composition debe ser null y label null.',
    hint,
    '',
    'TAXONOMIA (usa los ids o valores exactos):',
    `- category: ${GROUPS.map((g) => g.id).join(' | ')}`,
    `- subcategory: ${SUBS.map((x) => `${x.id} (${x.label})`).join(', ')}`,
    `- primary_color / secondary_colors: ${GARMENT_COLORS.join(' | ')}`,
    `- pattern: ${PATTERNS.join(' | ')}`,
    `- silhouette: ${SILHOUETTES.join(' | ')}`,
    `- seasons: ${SEASONS.map((s) => s.id).join(' | ')}`,
    '- formality: 1 (muy informal) a 5 (traje)',
    ...fams.flatMap((f) => [`Campos tecnicos para la familia ${f}${opts.family ? '' : ` (tipos: ${SUBS.filter((x) => x.family === f).map((x) => x.id).join(', ')})`}:`, ...attrLines(f)]),
    `- additional_photos_requested / unknown.photo: ${IMAGE_ROLES.filter((r) => r.id !== 'other').map((r) => r.id).join(' | ')}`,
    '',
    'Forma exacta del JSON:',
    '{"category":{"value":"bottom","confidence":0.97},"subcategory":{"value":"trousers","confidence":0.9},"primary_color":{"value":"Antracita","confidence":0.9},"secondary_colors":[],"pattern":{"value":"Liso","confidence":0.95},"cut":{"value":"Recto","confidence":0.85},"silhouette":{"value":"Regular","confidence":0.8},"apparent_material":{"value":"Sarga de aspecto lanoso","confidence":0.6},"composition":null,"label":null,"attributes":[{"key":"rise","value":"Medio","confidence":0.7}],"formality":{"value":4,"confidence":0.85},"seasons":["otono","invierno"],"observations":["..."],"inferences":["..."],"unknown":[{"field":"composition","reason":"No hay etiqueta visible","photo":"label"}],"additional_photos_requested":["label"]}',
  ].join('\n')
}

// ── Normalizacion ──
export type Level = 'alta' | 'media' | 'baja'
export const level = (c: number): Level => (c >= 0.85 ? 'alta' : c >= 0.6 ? 'media' : 'baja')
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
const pickOpt = (v: string | null | undefined, opts: readonly string[]) => (v ? opts.find((o) => norm(o) === norm(v)) ?? null : null)

export interface ProposedField {
  field: string           // columna de garments o «attr:<clave>»
  label: string
  value: unknown          // en el formato que se guarda
  display: string
  confidence: number
  level: Level
  current: unknown
  currentSource?: string  // quien puso el valor actual
  same: boolean           // coincide con lo que ya hay
  preselect: boolean      // se propone aceptar por defecto
  note?: string
}
export interface NormalizedAnalysis { fields: ProposedField[]; discarded: string[]; unknown: GarmentAnalysisAI['unknown']; observations: string[]; inferences: string[]; requested: string[]; overall: number | null; family: Family }

export const FIELD_LABEL: Record<string, string> = {
  composition: 'Composición', label: 'Etiqueta', formality: 'Formalidad', attributes: 'Características técnicas',
  category: 'Categoría', subcategory: 'Tipo', primary_color: 'Color principal', secondary_colors: 'Colores secundarios', pattern: 'Estampado', cut: 'Corte',
  silhouette: 'Silueta', apparent_material: 'Material aparente', confirmed_composition: 'Composición (etiqueta)', brand: 'Marca (etiqueta)', size_label: 'Talla de etiqueta',
  formality_level: 'Formalidad', seasons: 'Temporadas',
}

/**
 * Ajusta la propuesta de la IA a la taxonomia y al estado de la ficha:
 * - valores fuera de lista se descartan (con nota), nunca se fuerzan;
 * - atributos solo de la familia de la prenda;
 * - composicion, marca y talla solo si hay foto de etiqueta y la IA dice haberlas leido;
 * - se preselecciona aceptar solo con confianza media o alta y sin pisar un dato que puso el usuario.
 */
export function normalizeAnalysis(ai: GarmentAnalysisAI, garment: Record<string, any>, ctx: { hasLabelPhoto: boolean }): NormalizedAnalysis {
  const fields: ProposedField[] = []
  const discarded: string[] = []
  const src = garment.field_sources ?? {}
  const push = (field: string, value: unknown, display: string, confidence: number, note?: string) => {
    const current = field.startsWith('attr:') ? garment.attributes?.[field.slice(5)] ?? null : garment[field] ?? null
    const currentSource = src[field.startsWith('attr:') ? 'attributes' : field]?.source
    const same = JSON.stringify(current) === JSON.stringify(value)
    const userSet = current !== null && current !== undefined && !(Array.isArray(current) && !current.length) && currentSource === 'usuario'
    fields.push({ field, label: FIELD_LABEL[field] ?? field, value, display, confidence, level: level(confidence), current, currentSource, same, preselect: !same && confidence >= 0.6 && !userSet, note })
  }

  // Categoria y tipo
  const cat = GROUPS.find((g) => g.id === ai.category.value || norm(g.label) === norm(ai.category.value ?? ''))
  if (ai.category.value && !cat) discarded.push(`Categoría «${ai.category.value}» fuera de la taxonomía`)
  if (cat) push('category', cat.id, cat.label, ai.category.confidence)
  const sub = SUBS.find((x) => x.id === ai.subcategory.value || norm(x.label) === norm(ai.subcategory.value ?? ''))
  const effCat = cat?.id ?? garment.category
  if (ai.subcategory.value && !sub) discarded.push(`Tipo «${ai.subcategory.value}» fuera de la taxonomía`)
  else if (sub && effCat && sub.group !== effCat) discarded.push(`Tipo «${sub.label}» no pertenece a la categoría ${GROUPS.find((g) => g.id === effCat)?.label}`)
  else if (sub) push('subcategory', sub.id, sub.label, ai.subcategory.confidence)
  const family = familyOf(sub && sub.group === effCat ? sub.id : garment.subcategory, effCat)

  // Generales con lista cerrada
  const closed = (field: string, v: Val, opts: readonly string[]) => {
    if (!v.value) return
    const o = pickOpt(v.value, opts)
    if (!o) { discarded.push(`${FIELD_LABEL[field]} «${v.value}» fuera de la taxonomía`); return }
    push(field, o, o, v.confidence)
  }
  type Val = { value: string | null; confidence: number }
  closed('primary_color', ai.primary_color, GARMENT_COLORS)
  closed('pattern', ai.pattern, PATTERNS)
  if (CUTS[family].length) closed('cut', ai.cut, CUTS[family]); else if (ai.cut.value) discarded.push(`Corte «${ai.cut.value}»: no aplica a esta prenda`)
  closed('silhouette', ai.silhouette, SILHOUETTES)
  for (const c of ai.secondary_colors) if (!pickOpt(c.value, GARMENT_COLORS)) discarded.push(`Color secundario «${c.value}» fuera de la taxonomía`)
  const sec = ai.secondary_colors.map((c) => ({ v: pickOpt(c.value, GARMENT_COLORS), c: c.confidence })).filter((x) => x.v)
  if (sec.length) push('secondary_colors', sec.map((x) => x.v), sec.map((x) => x.v).join(', '), Math.min(...sec.map((x) => x.c)))
  if (ai.apparent_material.value) push('apparent_material', ai.apparent_material.value.slice(0, 80), ai.apparent_material.value.slice(0, 80), ai.apparent_material.confidence, 'Estimación visual: no es la composición')
  if (ai.formality.value) push('formality_level', ai.formality.value, `${ai.formality.value}/5`, ai.formality.confidence)
  for (const x of ai.seasons) if (!SEASONS.some((s) => s.id === x)) discarded.push(`Temporada «${x}» fuera de la taxonomía`)
  const seasons = ai.seasons.filter((x) => SEASONS.some((s) => s.id === x))
  if (seasons.length) push('seasons', seasons, seasons.map((x) => SEASONS.find((s) => s.id === x)!.label).join(', '), 0.6, 'Inferencia por el tipo de tejido y prenda')

  // Etiqueta: composicion, marca y talla solo si hay foto de etiqueta y se ha leido
  if (ai.composition?.value) {
    if (ctx.hasLabelPhoto && ai.composition.source === 'label') push('confirmed_composition', ai.composition.value.slice(0, 160), ai.composition.value.slice(0, 160), ai.composition.confidence, 'Leída en la etiqueta fotografiada')
    else discarded.push('Composición: sin foto de etiqueta legible no se puede confirmar')
  }
  if (ai.label && (ai.label.brand || ai.label.size)) {
    if (!ctx.hasLabelPhoto) discarded.push('Marca y talla: sin foto de etiqueta no se aceptan')
    else {
      if (ai.label.brand) push('brand', ai.label.brand.slice(0, 80), ai.label.brand.slice(0, 80), ai.label.confidence, 'Leída en la etiqueta')
      if (ai.label.size) push('size_label', ai.label.size.slice(0, 40), ai.label.size.slice(0, 40), ai.label.confidence, 'Leída en la etiqueta')
    }
  }

  // Atributos tecnicos de la familia
  for (const a of ai.attributes) {
    if (!a.value) continue
    const d = ATTRIBUTES[family].find((x) => x.key === a.key)
    if (!d) { discarded.push(`Atributo «${a.key}»: no aplica a esta prenda`); continue }
    const o = pickOpt(a.value, d.options)
    if (!o) { discarded.push(`${d.label} «${a.value}» fuera de la taxonomía`); continue }
    const f = `attr:${a.key}`
    push(f, o, o, a.confidence); fields[fields.length - 1].label = d.label
  }

  const confs = fields.map((f) => f.confidence)
  return {
    fields, discarded, family,
    unknown: ai.unknown, observations: ai.observations, inferences: ai.inferences,
    requested: [...new Set([...ai.additional_photos_requested, ...ai.unknown.map((u) => u.photo).filter(Boolean) as string[]])].filter((r) => IMAGE_ROLES.some((x) => x.id === r)),
    overall: confs.length ? Math.round((confs.reduce((s, x) => s + x, 0) / confs.length) * 100) / 100 : null,
  }
}

// ── Confirmacion ──
export type Decision = { action: 'accept' | 'reject' | 'correct'; value?: unknown }

/**
 * Convierte las decisiones del usuario en cambios de la ficha con trazabilidad:
 * aceptado → origen «ia» confirmado por el usuario; corregido → origen «usuario»; rechazado → no cambia nada.
 */
export function applyDecisions(n: NormalizedAnalysis, decisions: Record<string, Decision>, analysisId: string, garment: Record<string, any>) {
  const patch: Record<string, any> = {}
  const attributes: Record<string, string> = { ...(garment.attributes ?? {}) }
  let attrsTouched = false
  const sources: Record<string, { source: string; at: string; analysis_id: string; confirmed_by?: string }> = {}
  const record: Record<string, { action: string; proposed: unknown; value?: unknown }> = {}
  const at = new Date().toISOString()
  let accepted = 0, corrected = 0
  for (const f of n.fields) {
    const d = decisions[f.field]
    if (!d || d.action === 'reject') { record[f.field] = { action: 'reject', proposed: f.value }; continue }
    const value = d.action === 'correct' ? d.value : f.value
    record[f.field] = { action: d.action, proposed: f.value, ...(d.action === 'correct' ? { value } : {}) }
    if (d.action === 'accept') accepted++; else corrected++
    const source = d.action === 'accept' ? { source: 'ia', confirmed_by: 'usuario', at, analysis_id: analysisId } : { source: 'usuario', at, analysis_id: analysisId }
    if (f.field.startsWith('attr:')) { if (value) attributes[f.field.slice(5)] = String(value); else delete attributes[f.field.slice(5)]; attrsTouched = true; sources.attributes = source }
    else { patch[f.field] = value; sources[f.field] = source }
    if (f.field === 'confirmed_composition' && d.action === 'accept') { patch.composition_source = 'etiqueta'; sources.composition_source = source }
  }
  if (attrsTouched) patch.attributes = attributes
  const status = !accepted && !corrected ? 'rejected' : accepted === n.fields.length ? 'accepted' : 'partially_accepted'
  return { patch, sources, record, status }
}

/** Clave de deduplicacion: mismas fotos + misma version de prompt y esquema + misma pista = mismo analisis. */
export const inputKey = (hashes: string[], hint?: string | null) => [PROMPT_VERSION, SCHEMA_VERSION, hint ?? '-', ...[...hashes].sort()].join('|')
