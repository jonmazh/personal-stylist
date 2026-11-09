import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { getEvaluation } from '@/lib/outfits/evaluator-service'
import { roleLabel } from '@/lib/outfits/taxonomy'
import { WardrobeError } from '@/lib/wardrobe/service'
import { deleteEvaluationPhotoAction } from '../../learn-actions'

type Row = Record<string, any>
const fmt = (iso: string) => new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const MATCH: Record<string, string> = { si: 'Sí, corresponde al conjunto previsto', parcial: 'En parte', no: 'No corresponde', desconocido: 'Sin conjunto previsto' }

export default async function EvaluationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params
  const sp = await searchParams
  const user = (await getUser())!
  let e: Awaited<ReturnType<typeof getEvaluation>>
  try { e = await getEvaluation(user.supabase, id) } catch (x) { if (x instanceof WardrobeError && x.status === 404) notFound(); throw x }
  const ai = (e.ai ?? {}) as Row
  return (
    <main className="wide">
      <p className="eyebrow"><Link href="/outfits">Outfit Studio</Link> · {e.mode === 'visual' ? 'Evaluación visual' : 'Evaluación teórica'}</p>
      <h1 className="display">{e.mode === 'visual' ? 'Cómo te queda el conjunto' : 'Qué opino de este conjunto'}</h1>
      <p className="m small">{fmt(e.created_at)}{e.outfit_id ? <> · <Link href={`/outfits/${e.outfit_id}`}>ver el conjunto</Link></> : ''}{e.model ? ` · ${e.model} · ${e.prompt_version}` : ''}</p>
      {sp.photo_deleted && <p className="note" role="status">Foto borrada. La evaluación se conserva.</p>}
      {e.score != null && <div className="scards one"><div className="scard"><span className="st">{e.mode === 'visual' ? 'Valoración visual' : 'Compatibilidad'}</span><b>{Math.round(Number(e.score))}</b><span className="m small">/ 100 · orientativa{ai.provisional ? ' · provisional' : ''}</span></div></div>}
      {(e.items as Row[]).length > 0 && <ul className="m small">{(e.items as Row[]).map((i) => <li key={i.garment_id}>{roleLabel(i.role)}: {i.title}</li>)}</ul>}

      {e.mode === 'theoretical' && (<>
        {ai.verdict && <section className="verdict"><h3>El estilista</h3><p>{ai.verdict}</p>
          {(ai.strengths ?? []).length > 0 && <><h4>A favor</h4><ul>{ai.strengths.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></>}
          {(ai.risks ?? []).length > 0 && <><h4>Riesgos</h4><ul>{ai.risks.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></>}
          {(ai.suggestions ?? []).length > 0 && <><h4>Sugerencias con tu armario</h4><ul>{ai.suggestions.map((x: Row, i: number) => <li key={i}>{roleLabel(x.role)}: <Link href={`/armario/${x.garment_id}`}>{x.title}</Link> — {x.reason}</li>)}</ul></>}
          {(ai.dropped ?? []).length > 0 && <p className="m small">Validación: {ai.dropped.join(' ')}</p>}
        </section>}
        {ai.error && <p className="note">El estilista con IA no ha respondido; te muestro la evaluación del motor.</p>}
        <h3>Cómo lo puntúa el motor</h3>
        <table className="usage"><thead><tr><th>Criterio</th><th>Peso</th><th>Puntos</th></tr></thead><tbody>{((e.breakdown?.criteria ?? []) as Row[]).map((c) => (
          <tr key={c.key}><td><b>{c.label}</b><ul className="m small">{(c.reasons as string[]).map((r, i) => <li key={i}>{r}</li>)}</ul></td><td>{c.weight}</td><td>{c.points}</td></tr>
        ))}</tbody></table>
        {(e.breakdown?.warnings ?? []).length > 0 && <ul className="oprob">{e.breakdown.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}</ul>}
      </>)}

      {e.mode === 'visual' && (<>
        {e.photo_url && <img src={e.photo_url} alt="Tu foto con el conjunto" className="evalphoto" />}
        {!ai.photo_quality?.suitable && <p className="note warn">La foto no permite valorar el conjunto con fiabilidad{(ai.photo_quality?.issues ?? []).length ? `: ${ai.photo_quality.issues.join('; ')}` : ''}.</p>}
        <section className="verdict"><h3>Resumen</h3><p>{ai.summary}</p><p className="m small">¿Corresponde al conjunto previsto? {MATCH[ai.matches_plan?.value] ?? '—'}{ai.matches_plan?.notes ? `: ${ai.matches_plan.notes}` : ''}</p></section>
        {((ai.aspects ?? []) as Row[]).map((a) => <div key={a.key} className="aspect"><div className="crh"><span><b>{a.label}</b></span><b>{a.score != null ? `${a.score}/10` : 'No observable'}</b></div><p className="m small">{a.observation}</p></div>)}
        {(ai.not_visible ?? []).length > 0 && <div className="note"><b>Lo que la foto no permite verificar</b><ul className="small">{ai.not_visible.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></div>}
        {(ai.suggestions ?? []).length > 0 && <><h3>Sugerencias</h3><ul>{ai.suggestions.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></>}
        <p className="m small">{e.photo_path ? 'Has conservado la foto en tu carpeta privada.' : 'La foto se borró tras el análisis.'}</p>
        {e.photo_path && <form action={deleteEvaluationPhotoAction}><input type="hidden" name="id" value={e.id} /><button className="btn quiet small">Borrar la foto</button></form>}
      </>)}
      <p className="m small" style={{ marginTop: 24 }}><Link href="/outfits/evaluar">Evaluar otro conjunto</Link> · <Link href="/outfits">Volver a Outfit Studio</Link></p>
    </main>
  )
}
