import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { loadBundle, status } from '@/lib/profile/data'
import { AREAS, PHOTO_KINDS, areaBySlug } from '@/lib/profile/areas'
import { deletePhoto, saveArea, toggleValidated } from '../actions'
import { AreaBody } from '../fields'
import { PhotoSlot } from '../photo-slot'
import { AnalyzeButton } from '../analyze-button'

const PHOTO_HELP: Record<string, string> = {
  frontal: 'De frente, cuerpo entero',
  lateral: 'De perfil, cuerpo entero',
  espalda: 'De espaldas, cuerpo entero',
  rostro: 'Rostro con luz natural',
}

export default async function ChapterPage({ params, searchParams }: {
  params: Promise<{ area: string }>; searchParams: Promise<{ saved?: string; validated?: string; unvalidated?: string }>
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

      <form action={saveArea}>
        <input type="hidden" name="area" value={a.id} />
        <AreaBody id={a.id} b={b} />
        <div className="btns"><button className="btn primary">Guardar</button></div>
      </form>

      {a.id === 'a2' && (<>
        <h2>Fotografías</h2>
        <p className="m">Se guardan en un espacio privado al que solo accedes tú. Sirven para observar proporciones, no para medir.</p>
        <div className="photos">
          {PHOTO_KINDS.map((k) => {
            const ph = b.photos.find((p) => p.kind === k)
            return (
              <div key={k} className="photo">
                {ph ? (
                  <div className="photo-frame"><img src={urlOf.get(ph.storage_path) ?? ''} alt={`Foto ${k}`} /></div>
                ) : <PhotoSlot uid={user.id} kind={k} help={PHOTO_HELP[k]} />}
                <div className="photo-cap"><span>{k}</span>
                  {ph && <form action={deletePhoto}><input type="hidden" name="id" value={ph.id} /><button className="btn quiet small">Quitar</button></form>}
                </div>
              </div>
            )
          })}
        </div>
        <p className="m small">Al analizar, el servidor envía tus fotos al proveedor de IA configurado (con Ollama no salen de tu equipo). La IA describe lo visible: no mide ni diagnostica.</p>
        <AnalyzeButton disabled={b.photos.length === 0} />
        {b.observations.length > 0 && (<>
          <h3>Lo que observa la IA (pendiente de tu revisión en el diagnóstico)</h3>
          <ul className="observations">{b.observations.map((o) => <li key={o.id}><b>{o.title}.</b> {o.body} <span className="m small">· confianza {o.confidence}</span></li>)}</ul>
        </>)}
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
