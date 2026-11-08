import Link from 'next/link'
import { getUser } from '@/lib/supabase/server'
import { loadBundle } from '@/lib/profile/data'
import { AREAS } from '@/lib/profile/areas'
import { COLOR_HEX, PALETTE_GROUPS, SECTIONS, confClass, confLabel } from '@/lib/profile/blueprint'
import { reviewHint } from '@/lib/profile/review'
import { generateBlueprint, reviewFinding } from '../profile/actions'

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
const shownBody = (f: Record<string, any>) => (f.status === 'corrected' ? f.corrected_body : f.body)

/** Agrupa por seccion (las versiones antiguas, sin seccion, van en un solo bloque) y numera de forma continua. */
function groupsOf(findings: Record<string, any>[]): [string, { f: Record<string, any>; n: number }[]][] {
  let n = 0
  const legacy = findings.filter((f) => !f.section)
  if (legacy.length === findings.length) return [['', findings.map((f) => ({ f, n: ++n }))]]
  return SECTIONS.map((sec) => [sec.title, findings.filter((f) => f.section === sec.id).map((f) => ({ f, n: ++n }))] as [string, { f: Record<string, any>; n: number }[]])
    .filter(([, items]) => items.length)
}

export default async function BlueprintPage({ searchParams }: { searchParams: Promise<{ v?: string; error?: string }> }) {
  const user = (await getUser())!
  const { v, error } = await searchParams
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
      {error && <p className="note warn" role="alert">{error}</p>}
      <form action={generateBlueprint} className="btns"><button className="btn primary">Generar diagnóstico</button>
        <Link className="btn quiet" href="/profile">Completar antes el expediente</Link></form>
    </main>
  )

  const identity = shown.findings.find((f) => f.key === 'direccion') ?? shown.findings.find((f) => f.title === 'Identidad estética')
  const reviewed = shown.findings.filter((f) => f.status !== 'pending').length
  const isKnown = (f: Record<string, any>) => f.status !== 'pending' || f.confidence === 'alta' || /^(Confirm|Alta)/.test(f.confidence)
  const ledger = {
    know: shown.findings.filter((f) => isKnown(f) && f.key !== 'pasos' && f.key !== 'prioridades').map((f) => f.title),
    guess: shown.findings.filter((f) => !isKnown(f) && f.confidence !== 'sin_datos' && !/^Sin/.test(f.confidence)).map((f) => f.title),
    missing: [...new Set(shown.findings.flatMap((f) => (f.missing ?? []) as string[]))],
  }

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

      {error && <p className="note warn" role="alert">{error}</p>}
      {groupsOf(shown.findings).map(([title, items]) => (
        <section key={title}>
          {title && <p className="eyebrow part">{title}</p>}
          {items.map(({ f, n }) => {
            const state = f.status === 'corrected' ? ['Corregida por ti', 'ok'] : f.status === 'confirmed' ? ['Confirmada por ti', 'ok'] : [confLabel(f.confidence), confClass(f.confidence)]
            const hint = reviewHint(prev?.findings, f, prev?.version)
            const pal = f.details?.groups as Record<string, string[]> | undefined
            const legacyColors = !pal && f.title === 'Paleta' ? String(f.body).replace(/\.$/, '').split(', ').filter((c) => COLOR_HEX[c]) : []
            const showBody = f.status === 'corrected' || !(pal || legacyColors.length)
            const body = shownBody(f) as string
            const steps = /^1\. /.test(body) ? body.split(/ (?=\d\. )/) : null
            return (
              <article key={f.id} className="section find">
                <span className="section-num">{String(n).padStart(2, '0')}</span>
                <div>
                  <div className="section-title"><b>{f.title}</b><span className={`state ${state[1]}`}>{state[0]}</span></div>
                  {pal && f.status !== 'corrected' && PALETTE_GROUPS.filter(([g]) => pal[g]?.length).map(([g, label]) => (
                    <div key={g}><p className="swatch-group">{label}</p>
                      <div className="swatches">{pal[g].map((c) => <span key={c} className="swatch"><i style={{ background: COLOR_HEX[c] }} />{c}</span>)}</div></div>
                  ))}
                  {legacyColors.length > 0 && f.status !== 'corrected' && <div className="swatches">{legacyColors.map((c) => <span key={c} className="swatch"><i style={{ background: COLOR_HEX[c] }} />{c}</span>)}</div>}
                  {showBody && (steps ? <ol className="section-body steps">{steps.map((x) => <li key={x}>{x.replace(/^\d\. /, '')}</li>)}</ol> : <p className="section-body">{body}</p>)}
                  {f.status === 'corrected' && <p className="section-why">Propuesta original: {f.body}</p>}
                  <div className="reasons">
                    <div><p className="label">Por qué</p><p>{f.why ?? f.justification}</p></div>
                    {f.action && <div><p className="label">Qué haría un estilista</p><p>{f.action}</p></div>}
                  </div>
                  <p className="section-why">Origen: {f.origin}{f.data_used?.length ? ` · Datos usados: ${f.data_used.join(', ')}` : ''}</p>
                  {f.missing?.length > 0 && <p className="section-why">Falta: {f.missing.join(', ')}</p>}
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
        </section>
      ))}

      <section className="ledger">
        <p className="eyebrow part">Lo que sé, lo que supongo y lo que falta</p>
        <div className="ledger-cols">
          <div><h3>Lo que sé</h3><ul>{ledger.know.map((t) => <li key={t}>{t}</li>)}{!ledger.know.length && <li className="m">Nada confirmado todavía.</li>}</ul></div>
          <div><h3>Lo que supongo</h3><ul>{ledger.guess.map((t) => <li key={t}>{t}</li>)}{!ledger.guess.length && <li className="m">Nada.</li>}</ul></div>
          <div><h3>Lo que falta</h3><ul>{ledger.missing.map((t) => <li key={t}>{t}</li>)}{!ledger.missing.length && <li className="m">Nada: el expediente está completo.</li>}</ul></div>
        </div>
      </section>

      <div className="btns">
        {editable ? <form action={generateBlueprint}><button className="btn primary">Generar nueva versión</button></form>
          : <Link className="btn primary" href="/blueprint">Ir a la versión actual</Link>}
        <Link className="btn quiet" href="/profile">Revisar el expediente</Link>
      </div>
      <p className="m small">Al generar una nueva versión conservo lo que ya revisaste, salvo las conclusiones cuyos datos hayan cambiado.</p>
    </main>
  )
}
