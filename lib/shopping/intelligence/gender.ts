import { sizeGroupOf, type SizeGroup } from './sizes'

/**
 * Moda masculina: clasificación por DATOS ESTRUCTURADOS de la fuente (campo de género/edad de Channel3 o del feed,
 * etiquetas y colecciones de la tienda, ruta de categoría). No se usa el nombre comercial ni la descripción.
 * - Mujer o infantil → se excluye.
 * - Unisex: solo cuenta como apto con una regla explícita: prendas cuyo tallaje no depende del patrón masculino
 *   (camisetas y polos, punto y sudaderas, calzado y complementos sin talla). En el resto queda ambiguo.
 * - Sin datos → ambiguo: puede mostrarse, pero nunca como recomendado.
 */
export type GenderClass = 'male' | 'female' | 'kids' | 'unisex' | 'unknown'
export const UNISEX_OK: readonly (SizeGroup | null)[] = ['camisetas', 'punto', 'calzado', null]
export const GENDER_LABEL: Record<GenderClass, string> = { male: 'Hombre', female: 'Mujer', kids: 'Infantil', unisex: 'Unisex', unknown: 'Sin clasificar' }
const KIDS_AGES = ['newborn', 'infant', 'toddler', 'kids']
const TOK = {
  kids: /(^|[^a-z])(kids?|nin[oa]s?|infantil|junior|boys?|girls?|baby|bebe|toddler)([^a-z]|$)/,
  female: /(^|[^a-z])(mujer(es)?|women'?s?|woman|female|femenin[oa]|chica|ladies)([^a-z]|$)/,
  male: /(^|[^a-z])(hombres?|men'?s?|man|male|masculin[oa]|chico)([^a-z]|$)/,
  unisex: /(^|[^a-z])(unisex|for everyone|genderless|sin genero)([^a-z]|$)/,
}
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export interface GenderInfo { gender: GenderClass; source: 'channel3' | 'feed' | 'tienda' | 'categoria' | null; evidence: string }
export function classifyGender(p: { raw_attributes?: Record<string, any> | null }): GenderInfo {
  const ra = p.raw_attributes ?? {}
  const age = typeof ra.age === 'string' ? ra.age.toLowerCase() : null
  const g = typeof ra.gender === 'string' ? ra.gender.toLowerCase() : null
  const src = ra.provider === 'channel3' ? 'channel3' as const : 'feed' as const
  const path = ((ra.category_path ?? []) as string[]).map(norm).join(' / ')
  if (age && KIDS_AGES.includes(age)) return { gender: 'kids', source: src, evidence: `Edad «${age}» según ${src === 'channel3' ? 'Channel3' : 'el feed'}.` }
  if (/baby-toddler|girls|boys|kids|ninos|ninas|infantil/.test(path)) return { gender: 'kids', source: 'categoria', evidence: `Categoría infantil (${path}).` }
  if (/maternity|women|mujer/.test(path)) return { gender: 'female', source: 'categoria', evidence: `Categoría de mujer (${path}).` }
  if (g === 'male' || g === 'female' || g === 'unisex') return { gender: g, source: src, evidence: `Género «${g}» según ${src === 'channel3' ? 'Channel3' : 'el feed'}.` }
  // Etiquetas y colecciones de la tienda (datos estructurados de su catálogo, no el nombre del producto)
  const labels = [...((ra.tags ?? []) as string[]), ...((ra.collections ?? []) as string[])].map(norm)
  const has = (re: RegExp) => labels.filter((l) => re.test(l))
  const kids = has(TOK.kids), fem = has(TOK.female), male = has(TOK.male), uni = has(TOK.unisex)
  if (kids.length && !male.length) return { gender: 'kids', source: 'tienda', evidence: `Etiquetas de la tienda: ${kids.slice(0, 2).join(', ')}.` }
  if (uni.length || (fem.length && male.length)) return { gender: 'unisex', source: 'tienda', evidence: `Etiquetas de la tienda: ${[...uni, ...fem, ...male].slice(0, 3).join(', ')}.` }
  if (fem.length) return { gender: 'female', source: 'tienda', evidence: `Etiquetas de la tienda: ${fem.slice(0, 2).join(', ')}.` }
  if (male.length) return { gender: 'male', source: 'tienda', evidence: `Etiquetas de la tienda: ${male.slice(0, 2).join(', ')}.` }
  return { gender: 'unknown', source: null, evidence: 'La fuente no indica si es de hombre.' }
}
/** excluded: no se muestra (mujer / infantil). ok: apto. Ambiguo: puede verse, nunca recomendado. */
export function genderGate(p: { subcategory?: string | null; category?: string | null; raw_attributes?: Record<string, any> | null }) {
  const info = classifyGender(p)
  const group = sizeGroupOf(p.subcategory, p.category)
  if (info.gender === 'female' || info.gender === 'kids') return { ...info, excluded: true, ok: false, reason: `${GENDER_LABEL[info.gender]}: no es moda masculina. ${info.evidence}` }
  if (info.gender === 'male') return { ...info, excluded: false, ok: true, reason: info.evidence }
  if (info.gender === 'unisex') return UNISEX_OK.includes(group) ? { ...info, excluded: false, ok: true, reason: `Unisex en una prenda de tallaje neutro. ${info.evidence}` } : { ...info, excluded: false, ok: false, reason: `Unisex en una prenda con patrón por género: no la doy por masculina. ${info.evidence}` }
  return { ...info, excluded: false, ok: false, reason: info.evidence }
}
