import { RATINGS, outfitById, type Fit } from './references'

/**
 * Style DNA: agrega tus valoraciones de conjuntos (catalogo) y de tus referencias propias (etiquetadas por la IA).
 * Pesos: Me encanta +2 · Me gusta +1 · Me gustaria conseguir algo parecido +1,5 · Me gusta, pero no para mi 0 · No me lo pondria −1,5.
 * Una referencia propia sin valorar cuenta como «Me gusta»: si la guardaste, es una señal de gusto.
 */
export interface Signal { style?: string; fit?: Fit; structure?: string; formality?: number; colors: string[]; rating: string; own: boolean }

export interface StyleDNA {
  rated: number
  own: number
  topStyles: string[]
  avoidStyles: string[]
  aspire: string[]
  admire: string[]
  fit?: Fit
  structure?: string
  formality?: number
  colors: string[]
}

export const MIN_RATED = 4
const W = Object.fromEntries(RATINGS.map((r) => [r.id, r.weight])) as Record<string, number>

export function signalsFrom(ratings: { reference_id: string; rating: string }[], own: { rating?: string | null; ai_tags?: any }[]): Signal[] {
  const out: Signal[] = []
  for (const r of ratings) {
    const o = outfitById(r.reference_id)
    if (o && W[r.rating] !== undefined) out.push({ style: o.style, fit: o.fit, structure: o.structure, formality: o.formality, colors: o.colors, rating: r.rating, own: false })
  }
  for (const ref of own) {
    const t = ref.ai_tags
    if (!t) continue
    out.push({ style: t.style, fit: t.fit, structure: t.structure, formality: t.formality, colors: t.colors ?? [], rating: ref.rating ?? 'like', own: true })
  }
  return out
}

const ranked = (m: Map<string, number>, pred: (v: number) => boolean) =>
  [...m.entries()].filter(([, v]) => pred(v)).sort((a, z) => z[1] - a[1] || a[0].localeCompare(z[0])).map(([k]) => k)

export function styleDNA(signals: Signal[]): StyleDNA {
  const style = new Map<string, number>(), fit = new Map<string, number>(), struct = new Map<string, number>(), colors = new Map<string, number>()
  const aspire = new Set<string>(), admire = new Set<string>()
  let fSum = 0, fW = 0
  const bump = (m: Map<string, number>, k: string | undefined, v: number) => { if (k) m.set(k, (m.get(k) ?? 0) + v) }
  for (const s of signals) {
    const w = W[s.rating] ?? 0
    bump(style, s.style, w)
    if (s.rating === 'aspire' && s.style) aspire.add(s.style)
    if (s.rating === 'admire' && s.style) admire.add(s.style)
    if (w > 0) {
      bump(fit, s.fit, w); bump(struct, s.structure, w)
      for (const c of s.colors) bump(colors, c, w)
      if (s.formality) { fSum += s.formality * w; fW += w }
    }
  }
  const top = ranked(style, (v) => v > 0)
  return {
    rated: signals.length,
    own: signals.filter((s) => s.own).length,
    topStyles: top.slice(0, 3),
    avoidStyles: ranked(style, (v) => v < 0),
    aspire: [...aspire].filter((s) => !top.slice(0, 1).includes(s)),
    admire: [...admire],
    fit: ranked(fit, (v) => v > 0)[0] as Fit | undefined,
    structure: ranked(struct, (v) => v > 0)[0],
    formality: fW ? Math.round((fSum / fW) * 10) / 10 : undefined,
    colors: ranked(colors, (v) => v > 0).slice(0, 5),
  }
}

/** Style DNA del bundle (valoraciones del catalogo + referencias propias analizadas). */
export const dnaOf = (b: { refRatings?: any[]; styleRefs?: any[] }) => styleDNA(signalsFrom(b.refRatings ?? [], b.styleRefs ?? []))
