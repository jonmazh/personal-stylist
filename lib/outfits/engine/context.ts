import { z } from 'zod'
import { GROUPS } from '@/lib/wardrobe/taxonomy'
import { OUTFIT_OCCASIONS, type ItemRole } from '../taxonomy'

/**
 * Outfit Engine (fase 3B) · etapa 1: comprender el contexto.
 * La peticion es estructurada (la 3C la deducira del lenguaje natural); aqui se resuelve en formalidad objetivo,
 * temporada, capas permitidas y filtros obligatorios. Ver docs/OUTFIT-STUDIO.md.
 */
export const DRESS_CODES = [
  { id: 'casual', label: 'Casual', formality: [1, 3] }, { id: 'smart_casual', label: 'Smart casual', formality: [3, 4] },
  { id: 'business', label: 'Business / oficina formal', formality: [4, 5] }, { id: 'formal', label: 'Formal', formality: [4, 5] },
] as const
export const TIMES = [{ id: 'morning', label: 'Mañana' }, { id: 'afternoon', label: 'Tarde' }, { id: 'evening', label: 'Noche' }] as const
export const ENVIRONMENTS = [{ id: 'indoor', label: 'Interior' }, { id: 'outdoor', label: 'Exterior' }, { id: 'mixed', label: 'Mixto' }] as const
export const WEATHERS = [{ id: 'hot', label: 'Calor' }, { id: 'mild', label: 'Templado' }, { id: 'cold', label: 'Frío' }, { id: 'rain', label: 'Lluvia' }] as const
export const FORMALITY_WISH = [{ id: 'low', label: 'Baja', range: [1, 2] }, { id: 'medium', label: 'Media', range: [3, 3] }, { id: 'high', label: 'Alta', range: [4, 5] }] as const
export const LEVELS = [{ id: 'low', label: 'Baja' }, { id: 'medium', label: 'Media' }, { id: 'high', label: 'Alta' }] as const
/** Intenciones esteticas: cada propuesta explora una interpretacion distinta de la misma ocasion (3.4). */
export const INTENTS = [
  { id: 'elegante', label: 'Más elegante', help: 'Formalidad alta dentro de lo adecuado, tonos profundos, piezas estructuradas.' },
  { id: 'minimalista', label: 'Más minimalista', help: 'Pocos colores, sin estampados, líneas limpias.' },
  { id: 'relajada', label: 'Más relajada', help: 'Formalidad baja dentro de lo adecuado, comodidad, sin rigidez.' },
  { id: 'personalidad', label: 'Con más personalidad', help: 'Un color de acento, un estampado o un rasgo que te gusta.' },
  { id: 'versatil', label: 'Especialmente versátil', help: 'Prendas neutras y muy combinables, que sirven para más ocasiones.' },
] as const
export type IntentId = (typeof INTENTS)[number]['id']
export const RESTRICTIONS = [
  { id: 'no_suit', label: 'Sin traje' }, { id: 'no_formal_shoes', label: 'Sin zapatos formales' }, { id: 'no_jacket', label: 'Sin chaqueta ni americana' },
  { id: 'no_coat', label: 'Sin abrigo' }, { id: 'no_sneakers', label: 'Sin zapatillas' },
] as const

const ids = <T extends { id: string }>(xs: readonly T[]) => xs.map((x) => x.id) as [string, ...string[]]
export const GenerateRequest = z.object({
  occasion: z.enum(ids(OUTFIT_OCCASIONS)).nullable().optional(),
  dress_code: z.enum(ids(DRESS_CODES)).nullable().optional(),
  time_of_day: z.enum(ids(TIMES)).nullable().optional(),
  environment: z.enum(ids(ENVIRONMENTS)).nullable().optional(),
  weather: z.enum(ids(WEATHERS)).nullable().optional(),
  formality: z.enum(ids(FORMALITY_WISH)).nullable().optional(),
  comfort_priority: z.enum(ids(LEVELS)).nullable().optional(),
  preferred_style: z.enum(ids(INTENTS)).nullable().optional(),
  restrictions: z.array(z.enum(ids(RESTRICTIONS))).max(8).default([]),
  exclude_categories: z.array(z.enum(ids(GROUPS))).max(9).default([]),
  exclude_garment_ids: z.array(z.string().uuid()).max(100).default([]),
  required_garment_ids: z.array(z.string().uuid()).max(3).default([]),
  preferred_garment_ids: z.array(z.string().uuid()).max(10).default([]),
  number_of_outfits: z.number().int().min(1).max(5).default(3),
  weights: z.record(z.string(), z.number().min(0).max(100)).optional(),
})
export type GenerateRequestT = z.infer<typeof GenerateRequest>

export interface Ctx {
  req: GenerateRequestT
  formality: [number, number]           // rango objetivo
  formalitySource: string
  hardMin: number                         // ninguna prenda principal por debajo (dress code obligatorio)
  season: string
  seasonSource: string
  noLayers: boolean                       // calor: sin capa intermedia ni abrigo
  needsCoat: boolean                      // frio o lluvia
  forbiddenRoles: ItemRole[]
  summary: string[]
}

const SEASON_BY_MONTH = ['invierno', 'invierno', 'primavera', 'primavera', 'primavera', 'verano', 'verano', 'verano', 'otono', 'otono', 'otono', 'invierno']
const inter = (a: readonly number[], z: readonly number[]): [number, number] | null => { const lo = Math.max(a[0], z[0]), hi = Math.min(a[1], z[1]); return lo <= hi ? [lo, hi] : null }

/** Resuelve la peticion: formalidad (deseada > codigo de vestimenta > ocasion), temporada (clima > fecha) y capas. */
export function resolveContext(req: GenerateRequestT, now = new Date()): Ctx {
  const occ = OUTFIT_OCCASIONS.find((o) => o.id === req.occasion)
  const dc = DRESS_CODES.find((d) => d.id === req.dress_code)
  const wish = FORMALITY_WISH.find((f) => f.id === req.formality)
  let formality: [number, number] = [1, 5], formalitySource = 'sin indicar: cualquier formalidad'
  if (occ) { formality = [...occ.formality] as [number, number]; formalitySource = `ocasión (${occ.label.toLowerCase()})` }
  if (dc) { const i = inter(formality, dc.formality); formality = i ?? ([...dc.formality] as [number, number]); formalitySource = `código de vestimenta (${dc.label.toLowerCase()})${occ ? ` y ocasión` : ''}` }
  if (wish) { const i = inter(formality, wish.range); if (i) { formality = i; formalitySource += ' y formalidad deseada' } else if (!dc) { formality = [...wish.range] as [number, number]; formalitySource = 'formalidad deseada' } }
  // El dress code es obligatorio: nada por debajo de su minimo menos uno
  const hardMin = dc ? Math.max(1, dc.formality[0] - 1) : 1
  const season = req.weather === 'hot' ? 'verano' : req.weather === 'cold' ? 'invierno' : SEASON_BY_MONTH[now.getMonth()]
  const seasonSource = req.weather === 'hot' || req.weather === 'cold' ? 'clima indicado' : 'fecha actual'
  const noLayers = req.weather === 'hot'
  const needsCoat = (req.weather === 'cold' || req.weather === 'rain') && !req.restrictions.includes('no_coat')
  const forbiddenRoles: ItemRole[] = []
  if (noLayers || req.restrictions.includes('no_coat')) forbiddenRoles.push('outer_layer')
  if (noLayers) forbiddenRoles.push('mid_layer')
  if (req.restrictions.includes('no_jacket') || (noLayers && formality[1] < 4)) forbiddenRoles.push('third_layer')
  if (req.restrictions.includes('no_suit')) forbiddenRoles.push('full_body')
  const summary = [
    occ ? occ.label : null, dc ? dc.label : null, TIMES.find((t) => t.id === req.time_of_day)?.label, ENVIRONMENTS.find((e) => e.id === req.environment)?.label,
    WEATHERS.find((w) => w.id === req.weather)?.label,
  ].filter(Boolean) as string[]
  return { req, formality, formalitySource, hardMin, season, seasonSource, noLayers, needsCoat, forbiddenRoles, summary }
}

// ── Plantillas (anatomia flexible del outfit) ──
export interface Template { id: string; label: string; slots: ItemRole[]; minFormality?: number; coat: boolean }
export const TEMPLATES: Template[] = [
  { id: 'basic', label: 'Base + parte inferior + calzado', slots: ['top_base', 'bottom', 'footwear'], coat: false },
  { id: 'third', label: 'Con tercera pieza', slots: ['top_base', 'third_layer', 'bottom', 'footwear'], coat: false },
  { id: 'layered', label: 'Con capa intermedia', slots: ['top_base', 'mid_layer', 'bottom', 'footwear'], coat: false },
  { id: 'coat', label: 'Con abrigo', slots: ['top_base', 'outer_layer', 'bottom', 'footwear'], coat: true },
  { id: 'third_coat', label: 'Tercera pieza y abrigo', slots: ['top_base', 'third_layer', 'outer_layer', 'bottom', 'footwear'], coat: true },
  { id: 'layered_coat', label: 'Capa intermedia y abrigo', slots: ['top_base', 'mid_layer', 'outer_layer', 'bottom', 'footwear'], coat: true },
  { id: 'suit', label: 'Traje', slots: ['top_base', 'full_body', 'footwear'], minFormality: 4, coat: false },
  { id: 'suit_coat', label: 'Traje con abrigo', slots: ['top_base', 'full_body', 'outer_layer', 'footwear'], minFormality: 4, coat: true },
]
/** Plantillas aplicables: sin roles prohibidos; con frio, las que llevan abrigo (si hay alguno disponible). */
export function templatesFor(ctx: Ctx, available: Set<string>) {
  const ok = TEMPLATES.filter((t) => t.slots.every((s) => !ctx.forbiddenRoles.includes(s) && available.has(s)) && (!t.minFormality || ctx.formality[1] >= t.minFormality))
  if (ctx.needsCoat) { const coat = ok.filter((t) => t.coat); if (coat.length) return { templates: coat, coatMissing: false }; return { templates: ok, coatMissing: true } }
  return { templates: ctx.noLayers ? ok.filter((t) => !t.coat) : ok.filter((t) => !t.coat || ctx.season === 'invierno'), coatMissing: false }
}
