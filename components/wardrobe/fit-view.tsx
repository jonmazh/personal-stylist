import Link from 'next/link'
import { saveFitReviewAction } from '@/app/(app)/armario/actions'
import { dimensionsFor, fitGuidance, type ReviewDim } from '@/lib/wardrobe/fit'
import type { Score } from '@/lib/wardrobe/compatibility'
import { FitButton } from './fit-button'
import { ScoreCard, fmtScore } from './score'

type Row = Record<string, any>
const fmt = (iso: string) => new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const STATUS: Record<string, string> = { proposed: 'Propuesta de la IA', confirmed: 'Vigente', discarded: 'Descartada', superseded: 'Anterior' }

function DimFields({ g, base, ai }: { g: Row; base?: ReviewDim[]; ai?: boolean }) {
  return (
    <div className="fdims">{dimensionsFor(g).map((def) => {
      const v = base?.find((x) => x.key === def.key)
      return (
        <fieldset key={def.key} className="fd">
          <legend>{def.label}</legend>
          <p className="m small">{def.help}</p>
          {ai && (!def.ai ? <p className="small">Solo lo puedes valorar tú: no se aprecia en una foto.</p>
            : v?.score == null ? <p className="small">La IA no ha podido observarlo.</p>
            : <p className="small">Propuesta de la IA: {v.score}/10{v.confidence != null ? <span className="m"> · confianza {Math.round(v.confidence * 100)} %</span> : null}</p>)}
          <div className="fdr">
            <select name={`s_${def.key}`} defaultValue={v?.score ? String(v.score) : ''} aria-label={`Puntuación de ${def.label}`}>
              <option value="">No lo sé / no se ve</option>
              {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}/10{n >= 9 ? ' · ideal' : n <= 4 ? ' · mal' : ''}</option>)}
            </select>
            <label className="chk"><input type="checkbox" name={`f_${def.key}`} defaultChecked={!!v?.fixable} /> Se puede arreglar</label>
          </div>
          <input name={`n_${def.key}`} defaultValue={v?.note ?? ''} placeholder="Nota (opcional)" maxLength={300} aria-label={`Nota sobre ${def.label}`} />
        </fieldset>
      )
    })}</div>
  )
}

/** Pestaña «Fit Assessment»: el ajuste real solo se valora con la prenda puesta. */
export function FitView({ g, fit, reviews, confirmed, proposed, flags }: { g: Row; fit: Score; reviews: Row[]; confirmed: Row | null; proposed: Row | null; flags: Record<string, string | undefined> }) {
  const worn = g.images.filter((i: Row) => i.role === 'worn')
  const guide = fitGuidance(g)
  return (
    <div className="fitview">
      {flags.assessed && <p className="note" role="status">Propuesta lista. Revísala: no cuenta hasta que la confirmes.</p>}
      {flags.fit && <p className="note" role="status">Evaluación guardada (ajuste {fmtScore(Number(flags.fit))}).</p>}
      {flags.discarded && <p className="note" role="status">Propuesta descartada.</p>}
      <div className="scards one"><ScoreCard title="Ajuste real" s={fit} hint="Sin prueba de ajuste" /></div>
      {fit.note && <p className="m small">{fit.note}</p>}
      {confirmed && (
        <div className="crit">{(confirmed.dimensions as ReviewDim[]).map((d) => (
          <div key={d.key} className={`cr ${d.score === null ? 'pend' : ''}`}>
            <div className="crh"><span>{d.label}{d.fixable ? <span className="m small"> · arreglable</span> : null}</span><b>{d.score === null ? 'No observable' : `${d.score}/10`}</b></div>
            {d.score !== null && <i className="bar"><i style={{ width: `${d.score * 10}%` }} /></i>}
            {d.note && <p className="m small">{d.note}</p>}
          </div>
        ))}
          <p className="m small">{confirmed.source === 'ia' ? 'Propuesta por la IA con tus fotos y confirmada por ti' : 'Autoevaluación'} · {fmt(confirmed.confirmed_at ?? confirmed.created_at)}.{(confirmed.limitations ?? []).length ? ` Limitaciones: ${confirmed.limitations.join(' ')}` : ''}</p>
        </div>
      )}

      {guide.length > 0 && <div className="note"><b>Cómo se evalúa esta prenda</b><ul className="small">{guide.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}

      <h3>Evaluar con fotos</h3>
      {worn.length ? (
        <p className="m small">{worn.length} foto{worn.length === 1 ? '' : 's'} llevándola puesta. Mejor de frente y de lado, de cuerpo entero, con luz natural y postura relajada.</p>
      ) : (
        <p className="note warn">Para que la IA valore el ajuste necesita fotos tuyas llevándola puesta: súbelas en <Link href={`/armario/${g.id}?tab=resumen#fotos`}>Resumen</Link> con la función «Llevándola puesta». Mientras, puedes hacer tu autoevaluación.</p>
      )}
      {worn.length > 0 && !proposed && <FitButton garmentId={g.id} label={confirmed ? 'Evaluar de nuevo con IA' : 'Evaluar ajuste con IA'} />}

      {proposed && (
        <form action={saveFitReviewAction} className="fitform">
          <input type="hidden" name="id" value={g.id} /><input type="hidden" name="proposal_id" value={proposed.id} />
          <h3>Propuesta de la IA · revisa y confirma</h3>
          {!proposed.ai_result?.photo_quality?.suitable && <p className="note warn">Las fotos no permiten valorar el ajuste con fiabilidad{(proposed.photo_issues ?? []).length ? `: ${proposed.photo_issues.join('; ')}` : ''}.</p>}
          {proposed.notes && <p>{proposed.notes}</p>}
          {(proposed.limitations ?? []).length > 0 && <p className="m small">Limitaciones: {proposed.limitations.join(' ')}</p>}
          <DimFields g={g} base={proposed.dimensions} ai />
          <label>Notas<textarea name="notes" rows={2} defaultValue="" /></label>
          <div className="btns"><button className="btn primary">Confirmar evaluación</button><button className="btn quiet" name="discard" value="1">Descartar propuesta</button></div>
        </form>
      )}

      {!proposed && (
        <details className="howto" open={!confirmed && !worn.length}><summary>{confirmed ? 'Actualizar con tu autoevaluación' : 'Autoevaluación (sin IA)'}</summary>
          <form action={saveFitReviewAction} className="fitform">
            <input type="hidden" name="id" value={g.id} />
            <p className="m small">Pruébatela delante de un espejo y puntúa lo que puedas juzgar; deja «No lo sé» en lo demás.</p>
            <DimFields g={g} base={confirmed?.dimensions} />
            <label>Notas<textarea name="notes" rows={2} defaultValue={confirmed?.notes ?? ''} /></label>
            <div className="btns"><button className="btn primary">Guardar evaluación</button></div>
          </form>
        </details>
      )}

      {reviews.length > 0 && (<>
        <h3>Historial de evaluaciones</h3>
        <ul className="events">{reviews.map((r) => (
          <li key={r.id}><b>{STATUS[r.status] ?? r.status}</b> <span className="m small">· {fmt(r.created_at)} · {r.source === 'ia' ? `IA (${r.model_id ?? '—'}, ${r.prompt_version ?? '—'})` : 'autoevaluación'}{r.overall != null ? ` · ${fmtScore(Number(r.overall))}` : ''}{r.provisional ? ' · provisional' : ''}{r.usage?.prompt ? ` · ${r.usage.prompt + r.usage.completion} tokens` : ''}</span></li>
        ))}</ul>
      </>)}
    </div>
  )
}
