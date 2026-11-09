import { feedbackAction } from '@/app/(app)/outfits/learn-actions'
import { FLAGS, RATINGS, REASONS } from '@/lib/outfits/feedback'

/** Valoración de un conjunto o de una propuesta: algo más que estrellas, y con el porqué cuando no convence. */
export function FeedbackForm({ outfitId, resultId, garments, back, compact }: { outfitId?: string; resultId?: string; garments: { id: string; title: string }[]; back: string; compact?: boolean }) {
  const body = (
    <form action={feedbackAction} className="fbform">
      {outfitId && <input type="hidden" name="outfit_id" value={outfitId} />}{resultId && <input type="hidden" name="result_id" value={resultId} />}<input type="hidden" name="back" value={back} />
      <div className="opts">{RATINGS.map((r) => <label key={r.id}><input type="radio" name="rating" value={r.id} />{r.label}</label>)}</div>
      <div className="opts">{FLAGS.map((f) => <label key={f.id}><input type="checkbox" name="flags" value={f.id} />{f.label}</label>)}</div>
      <details className="howto"><summary>Si no te convence, ¿por qué?</summary>
        <div className="opts">{REASONS.map((r) => <label key={r.id}><input type="checkbox" name="reasons" value={r.id} />{r.label}</label>)}</div>
        <label>¿Qué prenda no te gusta?<select name="garment_id" defaultValue=""><option value="">—</option>{garments.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}</select></label>
      </details>
      {!compact && <label>Nota (opcional)<input name="note" maxLength={500} placeholder="Perfecto para la cena; los zapatos rozaban un poco" /></label>}
      <div className="btns"><button className="btn small">Guardar valoración</button></div>
      <p className="m small">Una sola valoración no cambia tus preferencias: el estilista aprende cuando ve un patrón, y tú lo confirmas.</p>
    </form>
  )
  return compact ? <details className="howto fbbox"><summary>Valorar esta propuesta</summary>{body}</details> : body
}
