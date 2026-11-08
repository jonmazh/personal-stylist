import { BRAND_UNIVERSES, ELEMENT_IDS, STYLE_CATALOG, elementLabel, styleById, styleIdFromName, type ElementId } from './catalog'
import { RATINGS, normRating, outfitById, type Fit } from './references'

/**
 * Style DNA hibrido (BIS 1). Mantiene SIEMPRE separados:
 *  1. Lo DECLARADO por el usuario: su identidad (influencias con rol y peso), elementos que quiere o rechaza, marcas.
 *  2. Lo INFERIDO de sus valoraciones y de sus referencias analizadas por la IA (patrones con umbral de evidencia).
 *  3. Las RECOMENDACIONES del estilista: las calcula el motor de diagnostico a partir de 1 y 2 (lib/profile/blueprint.ts).
 * Unico punto de acceso para armario, Outfit Studio, compras, wishlist y evolucion: styleProfileOf() y styleFit().
 */
export type Role = 'principal' | 'secundario' | 'influencia'
export interface Influence { style: string; role: Role; weight: number }
export interface Pattern { element: ElementId; label: string; kind: 'prefiere' | 'evita'; evidence: number; score: number }

export const MIN_RATED = 4        // valoraciones minimas para proponer una identidad
export const MIN_EVIDENCE = 2     // un patron necesita al menos 2 conjuntos distintos: una sola valoracion no es una preferencia
const PATTERN_SCORE = 2.5
const W = Object.fromEntries(RATINGS.map((r) => [r.id, r.weight])) as Record<string, number>

export interface Signal { style?: string; fit?: Fit; structure?: string; formality?: number; colors: string[]; elements: string[]; rating: string; likedElements: string[]; own: boolean }

/** Convierte valoraciones del catalogo y referencias propias analizadas en señales homogeneas. */
export function signalsFrom(ratings: { reference_id: string; rating: string; liked_elements?: string[] | null }[], own: { rating?: string | null; ai_tags?: any }[]): Signal[] {
  const out: Signal[] = []
  for (const r of ratings) {
    const o = outfitById(r.reference_id), rating = normRating(r.rating)
    if (o && W[rating] !== undefined) out.push({ style: o.style, fit: o.fit, structure: o.structure, formality: o.formality, colors: o.colors, elements: o.elements, rating, likedElements: (r.liked_elements ?? []).filter((e) => o.elements.includes(e as ElementId)), own: false })
  }
  for (const ref of own) {
    const t = ref.ai_tags
    if (!t) continue
    out.push({ style: t.style ? styleIdFromName(t.style) ?? t.style : undefined, fit: t.fit, structure: t.structure, formality: t.formality, colors: t.colors ?? [], elements: (t.elements ?? []).filter((e: string) => ELEMENT_IDS.includes(e)), rating: normRating(ref.rating ?? 'like'), likedElements: [], own: true })
  }
  return out
}

const ranked = (m: Map<string, number>, pred: (v: number) => boolean) =>
  [...m.entries()].filter(([, v]) => pred(v)).sort((a, z) => z[1] - a[1] || a[0].localeCompare(z[0])).map(([k]) => k)
const round5 = (x: number) => Math.round(x / 5) * 5

/** Reparte 100 entre pesos positivos, en multiplos de 5 (orientativo). */
export function toPercents(scores: [string, number][], max = 4): { style: string; weight: number }[] {
  const top = scores.filter(([, v]) => v > 0).sort((a, z) => z[1] - a[1]).slice(0, max)
  const total = top.reduce((a, [, v]) => a + v, 0)
  if (!total) return []
  const out = top.map(([style, v]) => ({ style, weight: Math.max(5, round5((v / total) * 100)) }))
  const diff = 100 - out.reduce((a, x) => a + x.weight, 0)
  out[0].weight += diff
  return out.filter((x) => x.weight > 0)
}

export interface Inferred {
  rated: number; own: number; enough: boolean
  proposal: { style: string; weight: number }[]       // identidad hibrida propuesta (estilo → %)
  rejectedStyles: string[]; admiredStyles: string[]
  patterns: Pattern[]
  fit?: Fit; structure?: string; formality?: number; colors: string[]
}

export function infer(signals: Signal[], brands: string[] = []): Inferred {
  const style = new Map<string, number>(), fit = new Map<string, number>(), struct = new Map<string, number>(), colors = new Map<string, number>()
  const elScore = new Map<string, number>(), elPos = new Map<string, number>(), elNeg = new Map<string, number>()
  const admired = new Set<string>()
  let fSum = 0, fW = 0
  const bump = (m: Map<string, number>, k: string | undefined, v: number) => { if (k) m.set(k, (m.get(k) ?? 0) + v) }
  for (const s of signals) {
    const w = W[s.rating] ?? 0
    bump(style, s.style, w)
    if (s.rating === 'admire' && s.style) admired.add(s.style)
    if (w > 0) {
      bump(fit, s.fit, w); bump(struct, s.structure, w)
      for (const c of s.colors) bump(colors, c, w)
      if (s.formality) { fSum += s.formality * w; fW += w }
      for (const e of s.elements) { bump(elScore, e, w); bump(elPos, e, 1) }
    } else if (w < 0) for (const e of s.elements) { bump(elScore, e, w); bump(elNeg, e, 1) }
    // «Me gusta algun elemento»: cuenta solo lo que el usuario señalo, no el conjunto
    for (const e of s.likedElements) { bump(elScore, e, 1.5); bump(elPos, e, 1) }
  }
  // Las marcas orientan (no son estilos): suman a la propuesta, pero nunca crean un patron por si solas.
  for (const id of brands) {
    const br = BRAND_UNIVERSES.find((x) => x.id === id)
    if (br) for (const [st, v] of Object.entries(br.styles)) bump(style, st, 1.5 * v)
  }
  const patterns: Pattern[] = []
  for (const [e, sc] of elScore) {
    const pos = elPos.get(e) ?? 0, neg = elNeg.get(e) ?? 0
    if (pos >= MIN_EVIDENCE && sc >= PATTERN_SCORE) patterns.push({ element: e as ElementId, label: elementLabel(e), kind: 'prefiere', evidence: pos, score: Math.round(sc * 10) / 10 })
    else if (neg >= MIN_EVIDENCE && sc <= -PATTERN_SCORE) patterns.push({ element: e as ElementId, label: elementLabel(e), kind: 'evita', evidence: neg, score: Math.round(sc * 10) / 10 })
  }
  patterns.sort((a, z) => Math.abs(z.score) - Math.abs(a.score) || a.element.localeCompare(z.element))
  const enough = signals.length >= MIN_RATED
  return {
    rated: signals.length, own: signals.filter((s) => s.own).length, enough,
    proposal: enough ? toPercents([...style.entries()]) : [],
    rejectedStyles: ranked(style, (v) => v < 0),
    admiredStyles: [...admired].filter((s) => (style.get(s) ?? 0) <= 1),
    patterns,
    fit: ranked(fit, (v) => v > 0)[0] as Fit | undefined,
    structure: ranked(struct, (v) => v > 0)[0],
    formality: fW ? Math.round((fSum / fW) * 10) / 10 : undefined,
    colors: ranked(colors, (v) => v > 0).slice(0, 5),
  }
}

// ── Identidad declarada ──
export interface Declared { influences: Influence[]; liked: string[]; rejected: string[]; brands: string[]; version: number; updatedAt?: string }

export function declaredOf(style: any): Declared {
  const raw: any[] = Array.isArray(style?.influences) ? style.influences : []
  return {
    influences: raw.filter((i) => styleById(i?.style) && ['principal', 'secundario', 'influencia'].includes(i?.role))
      .map((i) => ({ style: i.style, role: i.role as Role, weight: Math.max(0, Math.min(100, Math.round(Number(i.weight) || 0))) })),
    liked: (style?.liked_elements ?? []).filter((e: string) => ELEMENT_IDS.includes(e)),
    rejected: (style?.rejected_elements ?? []).filter((e: string) => ELEMENT_IDS.includes(e)),
    brands: (style?.brand_refs ?? []).filter((id: string) => BRAND_UNIVERSES.some((b) => b.id === id)),
    version: Number(style?.identity_version) || 0,
    updatedAt: style?.identity_updated_at ?? undefined,
  }
}

/** Ordena por rol y peso; si no hay principal declarado, el de mas peso hace de principal. */
export function normalizeInfluences(xs: Influence[]): Influence[] {
  const order: Record<Role, number> = { principal: 0, secundario: 1, influencia: 2 }
  return [...xs].sort((a, z) => order[a.role] - order[z.role] || z.weight - a.weight)
}

// ── Perfil unico que consumen todos los modulos ──
export interface StyleProfile {
  declared: Declared
  inferred: Inferred
  /** Identidad vigente: la declarada si existe; si no, la propuesta inferida (marcada como tal). */
  identity: { source: 'declarada' | 'propuesta' | 'ninguna'; principal?: string; secondaries: string[]; influences: Influence[] }
  /** Elementos preferidos y rechazados: declarados primero; los inferidos solo si no contradicen lo declarado. */
  elements: { liked: { element: string; source: 'declarado' | 'inferido' }[]; rejected: { element: string; source: 'declarado' | 'inferido' }[] }
}

export function styleProfile(declared: Declared, inferred: Inferred): StyleProfile {
  let influences: Influence[]
  let source: StyleProfile['identity']['source']
  if (declared.influences.length) { influences = normalizeInfluences(declared.influences); source = 'declarada' }
  else if (inferred.proposal.length) {
    influences = inferred.proposal.map((p, i) => ({ style: p.style, role: (i === 0 ? 'principal' : p.weight >= 20 ? 'secundario' : 'influencia') as Role, weight: p.weight }))
    source = 'propuesta'
  } else { influences = []; source = 'ninguna' }
  const principal = influences.find((i) => i.role === 'principal')?.style ?? influences[0]?.style
  type Src = { element: string; source: 'declarado' | 'inferido' }
  const liked: Src[] = declared.liked.map((e) => ({ element: e, source: 'declarado' }))
  const rejected: Src[] = declared.rejected.map((e) => ({ element: e, source: 'declarado' }))
  for (const p of inferred.patterns) {
    if (p.kind === 'prefiere' && !declared.liked.includes(p.element) && !declared.rejected.includes(p.element)) liked.push({ element: p.element, source: 'inferido' })
    if (p.kind === 'evita' && !declared.rejected.includes(p.element) && !declared.liked.includes(p.element)) rejected.push({ element: p.element, source: 'inferido' })
  }
  return {
    declared, inferred,
    identity: { source, principal, secondaries: influences.filter((i) => i.role === 'secundario').map((i) => i.style), influences },
    elements: { liked, rejected },
  }
}

/** Perfil de estilo del bundle del usuario. */
export const styleProfileOf = (b: { style?: any; refRatings?: any[]; styleRefs?: any[] }) => {
  const declared = declaredOf(b.style)
  return styleProfile(declared, infer(signalsFrom(b.refRatings ?? [], b.styleRefs ?? []), declared.brands))
}

/**
 * Encaje de una prenda, conjunto o producto con la identidad hibrida (armario, Outfit Studio, compras, wishlist).
 * No es una restriccion: combina influencias secundarias y explica por que.
 */
export function styleFit(p: StyleProfile, item: { style?: string; elements: string[] }) {
  const reasons: string[] = []
  let score = 50
  const inf = p.identity.influences.find((i) => i.style === item.style)
  const related = !inf && item.style ? p.identity.influences.find((i) => styleById(i.style)?.related.includes(item.style!)) : undefined
  if (inf) { score += Math.min(30, 10 + inf.weight / 2); reasons.push(`Representa tu influencia ${styleById(inf.style)?.name} (${inf.weight} %)`) }
  else if (related) { score += 10; reasons.push(`Cercano a ${styleById(related.style)?.name}`) }
  for (const { element, source } of p.elements.liked) if (item.elements.includes(element)) { score += source === 'declarado' ? 8 : 5; reasons.push(`Tiene algo que te gusta: ${elementLabel(element).toLowerCase()}`) }
  for (const { element, source } of p.elements.rejected) if (item.elements.includes(element)) { score -= source === 'declarado' ? 20 : 10; reasons.push(`Tiene algo que rechazas: ${elementLabel(element).toLowerCase()}`) }
  if (p.inferred.rejectedStyles.includes(item.style ?? '')) { score -= 15; reasons.push(`Es de un estilo que has descartado (${styleById(item.style!)?.name})`) }
  return { score: Math.max(0, Math.min(100, Math.round(score))), match: inf?.style ?? related?.style, reasons }
}

/** Instantanea para versionar con el Blueprint (evolucion personal). */
export const snapshotOf = (p: StyleProfile) => ({
  source: p.identity.source, influences: p.identity.influences, liked: p.elements.liked, rejected: p.elements.rejected,
  patterns: p.inferred.patterns.map((x) => ({ element: x.element, kind: x.kind, evidence: x.evidence })), rated: p.inferred.rated, version: p.declared.version,
})

/** Cambios de peso entre dos instantaneas (para «Evolucion personal»). */
export function evolution(prev: { influences?: Influence[] } | undefined, now: { influences: Influence[] }) {
  if (!prev?.influences) return []
  const before = new Map(prev.influences.map((i) => [i.style, i.weight]))
  const after = new Map(now.influences.map((i) => [i.style, i.weight]))
  const out: { style: string; from: number; to: number }[] = []
  for (const s of new Set([...before.keys(), ...after.keys()])) {
    const a = before.get(s) ?? 0, z = after.get(s) ?? 0
    if (Math.abs(z - a) >= 10) out.push({ style: s, from: a, to: z })
  }
  return out.sort((x, y) => Math.abs(y.to - y.from) - Math.abs(x.to - x.from))
}

export const ALL_STYLE_IDS = STYLE_CATALOG.map((s) => s.id)
