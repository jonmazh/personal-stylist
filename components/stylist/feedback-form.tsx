import { FEEDBACK_REASONS, REASONS_FOR, TARGET_KINDS, reasonLabel } from '@/lib/stylist/feedback'
import { feedbackAction } from '@/app/(app)/compras/estilista/actions'

type Kind = (typeof TARGET_KINDS)[number]
/** Valoración de un producto, una oportunidad o una tendencia: solo los motivos que tienen sentido para cada uno. */
export function FeedbackForm({ kind, target, context = {}, current, back }: { kind: Kind; target: string; context?: Record<string, string | null | undefined>; current?: string | null; back?: string }) {
  return (
    <form action={feedbackAction} className="btns fbform">
      <input type="hidden" name="target_kind" value={kind} /><input type="hidden" name="target_ref" value={target} />
      {back && <input type="hidden" name="back" value={back} />}
      {Object.entries(context).filter(([, v]) => v).map(([k, v]) => <input key={k} type="hidden" name={`ctx_${k}`} value={String(v)} />)}
      <label className="small">Tu valoración
        <select name="reason" defaultValue={current ?? ''} aria-label={`Valorar ${kind}`} required>
          <option value="" disabled>Elige…</option>
          {FEEDBACK_REASONS.filter((r) => REASONS_FOR[kind].includes(r.id)).map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      </label>
      <button className="btn small">Guardar</button>
      {current && <span className="m small">Ahora: {reasonLabel(current).toLowerCase()}</span>}
    </form>
  )
}
