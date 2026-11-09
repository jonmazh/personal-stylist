import type { Bundle } from '@/lib/profile/data'
import { colorimetry, silhouette } from '@/lib/profile/blueprint'
import { colorFit } from '@/lib/color/temperature'
import { PALETTES } from '@/lib/color/palette'
import { PALETTE_OF } from '@/lib/style/references'
import { elementLabel, styleById, styleName } from '@/lib/style/catalog'
import { styleFit, styleProfileOf } from '@/lib/style/dna'
import { LIFE } from '@/lib/profile/areas'
import { familyOf, groupOf, subOf } from './taxonomy'
import { garmentTitle } from './display'

/**
 * Evaluacion personal de una prenda (fase 2C): reglas deterministas sobre TUS datos, como el motor de diagnostico.
 * Tres valoraciones separadas: compatibilidad personal, ajuste real (Fit Assessment) y valor estrategico.
 * Una valoracion que no puede calcularse es «pendiente» (null), nunca cero. Ver docs/ARMARIO.md.
 */
export type Conf = 'alta' | 'media' | 'baja'
export interface Criterion {
  id: string; label: string; weight: number
  score: number | null      // 0..10; null = pendiente
  why: string[]; data_used: string[]; missing: string[]; confidence: Conf | null
}
export interface Score { score: number | null; provisional: boolean; coverage: number; confidence: Conf | null; criteria: Criterion[]; note?: string }

const r1 = (x: number) => Math.round(x * 10) / 10
const clamp = (x: number) => Math.max(0, Math.min(10, x))
const minConf = (xs: (Conf | null)[]): Conf | null => { const v = xs.filter(Boolean) as Conf[]; return !v.length ? null : v.includes('baja') ? 'baja' : v.includes('media') ? 'media' : 'alta' }
const src = (g: Record<string, any>, f: string) => g.field_sources?.[f]?.source as string | undefined
const lc = (s: string) => s.toLowerCase()

// ── La prenda traducida al vocabulario de estilo (elementos del catalogo) ──
const SUB_ELEMENTS: Record<string, string[]> = {
  tee: ['basic-tee'], polo: ['polo'], shirt: ['shirt'], knit: ['knit'], cardigan: ['cardigan'], sweatshirt: ['hoodie'], hoodie: ['hoodie'], turtleneck: ['turtleneck'],
  blazer: ['blazer'], denim_jacket: ['denim-jacket'], leather_jacket: ['leather'], bomber: ['varsity'], overshirt: ['overshirt'], coat: ['long-coat'], trench: ['long-coat'],
  puffer: ['puffer'], parka: ['technical'], jeans: ['denim'], trousers: ['tailoring'], cargo: ['cargo'], joggers: ['leg-jogger'], sneakers: ['sneaker'], loafers: ['loafer'],
  boots: ['boot'], derby: ['derby'], headwear: ['cap'], bag: ['crossbody'], glasses: ['sunglasses'], jewelry: ['chain'], sport_jacket: ['tracksuit', 'technical'],
  sport_bottom: ['leg-jogger'], suit: ['blazer', 'tailoring'], waistcoat: ['tailoring'],
}
export function garmentElements(g: Record<string, any>): string[] {
  const e = new Set(SUB_ELEMENTS[g.subcategory] ?? [])
  if (g.subcategory === 'tee' && g.pattern === 'Gráfico') { e.delete('basic-tee'); e.add('graphic-tee') }
  if (g.subcategory === 'shirt' && g.pattern === 'Cuadros') e.add('flannel')
  const fam = familyOf(g.subcategory, g.category)
  if (fam === 'bottom') {
    if (g.cut === 'Slim') e.add('leg-slim'); if (g.cut === 'Recto') e.add('leg-straight'); if (g.cut === 'Wide') e.add('leg-wide')
    if (g.silhouette === 'Amplia' && g.cut !== 'Wide') e.add('leg-baggy')
  } else if (['top', 'shirt', 'jacket'].includes(fam)) {
    if (g.silhouette === 'Amplia') e.add('top-oversize'); if (g.silhouette === 'Ajustada') e.add('top-fitted')
  }
  if (g.attributes?.structure === 'Desestructurada' && g.subcategory === 'blazer') e.add('layers')
  return [...e]
}
const paletteName = (c?: string | null) => (c ? PALETTE_OF[c] ?? c : null)
const NEAR_FACE = new Set(['top', 'outerwear', 'tailoring'])
const NEUTRALS = new Set(['Negro', 'Blanco', 'Gris', 'Azul marino', 'Beige', 'Camel', 'Marrón', 'Crudo', 'Antracita', 'Gris claro', 'Denim', 'Denim claro', 'Caqui'])

// ── Criterios de compatibilidad personal (pesos iniciales de la especificacion) ──
export const WEIGHTS = { style: 25, color: 25, cut: 25, needs: 15, info: 10 } as const

function styleCriterion(g: Record<string, any>, b: Bundle): Criterion {
  const c: Criterion = { id: 'style', label: 'Compatibilidad con tu estilo', weight: WEIGHTS.style, score: null, why: [], data_used: [], missing: [], confidence: null }
  const p = styleProfileOf(b)
  if (p.identity.source === 'ninguna' && !p.elements.liked.length && !p.elements.rejected.length) {
    c.missing.push('Tu identidad estética (valora conjuntos o elige tus estilos en «Identidad estética»)'); return c
  }
  const elements = garmentElements(g)
  const tags: string[] = g.style_tags ?? []
  if (!elements.length && !tags.length) { c.missing.push('El tipo de prenda o su estilo en la ficha'); return c }
  // Estilos candidatos: los que le has puesto a la prenda y los de tu identidad que comparten algun rasgo con ella
  const candidates = new Set<string>(tags)
  for (const i of p.identity.influences) if (styleById(i.style)?.elements.some((e) => elements.includes(e))) candidates.add(i.style)
  const runs = (candidates.size ? [...candidates] : [undefined]).map((style) => ({ style, ...styleFit(p, { style, elements }) }))
  const best = runs.sort((a, z) => z.score - a.score)[0]
  c.score = r1(best.score / 10)
  c.why.push(...best.reasons)
  if (!best.reasons.length) c.why.push(candidates.size ? 'Comparte poco con tu identidad estética: no la contradice, pero tampoco la representa.' : 'No encaja de forma clara con ninguna de tus influencias ni con lo que rechazas: es una prenda neutra para tu estilo.')
  c.data_used.push(`Identidad ${p.identity.source === 'declarada' ? 'declarada' : 'propuesta (sin confirmar)'}: ${p.identity.influences.map((i) => `${styleName(i.style)} ${i.weight} %`).join(', ') || '—'}`)
  if (elements.length) c.data_used.push(`Rasgos de la prenda: ${elements.map((e) => elementLabel(e).toLowerCase()).join(', ')}`)
  if (tags.length) c.data_used.push(`Estilo indicado en la ficha: ${tags.map(styleName).join(', ')}`)
  c.confidence = p.identity.source === 'declarada' ? (b.validated.a4 ? 'alta' : 'media') : 'baja'
  if (p.identity.source !== 'declarada') c.missing.push('Confirmar tu identidad estética')
  return c
}

function colorCriterion(g: Record<string, any>, b: Bundle): Criterion {
  const c: Criterion = { id: 'color', label: 'Compatibilidad cromática', weight: WEIGHTS.color, score: null, why: [], data_used: [], missing: [], confidence: null }
  if (!g.primary_color) { c.missing.push('El color principal de la prenda'); return c }
  if (g.primary_color === 'Multicolor') { c.missing.push('Color dominante (multicolor no se puede evaluar)'); return c }
  const col = colorimetry(b)
  const likes: string[] = b.color?.likes ?? [], avoids: string[] = b.color?.avoids ?? []
  const color = paletteName(g.primary_color)!
  const nearFace = NEAR_FACE.has(g.category)
  if (!col.temp && !likes.length && !avoids.length) { c.missing.push('Tu temperatura cromática o tus colores preferidos (Estudio cromático)'); return c }
  let s = 6
  if (col.temp) {
    const f = colorFit(col.temp, color, { nearFace, liked: likes.includes(color) })
    s = f.verdict === 'favorece' ? 9 : f.verdict === 'funciona' ? (NEUTRALS.has(g.primary_color) ? 7.5 : 8) : 5
    c.why.push(f.reason)
    c.data_used.push(`Temperatura ${col.temp.toLowerCase()} (${col.tempSource === 'validado' ? 'validada' : col.tempSource === 'declarado' ? 'declarada' : col.tempSource === 'ia' ? 'estimada por IA, sin confirmar' : 'deducida de pistas'})`)
  } else c.missing.push('Tu temperatura cromática')
  if (likes.includes(color)) { s += 1; c.why.push(`${color} está entre los colores que te gusta llevar.`) }
  if (avoids.includes(color)) { s -= 3; c.why.push(`${color} está entre los colores que evitas.`) }
  const sec = (g.secondary_colors ?? []).map(paletteName).filter((x: string) => avoids.includes(x))
  if (sec.length) { s -= 1; c.why.push(`Lleva ${sec.join(', ')} como color secundario, que evitas.`) }
  if (likes.length || avoids.length) c.data_used.push('Tus colores preferidos y los que evitas')
  c.data_used.push(`Color de la prenda: ${g.primary_color}${nearFace ? ' (cerca de la cara)' : ''}`)
  c.score = r1(clamp(s))
  c.confidence = col.tempSource === 'validado' || (col.tempSource === 'declarado' && b.validated.a3) ? 'alta' : col.temp && col.tempSource !== 'pistas' ? 'media' : 'baja'
  if (src(g, 'primary_color') === 'ia' && !g.field_sources?.primary_color?.confirmed_by) c.confidence = 'baja'
  return c
}

const PREF_KEY = (g: Record<string, any>): string | null => {
  const s = g.subcategory
  if (['tee', 'polo', 'knit', 'sweatshirt', 'hoodie', 'turtleneck', 'tank', 'cardigan', 'sport_top'].includes(s)) return 'camisetas'
  if (['shirt', 'overshirt'].includes(s)) return 'camisas'
  if (g.category === 'bottom') return 'pantalones'
  if (['coat', 'trench', 'parka', 'puffer'].includes(s)) return 'abrigos'
  if (g.category === 'outerwear' || ['blazer', 'suit'].includes(s)) return 'chaquetas'
  if (g.category === 'footwear') return 'calzado'
  return null
}
/** ¿La prenda coincide con el corte que prefieres para su tipo? true / false / null (no comparable). */
function matchesPref(key: string, pref: string, g: Record<string, any>): boolean | null {
  const a = g.attributes ?? {}
  switch (key) {
    case 'pantalones': return g.cut ? ({ Recto: 'Recto', Wide: 'Amplio', Tapered: 'Tapered' } as Record<string, string>)[g.cut] === pref : null
    case 'camisetas': case 'camisas': {
      if (!g.silhouette) return null
      const map: Record<string, string[]> = { Regular: ['Regular'], Relaxed: ['Amplia', 'Regular'], Ajustada: ['Ajustada'], Oversize: ['Amplia'], Entallada: ['Ajustada'] }
      return (map[pref] ?? []).includes(g.silhouette)
    }
    case 'chaquetas': return a.structure ? (pref === 'Estructurada' ? a.structure !== 'Desestructurada' : a.structure === 'Desestructurada') : null
    case 'abrigos': return a.length ? ({ Corto: ['Corto', 'A la cadera'], Medio: ['Medio'], Largo: ['Largo'] } as Record<string, string[]>)[pref]?.includes(a.length) ?? null : null
    case 'calzado': return ({ sneakers: ['Minimalista', 'Deportivo'], loafers: ['Clásico'], derby: ['Clásico'], boots: ['Clásico', 'Minimalista'], sandals: [] } as Record<string, string[]>)[g.subcategory]?.includes(pref) ?? null
  }
  return null
}

function cutCriterion(g: Record<string, any>, b: Bundle): Criterion {
  const c: Criterion = { id: 'cut', label: 'Adecuación del corte a tus preferencias y proporciones', weight: WEIGHTS.cut, score: null, why: [], data_used: [], missing: [], confidence: null }
  const key = PREF_KEY(g)
  const pref = key ? b.fit?.prefs?.[key] : undefined
  const general: string | undefined = b.profile?.fit_pref ?? undefined
  const never: string = b.style?.never_wear ?? ''
  const sil = silhouette(b)
  const parts: number[] = []
  if (key && pref) {
    const m = matchesPref(key, pref, g)
    if (m === null) c.missing.push(`El corte de la prenda en la ficha (para compararlo con tu preferencia: ${lc(pref)})`)
    else { parts.push(m ? 9 : 5); c.why.push(m ? `Es el corte que prefieres en ${key} (${lc(pref)}).` : `Prefieres ${key} con corte ${lc(pref)}; esta es distinta. No es un error: puede darte variedad, pero tenlo en cuenta.`); c.data_used.push(`Preferencia en ${key}: ${pref}`) }
  } else if (key) c.missing.push(`Tu corte preferido en ${key} (Preferencias de vestuario)`)
  if (general && g.silhouette && familyOf(g.subcategory, g.category) !== 'footwear') {
    const ok = ({ Ajustado: ['Ajustada'], Regular: ['Regular'], Relajado: ['Regular', 'Amplia'], Amplio: ['Amplia'] } as Record<string, string[]>)[general]?.includes(g.silhouette)
    parts.push(ok ? 8.5 : 6); c.why.push(ok ? `Su silueta (${lc(g.silhouette)}) va con tu ajuste general preferido (${lc(general)}).` : `Su silueta (${lc(g.silhouette)}) se aleja de tu ajuste general preferido (${lc(general)}).`)
    c.data_used.push(`Ajuste general preferido: ${general}`)
  }
  // Limites declarados: «algo que nunca te pondrias»
  const words = [subOf(g.subcategory)?.label, g.cut === 'Slim' ? 'pitillo' : null, g.cut, g.pattern === 'Estampado' ? 'estampado' : null, g.pattern === 'Gráfico' ? 'logo' : null].filter(Boolean).map((x) => lc(String(x)))
  const hit = never && words.find((w) => w.length > 3 && lc(never).includes(w))
  if (hit) { parts.push(2); c.why.push(`Has dicho que nunca te pondrías «${never}» y esta prenda coincide (${hit}).`); c.data_used.push('Lo que nunca te pondrías') }
  // Proporciones conocidas (medidas): orientaciones prudentes, no prohibiciones
  if (sil && g.category === 'bottom') {
    if (sil.legs === 'cortas' && (g.attributes?.length === 'Largo' || g.attributes?.hem === 'Amplio')) { parts.push(6); c.why.push('Con piernas proporcionalmente cortas, un largo con mucha acumulación o un bajo amplio acorta la pierna: vigila el largo.') }
    else if (sil.legs) c.data_used.push(`Proporción de piernas: ${sil.legs}`)
    if (sil.hips && g.cut === 'Slim') { parts.push(6.5); c.why.push('Con cadera algo más ancha que el pecho, un pantalón slim marca esa diferencia; un recto o tapered equilibra.') }
  }
  if (sil && ['top', 'shirt', 'jacket'].includes(familyOf(g.subcategory, g.category))) {
    if (sil.shape === 'cintura' && g.silhouette === 'Ajustada') { parts.push(6); c.why.push('Con cintura más ancha que el pecho, una prenda ajustada arriba la marca; regular cae mejor.') }
    if (sil.shape === 'v' && g.silhouette === 'Amplia') c.why.push('Tu torso en V admite volumen, aunque una prenda amplia oculta esa proporción.')
    c.data_used.push(`Silueta según tus medidas: ${sil.shape}`)
  }
  if (!sil) c.missing.push('Tus medidas (pecho y cintura) para valorar proporciones')
  if (!parts.length) return { ...c, score: null }
  c.score = r1(parts.reduce((s, x) => s + x, 0) / parts.length)
  c.confidence = b.validated.a6 && sil ? 'alta' : pref || general ? 'media' : 'baja'
  if (src(g, 'cut') === 'ia' && !g.field_sources?.cut?.confirmed_by) c.confidence = 'baja'
  return c
}

/** Ocasiones de la prenda: las que indicaste o, si no, deducidas de su formalidad (marcadas como deducidas). */
export function occasionsOf(g: Record<string, any>): { ids: string[]; inferred: boolean } {
  if ((g.occasions ?? []).length) return { ids: g.occasions, inferred: false }
  const f = g.formality_level
  if (!f) return { ids: [], inferred: true }
  return { ids: f >= 5 ? ['eventos', 'trabajo'] : f === 4 ? ['trabajo', 'citas', 'eventos'] : f === 3 ? ['trabajo', 'ocio', 'citas'] : f === 2 ? ['ocio', 'universidad'] : ['ocio', 'deporte'], inferred: true }
}
const WORK_FORMALITY: Record<string, [number, number]> = { 'Muy formal (traje)': [4, 5], 'Smart casual': [3, 4], Casual: [2, 3], Teletrabajo: [1, 3], Uniforme: [0, 0], 'No trabajo ahora': [0, 0] }

function needsCriterion(g: Record<string, any>, b: Bundle): Criterion {
  const c: Criterion = { id: 'needs', label: 'Encaje con tus necesidades', weight: WEIGHTS.needs, score: null, why: [], data_used: [], missing: [], confidence: null }
  const life: Record<string, number> = b.life?.life ?? {}
  const total = Object.values(life).reduce((s, x) => s + (Number(x) || 0), 0)
  const occ = occasionsOf(g)
  const parts: number[] = []
  if (total > 0 && occ.ids.length) {
    const share = occ.ids.reduce((s, id) => s + (Number(life[id]) || 0), 0) / total
    parts.push(clamp(3 + share * 10))
    const names = occ.ids.map((id) => LIFE.find(([k]) => k === id)?.[1].toLowerCase()).filter(Boolean)
    c.why.push(`Sirve para ${names.join(', ')}${occ.inferred ? ' (deducido de su formalidad)' : ''}: un ${Math.round(share * 100)} % de tu semana.`)
    c.data_used.push('Reparto de tu semana (Estilo de vida)')
  } else if (!total) c.missing.push('El reparto de tu semana (Estilo de vida)')
  else c.missing.push('Ocasiones o formalidad de la prenda')
  const wf = b.life?.work_formality as string | undefined
  if (wf && g.formality_level && (occ.ids.includes('trabajo'))) {
    const [lo, hi] = WORK_FORMALITY[wf] ?? [0, 0]
    if (lo) { const ok = g.formality_level >= lo && g.formality_level <= hi; parts.push(ok ? 9 : 5); c.why.push(ok ? `Su formalidad (${g.formality_level}/5) encaja con tu trabajo (${lc(wf)}).` : `Su formalidad (${g.formality_level}/5) no es la de tu trabajo (${lc(wf)}).`); c.data_used.push(`Formalidad del trabajo: ${wf}`) }
  }
  const climate = b.life?.climate as string | undefined
  const seasons: string[] = g.seasons ?? []
  if (climate && seasons.length) {
    const warm = climate === 'Cálido todo el año', cold = climate === 'Frío y húmedo'
    const onlyWinter = seasons.every((s) => s === 'invierno' || s === 'otono'), onlySummer = seasons.every((s) => s === 'verano' || s === 'primavera')
    if ((warm && onlyWinter) || (cold && onlySummer)) { parts.push(4); c.why.push(`Es de ${seasons.join(' y ')} y tu clima es «${lc(climate)}»: tendrá poco uso.`) }
    else parts.push(8)
    c.data_used.push(`Clima: ${climate}`)
  }
  const cons: string[] = b.life?.constraints ?? []
  const mat = lc(g.apparent_material ?? g.confirmed_composition ?? '')
  if (cons.includes('Necesito prendas que no se arruguen') && /lino/.test(mat)) { parts.push(4); c.why.push('Necesitas prendas que no se arruguen y parece de lino.') }
  if (cons.includes('Priorizo la comodidad sobre todo') && (g.attributes?.structure === 'Rígida' || g.attributes?.structure === 'Estructurada')) { parts.push(5); c.why.push('Priorizas la comodidad y es una prenda rígida o muy estructurada.') }
  if (cons.length) c.data_used.push('Restricciones prácticas')
  if (!parts.length) return c
  c.score = r1(parts.reduce((s, x) => s + x, 0) / parts.length)
  c.confidence = b.validated.a5 ? (occ.inferred ? 'media' : 'alta') : occ.inferred ? 'baja' : 'media'
  return c
}

const KEY_FIELDS = ['category', 'subcategory', 'primary_color', 'pattern', 'cut', 'silhouette', 'formality_level', 'seasons']
function infoCriterion(g: Record<string, any>, imageCount: number): Criterion {
  const c: Criterion = { id: 'info', label: 'Calidad de la información disponible', weight: WEIGHTS.info, score: null, why: [], data_used: [], missing: [], confidence: 'alta' }
  const present = KEY_FIELDS.filter((f) => (Array.isArray(g[f]) ? g[f].length : g[f] !== null && g[f] !== undefined && g[f] !== ''))
  const confirmed = present.filter((f) => { const s = g.field_sources?.[f]; return s && (s.source !== 'ia' || s.confirmed_by) })
  let s = (confirmed.length / KEY_FIELDS.length) * 7
  if (imageCount) s += 1.5
  if (g.confirmed_composition) s += 1.5
  c.score = r1(clamp(s))
  c.why.push(`${confirmed.length} de ${KEY_FIELDS.length} datos clave confirmados${imageCount ? `, ${imageCount} foto${imageCount === 1 ? '' : 's'}` : ', sin fotos'}${g.confirmed_composition ? ', composición confirmada' : ''}.`)
  const missing = KEY_FIELDS.filter((f) => !present.includes(f))
  if (missing.length) c.missing.push(`Completar: ${missing.map((f) => ({ category: 'categoría', subcategory: 'tipo', primary_color: 'color', pattern: 'estampado', cut: 'corte', silhouette: 'silueta', formality_level: 'formalidad', seasons: 'temporadas' } as Record<string, string>)[f]).join(', ')}`)
  c.data_used.push('Ficha de la prenda y origen de cada dato')
  return c
}

/** Compatibilidad personal: media ponderada de lo que se puede calcular; pendiente si falta mas de la mitad del peso personal. */
export function compatibility(g: Record<string, any>, b: Bundle, imageCount = 0): Score {
  const criteria = [styleCriterion(g, b), colorCriterion(g, b), cutCriterion(g, b), needsCriterion(g, b), infoCriterion(g, imageCount)]
  const personal = criteria.filter((c) => c.id !== 'info')
  const personalWeight = personal.reduce((s, c) => s + c.weight, 0)
  const covered = personal.filter((c) => c.score !== null).reduce((s, c) => s + c.weight, 0)
  const coverage = covered / personalWeight
  const done = criteria.filter((c) => c.score !== null)
  const w = done.reduce((s, c) => s + c.weight, 0)
  if (coverage < 0.5) return { score: null, provisional: true, coverage, confidence: null, criteria, note: 'Pendiente: faltan datos de tu perfil o de la prenda para más de la mitad de los criterios.' }
  const score = r1(done.reduce((s, c) => s + c.score! * c.weight, 0) / w)
  const confidence = minConf(done.map((c) => c.confidence))
  return { score, provisional: coverage < 1 || confidence === 'baja', coverage, confidence, criteria, note: coverage < 1 ? `Provisional: calculada con el ${Math.round(coverage * 100)} % de los criterios personales.` : undefined }
}

// ── Valor estrategico en el armario (preliminar: lo completara la auditoria 2D y el registro de uso) ──
const COMPLEMENT: Record<string, string[]> = {
  top: ['bottom', 'outerwear', 'footwear', 'tailoring'], bottom: ['top', 'outerwear', 'footwear', 'tailoring'], outerwear: ['top', 'bottom', 'footwear'],
  footwear: ['top', 'bottom', 'outerwear', 'tailoring'], tailoring: ['top', 'bottom', 'footwear'], accessories: ['top', 'bottom', 'outerwear', 'footwear', 'tailoring'],
}
export const MIN_WARDROBE = 5
/** Dos prendas combinan si son de grupos complementarios, de formalidad cercana y sus colores no chocan. */
export function combines(a: Record<string, any>, z: Record<string, any>, temp?: string) {
  if (!COMPLEMENT[a.category]?.includes(z.category)) return false
  if (a.formality_level && z.formality_level && Math.abs(a.formality_level - z.formality_level) > 1) return false
  const ca = paletteName(a.primary_color), cz = paletteName(z.primary_color)
  if (!ca || !cz) return true
  if (NEUTRALS.has(a.primary_color) || NEUTRALS.has(z.primary_color) || ca === cz) return true
  if (temp) { const p = PALETTES[temp as keyof typeof PALETTES]; const all = [...p.cara, ...p.neutros, ...p.acentos, ...p.inferiores]; return all.includes(ca) && all.includes(cz) }
  return a.pattern === 'Liso' || z.pattern === 'Liso'
}
export function duplicatesOf(g: Record<string, any>, others: Record<string, any>[]) {
  return others.filter((o) => o.subcategory && o.subcategory === g.subcategory && paletteName(o.primary_color) === paletteName(g.primary_color) && (!g.cut || !o.cut || g.cut === o.cut))
}

export function strategicValue(g: Record<string, any>, others: Record<string, any>[], b: Bundle): Score & { combos: Record<string, any>[]; duplicates: Record<string, any>[] } {
  const crit = (id: string, label: string, weight: number): Criterion => ({ id, label, weight, score: null, why: [], data_used: [], missing: [], confidence: 'media' })
  const base = { combos: [] as Record<string, any>[], duplicates: [] as Record<string, any>[] }
  if (!g.category) return { score: null, provisional: true, coverage: 0, confidence: null, criteria: [], note: 'Pendiente: falta la categoría de la prenda.', ...base }
  if (others.length < MIN_WARDROBE - 1) return { score: null, provisional: true, coverage: 0, confidence: null, criteria: [], note: `Pendiente: se calcula cuando tengas al menos ${MIN_WARDROBE} prendas en el armario (ahora ${others.length + 1}).`, ...base }
  const temp = colorimetry(b).temp
  const combos = others.filter((o) => combines(g, o, temp))
  const groups = new Set(combos.map((o) => o.category))
  const c1 = crit('combos', 'Prendas con las que combina', 35)
  c1.score = r1(clamp((combos.length / Math.max(4, others.length * 0.6)) * 10))
  c1.why.push(`Combina con ${combos.length} de tus ${others.length} otras prendas (${[...groups].map((x) => groupOf(x)?.label.toLowerCase()).join(', ') || 'ninguna'}).`)
  c1.data_used.push('Grupo, formalidad y color de tus prendas activas')
  const c2 = crit('occasions', 'Ocasiones que cubre', 20)
  const occ = occasionsOf(g)
  c2.score = occ.ids.length ? r1(clamp(4 + occ.ids.length * 2)) : null
  if (occ.ids.length) c2.why.push(`${occ.ids.length} ocasiones${occ.inferred ? ' (deducidas de su formalidad)' : ''}.`); else c2.missing.push('Ocasiones o formalidad de la prenda')
  const c3 = crit('seasons', 'Temporadas', 15)
  const seasons: string[] = g.seasons ?? []
  c3.score = seasons.length ? r1(clamp(4 + seasons.length * 1.5)) : null
  if (seasons.length) c3.why.push(`Se usa en ${seasons.length} temporada${seasons.length === 1 ? '' : 's'}.`); else c3.missing.push('Temporadas de la prenda')
  const dups = duplicatesOf(g, others)
  const c4 = crit('unique', 'No duplica otra prenda', 15)
  c4.score = dups.length ? Math.max(2, 7 - dups.length * 2.5) : 10
  c4.why.push(dups.length ? `Se parece mucho a: ${dups.map(garmentTitle).join(', ')} (mismo tipo, color y corte).` : 'No hay otra prenda igual en tu armario.')
  const c5 = crit('need', 'Cubre una necesidad', 15)
  const life: Record<string, number> = b.life?.life ?? {}
  const sameGroup = others.filter((o) => o.category === g.category)
  const key = occ.ids.filter((id) => (Number(life[id]) || 0) >= 20)
  const covered = key.filter((id) => !sameGroup.some((o) => occasionsOf(o).ids.includes(id)))
  if (!Object.keys(life).length) { c5.score = null; c5.missing.push('El reparto de tu semana') }
  else { c5.score = covered.length ? 10 : key.length ? 6 : 4; c5.why.push(covered.length ? `Es tu única prenda de ${groupOf(g.category)?.label.toLowerCase()} para ${covered.map((id) => LIFE.find(([k]) => k === id)?.[1].toLowerCase()).join(', ')}.` : key.length ? 'Sirve para actividades importantes de tu semana, que ya cubren otras prendas.' : 'No cubre ninguna de las actividades principales de tu semana.') }
  const criteria = [c1, c2, c3, c4, c5]
  const done = criteria.filter((c) => c.score !== null)
  const w = done.reduce((s, c) => s + c.weight, 0)
  const coverage = w / 100
  return { score: r1(done.reduce((s, c) => s + c.score! * c.weight, 0) / w), provisional: true, coverage, confidence: 'media', criteria, note: 'Preliminar: se recalcula al añadir prendas y, más adelante, con tu registro de uso.', combos, duplicates: dups }
}

// ── Ajuste real (de la ultima evaluacion confirmada) ──
export function fitScore(review: Record<string, any> | null | undefined): Score {
  if (!review) return { score: null, provisional: true, coverage: 0, confidence: null, criteria: [], note: 'Pendiente: registra cómo te queda en «Fit Assessment».' }
  const dims = (review.dimensions ?? []) as { key: string; label: string; score: number | null; note?: string }[]
  const seen = dims.filter((d) => d.score !== null && d.score !== undefined)
  if (!seen.length) return { score: null, provisional: true, coverage: 0, confidence: null, criteria: [], note: 'Pendiente: ninguna dimensión se pudo valorar.' }
  const criteria: Criterion[] = dims.map((d) => ({ id: d.key, label: d.label, weight: 1, score: d.score ?? null, why: d.note ? [d.note] : [], data_used: [], missing: d.score == null ? ['No se pudo observar'] : [], confidence: null }))
  const score = r1(seen.reduce((s, d) => s + d.score!, 0) / seen.length)
  return { score, provisional: !!review.provisional || seen.length < dims.length, coverage: seen.length / dims.length, confidence: review.source === 'usuario' && !review.image_ids?.length ? 'media' : review.provisional ? 'baja' : 'alta', criteria, note: review.provisional ? 'Provisional: alguna dimensión no se pudo observar bien en las fotos.' : undefined }
}

// ── Decision propuesta y veredicto ──
export const DECISIONS = [
  { id: 'keep', label: 'Conservar', help: 'Cumple su función y encaja con tu armario.' },
  { id: 'modify', label: 'Modificar', help: 'Un arreglo puede mejorarla.' },
  { id: 'review', label: 'Revisar', help: 'Falta información o una valoración personal.' },
  { id: 'replace', label: 'Sustituir', help: 'Hay razones para buscar una alternativa.' },
  { id: 'donate_sell', label: 'Donar / vender', help: 'No tiene utilidad suficiente para mantenerla.' },
] as const
export type DecisionId = (typeof DECISIONS)[number]['id']
export const decisionLabel = (id?: string | null) => DECISIONS.find((d) => d.id === id)?.label ?? '—'

export function proposeDecision(compat: Score, fit: Score, value: Score, fitReview?: Record<string, any> | null): { decision: DecisionId; why: string } {
  const fixable = ((fitReview?.dimensions ?? []) as { label: string; score: number | null; fixable?: boolean }[]).filter((d) => d.fixable && d.score !== null && d.score < 7)
  if (fixable.length) return { decision: 'modify', why: `Un arreglo puede mejorar: ${fixable.map((d) => d.label.toLowerCase()).join(', ')}.` }
  if (compat.score === null && fit.score === null) return { decision: 'review', why: 'Aún falta información para valorarla: completa la ficha, tu perfil o registra cómo te queda.' }
  if (fit.score !== null && fit.score < 5) return { decision: 'replace', why: `No te queda bien (ajuste ${fit.score}) y no parece arreglable.` }
  if (compat.score !== null && compat.score < 5 && (value.score === null || value.score < 5)) return { decision: value.score !== null && value.score < 4 ? 'donate_sell' : 'replace', why: `Encaja poco contigo (compatibilidad ${compat.score})${value.score !== null ? ` y aporta poco a tu armario (valor ${value.score})` : ''}.` }
  if ((compat.score ?? 0) >= 7 && (fit.score === null || fit.score >= 7)) return { decision: fit.score === null ? 'review' : 'keep', why: fit.score === null ? 'Encaja contigo; para decidir con seguridad, registra cómo te queda.' : 'Encaja contigo y te queda bien.' }
  return { decision: 'review', why: 'Los resultados son intermedios: conviene que la valores tú.' }
}

export function verdict(g: Record<string, any>, compat: Score, fit: Score, value: Score & { combos?: unknown[]; duplicates?: Record<string, any>[] }) {
  const out: string[] = []
  const best = compat.criteria.filter((c) => c.id !== 'info' && c.score !== null).sort((a, z) => z.score! - a.score!)
  if (compat.score === null) out.push('Todavía no tengo datos suficientes para saber cuánto encaja contigo.')
  else if (compat.score >= 7.5) out.push(`Encaja bien contigo, sobre todo por ${lc(best[0]?.label ?? 'tu perfil')}.`)
  else if (compat.score >= 5.5) out.push(`Encaja a medias: ${lc(best.at(-1)?.label ?? '')} es lo que menos funciona.`)
  else out.push(`Encaja poco con tu perfil: falla sobre todo ${lc(best.at(-1)?.label ?? '')}.`)
  if (value.score !== null) out.push(value.duplicates?.length ? `Tienes otra prenda muy parecida (${value.duplicates.map(garmentTitle).join(', ')}).` : `Combina con ${value.combos?.length ?? 0} prendas de tu armario.`)
  out.push(fit.score === null ? 'Su corte no dice cómo te queda: eso solo lo sabremos con una prueba de ajuste.' : fit.score >= 7 ? 'Según la prueba de ajuste registrada, te queda bien.' : 'La prueba de ajuste indica que no te queda del todo bien.')
  return out.join(' ')
}

/** Evaluacion completa de una prenda frente a tu perfil y al resto del armario activo. */
export function evaluateGarment(g: Record<string, any>, b: Bundle, opts: { others: Record<string, any>[]; imageCount: number; fitReview?: Record<string, any> | null }) {
  const compat = compatibility(g, b, opts.imageCount)
  const fit = fitScore(opts.fitReview)
  const value = strategicValue(g, opts.others.filter((o) => o.id !== g.id), b)
  return { compat, fit, value, proposal: proposeDecision(compat, fit, value, opts.fitReview), verdict: verdict(g, compat, fit, value) }
}
export type Evaluation = ReturnType<typeof evaluateGarment>
/** Instantanea compacta para guardar con una decision. */
export const snapshot = (e: Evaluation) => ({ compat: e.compat.score, fit: e.fit.score, value: e.value.score, proposal: e.proposal.decision })

