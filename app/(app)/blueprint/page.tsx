import Link from 'next/link'
import { getUser } from '@/lib/supabase/server'
import { loadBundle } from '@/lib/profile/data'
import { AREAS } from '@/lib/profile/areas'
import { COLOR_HEX, confClass } from '@/lib/profile/blueprint'
import { reviewHint } from '@/lib/profile/review'
import { generateBlueprint, reviewFinding } from '../profile/actions'

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
const shownBody = (f: Record<string, any>) => (f.status === 'corrected' ? f.corrected_body : f.body)

export default async function BlueprintPage({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  const user = (await getUser())!
  const { v } = await searchParams
  const b = await loadBundle(user.supabase, user.id)
  const last = b.blueprints.at(-1)
  const shown = b.blueprints.find((x) => String(x.version) === v) ?? last
  const prev = shown ? b.blueprints.find((x) => x.version === shown.version - 1) : undefined
  const editable = !!shown && shown === last
  const validatedNow = AREAS.filter((a) => b.validated[a.id]).length

  if (!shown) return (
    <main>
      <p className="eyebrow">Style Blueprint</p>
      <h1 className="display">Tu diagnóstico</h1>
      <p className="lead">Aún no lo he redactado. Puedo hacerlo con lo que tengas: te diré también lo que todavía no sé.</p>
      <p className="m small">{validatedNow} de {AREAS.length} capítulos del expediente validados.</p>
      <form action={generateBlueprint} className="btns"><button className="btn primary">Generar diagnóstico</button>
        <Link className="btn quiet" href="/profile">Completar antes el expediente</Link></form>
    </main>
  )

  const identity = shown.findings.find((f) => f.title === 'Identidad estética')
  const reviewed = shown.findings.filter((f) => f.status !== 'pending').length

  return (
    <main>
      <header className="cover">
        <p className="eyebrow">Style Blueprint · Versión {shown.version}{editable ? '' : ' · solo lectura'}</p>
        <h1 className="display">Tu diagnóstico</h1>
        {identity && <p className="quote">{shownBody(identity)}</p>}
        <div className="meta">
          <span>{fmtDate(shown.created_at)}</span>
          <span>{shown.validated_areas === AREAS.length ? 'Perfil completo' : `Perfil preliminar · ${shown.validated_areas} de ${AREAS.length} capítulos validados`}</span>
          <span>{reviewed} de {shown.findings.length} conclusiones revisadas por ti</span>
        </div>
        {b.blueprints.length > 1 && (
          <nav className="versions" aria-label="Versiones">
            {b.blueprints.slice().reverse().map((x) => (
              <Link key={x.id} href={`/blueprint?v=${x.version}`} aria-current={x.id === shown.id ? 'page' : undefined}>v{x.version} · {fmtDate(x.created_at)}</Link>
            ))}
          </nav>
        )}
      </header>

      {shown.findings.map((f, i) => {
        const state = f.status === 'corrected' ? ['Corregida por ti', 'ok'] : f.status === 'confirmed' ? ['Confirmada por ti', 'ok'] : [f.confidence, confClass(f.confidence)]
        const hint = reviewHint(prev?.findings, f, prev?.version)
        const colors = f.title === 'Paleta' ? String(f.body).replace(/\.$/, '').split(', ').filter((c) => COLOR_HEX[c]) : []
        return (
          <article key={f.id} className="section find">
            <span className="section-num">{String(i + 1).padStart(2, '0')}</span>
            <div>
              <div className="section-title"><b>{f.title}</b><span className={`state ${state[1]}`}>{state[0]}</span></div>
              {colors.length > 0 && (
                <div className="swatches">{colors.map((c) => <span key={c} className="swatch"><i style={{ background: COLOR_HEX[c] }} />{c}</span>)}</div>
              )}
              {!(colors.length && f.status !== 'corrected') && <p className="section-body">{shownBody(f)}</p>}
              {f.status === 'corrected' && <p className="section-why">Propuesta original: {f.body}</p>}
              <p className="section-why">Origen: {f.origin}. {f.justification}</p>
              {hint && <p className="section-hint">{hint}</p>}
              {editable && (
                <form action={reviewFinding} className="review">
                  <input type="hidden" name="id" value={f.id} />
                  <button className="btn" name="mode" value="confirm" disabled={f.status === 'confirmed'}>{f.status === 'confirmed' ? 'Confirmada' : 'Confirmar'}</button>
                  <span className="correct">
                    <input name="corrected" placeholder="O escribe tu corrección…" defaultValue={f.corrected_body ?? ''} aria-label={`Corrección para ${f.title}`} />
                    <button className="btn quiet" name="mode" value="correct">Corregir</button>
                  </span>
                </form>
              )}
            </div>
          </article>
        )
      })}

      <div className="btns">
        {editable ? <form action={generateBlueprint}><button className="btn primary">Generar nueva versión</button></form>
          : <Link className="btn primary" href="/blueprint">Ir a la versión actual</Link>}
        <Link className="btn quiet" href="/profile">Revisar el expediente</Link>
      </div>
      <p className="m small">Al generar una nueva versión conservo lo que ya revisaste, salvo las conclusiones cuyos datos hayan cambiado.</p>
    </main>
  )
}
