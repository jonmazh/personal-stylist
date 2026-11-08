import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { loadBundle, status } from '@/lib/profile/data'
import { AREAS, PHOTO_KINDS, areaBySlug } from '@/lib/profile/areas'
import { addReferenceGarment, deletePhoto, deleteReferenceGarment, saveArea, setPhotoConsent, toggleValidated } from '../actions'
import { AreaBody } from '../fields'
import { PhotoSlot } from '../photo-slot'
import { AnalyzeButton } from '../analyze-button'
import { COMMON_RULES, PHOTO_PROTOCOL } from '@/lib/photos/protocol'
import { GARMENT_FIELDS, GARMENT_LABEL, describeGarment } from '@/lib/profile/summary'

export default async function ChapterPage({ params, searchParams }: {
  params: Promise<{ area: string }>; searchParams: Promise<{ saved?: string; validated?: string; unvalidated?: string; warn?: string; error?: string }>
}) {
  const { area: slug } = await params
  const flags = await searchParams
  const a = areaBySlug(slug)
  if (!a) notFound()
  const user = (await getUser())!
  const b = await loadBundle(user.supabase, user.id)
  const i = AREAS.findIndex((x) => x.id === a.id)
  const prev = AREAS[i - 1], next = AREAS[i + 1]
  const [label, cls] = status(a.id, b)
  const isValidated = b.validated[a.id]

  let urlOf = new Map<string | null, string | null>()
  if (a.id === 'a2' && b.photos.length) {
    const { data } = await user.supabase.storage.from('profile-private').createSignedUrls(b.photos.map((p) => p.storage_path), 300)
    urlOf = new Map((data ?? []).map((s) => [s.path, s.signedUrl]))
  }

  return (
    <main>
      <p className="eyebrow">Capítulo {String(i + 1).padStart(2, '0')} de {String(AREAS.length).padStart(2, '0')}</p>
      <h1 className="display">{a.name}</h1>
      <p className="lead">{a.intro}</p>
      <p className={`state ${cls}`}>{label}</p>

      {flags.saved && <p className="note" role="status">Guardado. {isValidated ? '' : 'Cuando lo veas correcto, valida el capítulo.'}</p>}
      {flags.validated && <p className="note" role="status">Capítulo validado: a partir de ahora es la referencia de mis recomendaciones.</p>}
      {flags.unvalidated && <p className="note" role="status">He quitado la validación: volveré a tratar este capítulo como hipótesis.</p>}
      {flags.warn && <p className="note warn" role="status">{flags.warn}</p>}
      {flags.error && <p className="note warn" role="alert">{flags.error}</p>}

      <form action={saveArea}>
        <input type="hidden" name="area" value={a.id} />
        <AreaBody id={a.id} b={b} />
        <div className="btns"><button className="btn primary">Guardar</button></div>
      </form>

      {a.id === 'a2' && (<>
        <h2 id="fotos">Fotografías</h2>
        <p className="m">Opcionales. Se guardan en un espacio privado al que solo accedes tú y sirven para observar proporciones y color, nunca para medir.</p>
        <details className="howto">
          <summary>Cómo hacer las fotos</summary>
          <ul>{COMMON_RULES.map((r) => <li key={r}>{r}</li>)}</ul>
          <div className="protocol">
            {PHOTO_PROTOCOL.map((p) => (
              <div key={p.kind}>
                <b>{p.title}</b>
                <ul>{p.how.map((h) => <li key={h}>{h}</li>)}<li>{p.clothing}</li></ul>
                <p className="m small" style={{ margin: '8px 0 0' }}>La IA puede observar: {p.canAnalyze.join('; ').toLowerCase()}. No puede: {p.cannotAnalyze.join('; ').toLowerCase()}.</p>
              </div>
            ))}
          </div>
        </details>

        {!b.profile?.photo_consent_at ? (
          <form action={setPhotoConsent} className="note">
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', color: 'var(--ink)', fontSize: 15 }}>
              <input type="checkbox" name="consent" required />
              <span>Entiendo que mis fotos se guardan en privado, que solo se envían al proveedor de IA configurado cuando pulso «Analizar» (los planes gratuitos pueden usarlas para entrenar; con Ollama no salen de mi equipo) y que puedo borrarlas cuando quiera.</span>
            </label>
            <div className="btns" style={{ marginTop: 12 }}><button className="btn">Aceptar y continuar</button></div>
          </form>
        ) : null}

        <div className="photos">
          {PHOTO_PROTOCOL.map((spec) => {
            const k = spec.kind
            const ph = b.photos.find((p) => p.kind === k)
            const issues: { code: string; message: string }[] = ph?.quality?.client?.issues ?? []
            const ai = ph?.quality?.ai as { usable: boolean; issues: string[] } | undefined
            return (
              <div key={k} className="photo">
                {ph ? (
                  <div className="photo-frame"><img src={urlOf.get(ph.storage_path) ?? ''} alt={`Foto ${k}`} /></div>
                ) : <PhotoSlot uid={user.id} kind={k} help={spec.short} vertical={spec.vertical} consent={!!b.profile?.photo_consent_at} />}
                <div className="photo-cap"><span>{k}</span>
                  {ph && <form action={deletePhoto}><input type="hidden" name="id" value={ph.id} /><button className="btn quiet small">Quitar</button></form>}
                </div>
                {ph && (
                  <div className="qc">
                    {ai && !ai.usable ? <span className="warn">La IA no pudo usarla: {ai.issues.join('; ') || 'calidad insuficiente'}</span>
                      : issues.length ? <span className="warn">Con avisos: {issues.map((i) => i.message).join(' ')}</span>
                      : <span className="ok">Calidad correcta</span>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <p className="m small">Al analizar, el servidor envía tus fotos al proveedor de IA configurado. La IA describe lo visible: no mide ni diagnostica.</p>
        <AnalyzeButton disabled={b.photos.length === 0} />
        {b.observations.length > 0 && (<>
          <h3>Lo que observa la IA (pendiente de tu revisión en el diagnóstico)</h3>
          <ul className="observations">{b.observations.map((o) => <li key={o.id}><b>{o.title}.</b> {o.body} <span className="m small">· confianza {o.confidence} · foto {o.source_photo}</span></li>)}</ul>
        </>)}
      </>)}

      {a.id === 'a6' && (<>
        <h2 id="referencias">Prendas de referencia</h2>
        <p className="m">Prendas que ya te quedan bien. Mide la <b>prenda</b> en plano, no tu cuerpo: es la mejor guía para comprar la siguiente.</p>
        {b.references.length > 0 && (
          <ul className="refs">{b.references.map((g) => (
            <li key={g.id}><span>{describeGarment(g)}</span>
              <form action={deleteReferenceGarment}><input type="hidden" name="id" value={g.id} /><button className="btn quiet small">Quitar</button></form></li>
          ))}</ul>
        )}
        <details className="howto">
          <summary>Añadir una prenda</summary>
          <form action={addReferenceGarment}>
            <fieldset className="q"><legend>Tipo de prenda</legend>
              <div className="opts">{Object.keys(GARMENT_FIELDS).map((c) => <label key={c}><input type="radio" name="category" value={c} required />{GARMENT_LABEL[c]}</label>)}</div>
            </fieldset>
            <label>Nombre para reconocerla<input name="name" placeholder="Chino azul de Uniqlo" required /></label>
            <h3>Medidas de la prenda en plano (cm) · rellena las que correspondan</h3>
            <div className="grid">{['cintura', 'tiro', 'largo', 'bajo', 'hombros', 'pecho', 'manga'].map((k) => (
              <label key={k}>{k[0].toUpperCase() + k.slice(1)}<input name={`m_${k}`} type="number" inputMode="decimal" step="any" min={0} /></label>
            ))}</div>
            <label>Notas<input name="notes" placeholder="Talla 42, me queda justo de cintura" /></label>
            <div className="btns"><button className="btn">Guardar prenda</button></div>
          </form>
        </details>
      </>)}

      <h2>{isValidated ? 'Capítulo validado' : '¿Te describe bien?'}</h2>
      <p className="m">{isValidated
        ? 'Uso estos datos como fiables. Si algo ha cambiado, edítalo o quita la validación.'
        : 'Valida el capítulo cuando los datos sean correctos: pasarán a ser la referencia de tus recomendaciones.'}</p>
      <form action={toggleValidated}>
        <input type="hidden" name="area" value={a.id} /><input type="hidden" name="next" value={isValidated ? '0' : '1'} />
        <div className="btns" style={{ marginTop: 10 }}><button className={isValidated ? 'btn quiet' : 'btn'}>{isValidated ? 'Quitar validación' : 'Validar este capítulo'}</button></div>
      </form>

      <nav className="pager" aria-label="Capítulos">
        {prev ? <Link href={`/profile/${prev.slug}`}>← Anterior<b>{prev.name}</b></Link> : <Link href="/profile">← Volver<b>Expediente</b></Link>}
        {next ? <Link href={`/profile/${next.slug}`} style={{ textAlign: 'right' }}>Siguiente →<b>{next.name}</b></Link>
          : <Link href="/blueprint" style={{ textAlign: 'right' }}>Siguiente →<b>Tu diagnóstico</b></Link>}
      </nav>
    </main>
  )
}
