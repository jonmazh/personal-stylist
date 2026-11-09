import { familyOf, type Family } from '@/lib/wardrobe/taxonomy'

/**
 * Comparación de tallas (fase 4C): las medidas de una prenda que te queda bien frente a la guía de medidas de la candidata.
 * No convierte medidas corporales en talla: compara prenda con prenda (mismo criterio de medida, en plano o contorno),
 * con tolerancia según la elasticidad del tejido. Recomienda una talla con nivel de confianza, nunca la garantiza.
 */
export const MEASURES: Record<'bottom' | 'upper', { key: string; label: string; weight: number; circ: boolean }[]> = {
  bottom: [
    { key: 'cintura', label: 'Cintura', weight: 3, circ: true }, { key: 'cadera', label: 'Cadera', weight: 2, circ: true }, { key: 'muslo', label: 'Muslo', weight: 1.5, circ: true },
    { key: 'tiro', label: 'Tiro', weight: 1, circ: false }, { key: 'entrepierna', label: 'Entrepierna', weight: 1, circ: false }, { key: 'bajo', label: 'Bajo', weight: 0.5, circ: true },
  ],
  upper: [
    { key: 'pecho', label: 'Pecho', weight: 3, circ: true }, { key: 'hombros', label: 'Hombros', weight: 2.5, circ: false }, { key: 'largo', label: 'Largo', weight: 1, circ: false },
    { key: 'manga', label: 'Manga', weight: 1, circ: false }, { key: 'cintura', label: 'Cintura', weight: 1, circ: true },
  ],
}
export const measureSet = (subcategory?: string | null, category?: string | null) => {
  const f: Family = familyOf(subcategory, category ?? undefined)
  return f === 'bottom' ? MEASURES.bottom : ['top', 'shirt', 'jacket'].includes(f) ? MEASURES.upper : null
}
export const isStretch = (composition?: string | null) => /elast|spandex|lycra/i.test(composition ?? '')

export interface SizeRow { size: string; measurements: Record<string, number>; availability?: string }
export interface SizeRecommendation {
  size: string | null; confidence: 'alta' | 'media' | 'baja' | null; available: boolean | null
  reference: { id: string; title: string } | null
  table: { size: string; penalty: number; diffs: { key: string; label: string; ref: number; cand: number; diff: number }[] }[]
  notes: string[]; basis: 'medidas' | 'talla habitual' | 'sin datos'
}

/** Elige la talla cuya guía de medidas más se parece a tu prenda de referencia. */
export function recommendSize(opts: {
  subcategory?: string | null; category?: string | null; composition?: string | null; chart: SizeRow[]
  reference?: { id: string; title: string; measurements: Record<string, number> } | null; usualSize?: { size: string; from: string } | null
}): SizeRecommendation {
  const set = measureSet(opts.subcategory, opts.category)
  const empty = (notes: string[], basis: SizeRecommendation['basis'] = 'sin datos'): SizeRecommendation => ({ size: null, confidence: null, available: null, reference: opts.reference ? { id: opts.reference.id, title: opts.reference.title } : null, table: [], notes, basis })
  const chart = opts.chart.filter((r) => Object.keys(r.measurements ?? {}).length)
  if (!set || !opts.reference || !chart.length) {
    if (opts.usualSize) {
      const row = opts.chart.find((r) => r.size.toLowerCase() === opts.usualSize!.size.toLowerCase())
      return { ...empty([`Sin medidas comparables: es la talla que te funciona en ${opts.usualSize.from}. Las tallas cambian entre marcas y patrones: confirma con la guía de la tienda.`], 'talla habitual'), size: opts.usualSize.size, confidence: 'baja', available: row ? row.availability !== 'out_of_stock' : null }
    }
    return empty([!set ? 'Para este tipo de prenda no comparo medidas.' : !opts.reference ? 'Añade las medidas de una prenda parecida que te quede bien para comparar tallas.' : 'La tienda no publica guía de medidas: añádela tú desde su web para comparar.'])
  }
  const stretch = isStretch(opts.composition)
  const ref = opts.reference.measurements
  const table = chart.map((r) => {
    const diffs = set.filter((m) => typeof ref[m.key] === 'number' && typeof r.measurements[m.key] === 'number').map((m) => ({ key: m.key, label: m.label, ref: ref[m.key], cand: r.measurements[m.key], diff: Math.round((r.measurements[m.key] - ref[m.key]) * 10) / 10 }))
    let penalty = 0
    for (const d of diffs) {
      const m = set.find((x) => x.key === d.key)!
      const tol = m.circ && stretch ? 2.5 : 1
      const excess = Math.max(0, Math.abs(d.diff) - tol)
      penalty += m.weight * (excess * (d.diff < 0 && m.circ && !stretch ? 1.5 : 1) + 0.1 * Math.abs(d.diff))   // fuera de tolerancia pesa mucho (más si se queda corta sin elasticidad); dentro, gana la más parecida
    }
    return { size: r.size, penalty: Math.round(penalty * 10) / 10, diffs, availability: r.availability }
  }).filter((t) => t.diffs.length)
  if (!table.length) return empty(['Las medidas de tu referencia y las de la guía no coinciden en ninguna dimensión.'])
  const sorted = [...table].sort((a, z) => a.penalty - z.penalty)
  const best = sorted[0], second = sorted[1]
  const keyDiffs = best.diffs.filter((d) => set.find((m) => m.key === d.key)!.weight >= 2)
  const maxKey = Math.max(0, ...keyDiffs.map((d) => Math.abs(d.diff)))
  const clear = !second || second.penalty - best.penalty >= 2
  const confidence = best.diffs.length >= 3 && keyDiffs.length >= 1 && maxKey <= (stretch ? 2.5 : 1.5) && clear ? 'alta' : best.diffs.length >= 2 && maxKey <= 3 ? 'media' : 'baja'
  const notes: string[] = []
  for (const d of best.diffs) if (Math.abs(d.diff) >= 1) { const circ = set.find((m) => m.key === d.key)!.circ; notes.push(`${d.label}: ${Math.abs(d.diff).toLocaleString('es-ES')} cm ${d.diff > 0 ? (circ ? 'más amplia' : 'más larga') : (circ ? 'más justa' : 'más corta')} que tu referencia.`) }
  if (stretch) notes.push('El tejido tiene elasticidad: admite algo más de diferencia en los contornos.')
  if (second && !clear) notes.push(`La ${second.size} también podría servirte: la diferencia entre ambas es pequeña.`)
  notes.push('Es una estimación comparando prendas, no una garantía: el patrón y cómo te gusta llevarla también cuentan.')
  const row = chart.find((r) => r.size === best.size)
  return { size: best.size, confidence, available: row?.availability ? row.availability !== 'out_of_stock' : null, reference: { id: opts.reference.id, title: opts.reference.title }, table: sorted.map(({ availability: _a, ...t }) => t), notes, basis: 'medidas' }
}
