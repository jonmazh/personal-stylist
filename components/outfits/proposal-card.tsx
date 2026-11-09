import Link from 'next/link'
import { proposalAction } from '@/app/(app)/outfits/actions'
import { INTENTS } from '@/lib/outfits/engine/context'
import { roleLabel } from '@/lib/outfits/taxonomy'
import { FeedbackForm } from './feedback-form'

type Row = Record<string, any>
const CONF: Record<string, string> = { alta: 'Alta', media: 'Media', baja: 'Baja' }

/** Ficha de una propuesta del motor (4.3): prendas reales, puntuación auditable, por qué funciona, alternativas. */
export function ProposalCard({ r, context, label, back, current = true }: { r: Row; context: string; label?: string; back?: string; current?: boolean }) {
  const intent = INTENTS.find((i) => i.id === r.intent)
  const criteria = (r.breakdown?.criteria ?? []) as Row[]
  return (
    <article className={`prop-card st-${r.status}`} id={`r-${r.id}`}>
      <div className="pc-head">
        <div>
          <span className="st">{label ? `${label} · ` : ''}{intent?.label}{r.origin === 'stylist_edit' ? ' · versión modificada' : ''}</span>
          <h3>{r.stylist?.name ?? r.name}</h3>
          <span className="m small">{context}</span>
        </div>
        <div className="pc-score"><b>{Math.round(Number(r.score))}</b><span>Compatibilidad / 100</span><span>Confianza {CONF[r.confidence]?.toLowerCase()}</span></div>
      </div>
      <ol className="oitems view pc-items">{(r.items as Row[]).map((i) => (
        <li key={i.garment_id} className={i.state !== 'active' ? 'missing' : ''}>
          <span className="oth">{i.thumb_url ? <img src={i.thumb_url} alt={i.title} /> : <span className="m small">Sin foto</span>}</span>
          <div className="oinfo"><span className="st">{roleLabel(i.role)}</span><Link href={`/armario/${i.garment_id}`}><b>{i.title}</b></Link>{i.state !== 'active' && <span className="state warn">Ya no está activa en tu armario</span>}</div>
        </li>
      ))}</ol>
      {r.stylist?.why && r.origin !== 'stylist_edit' && (<><h4>El estilista</h4><p>{r.stylist.why}</p>{r.stylist.when && <p className="m small">Cuándo: {r.stylist.when}</p>}{r.stylist.limitations && <p className="m small">Límites: {r.stylist.limitations}</p>}</>)}
      {(r.why as string[]).length > 0 && (<><h4>{r.stylist?.why && r.origin !== 'stylist_edit' ? 'Según el motor' : 'Por qué funciona'}</h4><ul>{(r.why as string[]).map((w, k) => <li key={k}>{w}</li>)}</ul></>)}
      {(r.cons as string[]).length > 0 && (<><h4>Matices</h4><ul className="m">{(r.cons as string[]).map((w, k) => <li key={k}>{w}</li>)}</ul></>)}
      {(r.warnings as string[]).length > 0 && <ul className="oprob">{(r.warnings as string[]).map((w, k) => <li key={k}>{w}</li>)}</ul>}
      {(r.alternatives as Row[]).length > 0 && (<><h4>Alternativas</h4><ul>{(r.alternatives as Row[]).map((a, k) => <li key={k}>Sustituir {a.from} por <Link href={`/armario/${a.garment_id}`}>{a.to}</Link> <span className="m small">({roleLabel(a.role).toLowerCase()}, {a.delta >= 0 ? `+${a.delta}` : a.delta} puntos)</span></li>)}</ul></>)}
      <details className="howto"><summary>Cómo se ha puntuado</summary>
        <table className="usage pc-table"><thead><tr><th>Criterio</th><th>Peso</th><th>Puntos</th></tr></thead>
          <tbody>{criteria.map((c) => (
            <tr key={c.key}><td><b>{c.label}</b><ul className="m small">{(c.reasons as string[]).map((x, k) => <li key={k}>{x}</li>)}</ul><span className="m small">Datos: {(c.data_used as string[]).join('; ')}</span></td><td>{c.weight}</td><td>{c.points}</td></tr>
          ))}</tbody></table>
        {(r.breakdown?.confidenceWhy ?? []).length > 0 && <p className="m small">Confianza {CONF[r.confidence]?.toLowerCase()}: {r.breakdown.confidenceWhy.join(' ')}</p>}
        <p className="m small">La puntuación ordena alternativas y explica el criterio; no mide científicamente lo bien vestido que vas.</p>
      </details>
      {!current ? <p className="state m">Versión anterior</p> : r.status === 'proposed' ? (
        <form action={proposalAction} className="btns">
          <input type="hidden" name="result_id" value={r.id} /><input type="hidden" name="generation_id" value={r.generation_id} />{back && <input type="hidden" name="back" value={back} />}
          <button className="btn primary" name="action" value="save">Guardar como conjunto</button>
          <button className="btn quiet" name="action" value="dismiss">Descartar</button>
        </form>
      ) : null}
      {current && <FeedbackForm resultId={r.id} garments={(r.items as Row[]).map((i) => ({ id: i.garment_id, title: i.title }))} back={back ?? `/outfits/generar?g=${r.generation_id}`} compact />}
      {!current || r.status === 'proposed' ? null : r.status === 'saved' && r.saved_outfit_id ? <p className="state ok">Guardado · <Link href={`/outfits/${r.saved_outfit_id}`}>ver conjunto</Link></p> : <p className="state m">Descartada</p>}
    </article>
  )
}
