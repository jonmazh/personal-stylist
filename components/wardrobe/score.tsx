import type { Score } from '@/lib/wardrobe/compatibility'

export const fmtScore = (n: number | null | undefined) => (n === null || n === undefined ? null : n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 }))
const CONF: Record<string, string> = { alta: 'confianza alta', media: 'confianza media', baja: 'hipótesis' }

/** Tarjeta de una de las tres valoraciones. Lo que no se puede calcular es «Pendiente», nunca cero. */
export function ScoreCard({ title, s, hint }: { title: string; s: Score; hint: string }) {
  const v = fmtScore(s.score)
  return (
    <div className={`scard ${v ? '' : 'pend'}`}>
      <span className="st">{title}</span>
      <b>{v ?? 'Pendiente'}</b>
      <span className="m small">{v ? [s.provisional ? 'Provisional' : 'Firme', s.confidence ? CONF[s.confidence] : null].filter(Boolean).join(' · ') : hint}</span>
    </div>
  )
}
