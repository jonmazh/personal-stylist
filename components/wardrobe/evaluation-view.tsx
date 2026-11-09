import Link from 'next/link'
import { decideAction } from '@/app/(app)/armario/actions'
import { DECISIONS, decisionLabel, type Criterion, type Evaluation } from '@/lib/wardrobe/compatibility'
import { garmentTitle } from '@/lib/wardrobe/display'
import { ScoreCard, fmtScore } from './score'

type Row = Record<string, any>
const fmt = (iso: string) => new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const CONF: Record<string, string> = { alta: 'Confianza alta', media: 'Confianza media', baja: 'Hipótesis' }

function Criteria({ items, weighted }: { items: Criterion[]; weighted?: boolean }) {
  return (
    <div className="crit">{items.map((c) => (
      <div key={c.id} className={`cr ${c.score === null ? 'pend' : ''}`}>
        <div className="crh"><span>{c.label}{weighted ? <span className="m small"> · peso {c.weight} %</span> : null}</span><b>{fmtScore(c.score) ?? 'Pendiente'}</b></div>
        {c.score !== null && <i className="bar"><i style={{ width: `${c.score * 10}%` }} /></i>}
        {c.why.length > 0 && <ul>{c.why.map((w, i) => <li key={i}>{w}</li>)}</ul>}
        <p className="m small">
          {c.data_used.length > 0 && <>Datos usados: {c.data_used.join('; ')}. </>}
          {c.missing.length > 0 && <>Falta: {c.missing.join('; ')}. </>}
          {c.confidence && c.score !== null && <>{CONF[c.confidence]}.</>}
        </p>
      </div>
    ))}</div>
  )
}

/** Pestaña «Compatibilidad»: tres valoraciones separadas, veredicto, decisión y su justificación. */
export function EvaluationView({ g, ev, decisions, flags }: { g: Row; ev: Evaluation; decisions: Row[]; flags: Record<string, string | undefined> }) {
  const current = g.decision as string | null
  const def = current ?? ev.proposal.decision
  return (
    <div className="evaluation">
      {flags.decided && <p className="note" role="status">Decisión guardada: {decisionLabel(current)}. Queda en el historial con las puntuaciones de este momento.</p>}
      <div className="scards">
        <ScoreCard title="Compatibilidad" s={ev.compat} hint="Faltan datos" />
        <ScoreCard title="Ajuste real" s={ev.fit} hint="Sin prueba de ajuste" />
        <ScoreCard title="Valor estratégico" s={ev.value} hint="Faltan prendas" />
      </div>
      <p className="m small">Son tres valoraciones distintas: una prenda puede encajar contigo y aun así combinar mal con tu armario. La compatibilidad nunca incluye el ajuste real: eso solo lo dice una prueba con la prenda puesta.</p>

      <section className="verdict">
        <h3>Veredicto del estilista</h3>
        <p>{ev.verdict}</p>
        <p><b>Propuesta: {decisionLabel(ev.proposal.decision)}.</b> {ev.proposal.why}</p>
      </section>

      <form action={decideAction} className="decide">
        <input type="hidden" name="id" value={g.id} />
        <h3>Tu decisión</h3>
        {current && <p className="m small">Decisión actual: <b>{decisionLabel(current)}</b>{g.decision_at ? ` (${fmt(g.decision_at)})` : ''}.</p>}
        <div className="opts">{DECISIONS.map((d) => (
          <label key={d.id} title={d.help}><input type="radio" name="decision" value={d.id} defaultChecked={def === d.id} />{d.label}{d.id === ev.proposal.decision ? ' · propuesta' : ''}</label>
        ))}</div>
        <ul className="m small dhelp">{DECISIONS.map((d) => <li key={d.id}><b>{d.label}:</b> {d.help}</li>)}</ul>
        <label>Motivo (opcional)<input name="reason" maxLength={500} placeholder="Me la pongo mucho para trabajar" /></label>
        <label>Arreglo previsto (si eliges modificar)<input name="alteration" maxLength={300} placeholder="Acortar el bajo 2 cm" /></label>
        <div className="btns"><button className="btn primary">Guardar decisión</button></div>
        <p className="m small">Ninguna decisión archiva ni elimina la prenda: si decides donarla o venderla, archívala tú cuando salga de tu armario.</p>
      </form>

      <h3>Compatibilidad personal {ev.compat.score !== null && <span className="m small">· {fmtScore(ev.compat.score)}</span>}</h3>
      {ev.compat.note && <p className="note">{ev.compat.note}</p>}
      <Criteria items={ev.compat.criteria} weighted />
      <p className="m small">Se calcula con tu perfil actual (identidad estética, estudio cromático, preferencias de corte, medidas y estilo de vida): si cambias tu perfil, se recalcula. Los datos que la IA propuso y no has confirmado cuentan como hipótesis.</p>

      <h3>Valor estratégico {ev.value.score !== null && <span className="m small">· {fmtScore(ev.value.score)}</span>}</h3>
      {ev.value.note && <p className="note">{ev.value.note}</p>}
      {ev.value.criteria.length > 0 && <Criteria items={ev.value.criteria} weighted />}
      {ev.value.combos.length > 0 && (
        <details className="howto"><summary>Prendas con las que combina ({ev.value.combos.length})</summary>
          <ul className="m small">{ev.value.combos.map((o) => <li key={o.id}><Link href={`/armario/${o.id}`}>{garmentTitle(o)}</Link></li>)}</ul>
        </details>
      )}

      {decisions.length > 0 && (<>
        <h3>Historial de decisiones</h3>
        <ul className="events">{decisions.map((d) => (
          <li key={d.id}><b>{decisionLabel(d.decision)}</b> <span className="m small">· {fmt(d.created_at)}{d.proposed ? ` · propuesta: ${decisionLabel(d.proposed)}` : ''}{d.scores ? ` · compatibilidad ${fmtScore(d.scores.compat) ?? 'pendiente'}, ajuste ${fmtScore(d.scores.fit) ?? 'pendiente'}, valor ${fmtScore(d.scores.value) ?? 'pendiente'}` : ''}</span>
            {(d.reason || d.alteration) && <div className="m small">{[d.reason, d.alteration ? `Arreglo: ${d.alteration}` : null].filter(Boolean).join(' · ')}</div>}</li>
        ))}</ul>
      </>)}
    </div>
  )
}
