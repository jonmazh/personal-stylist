'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { analyzeGarmentAction, createGarmentAction } from '@/app/(app)/armario/actions'
import { uploadGarmentPhoto } from '@/lib/wardrobe/upload-client'
import { PhotoPicker, type Staged } from './photo-picker'
import { GarmentFields } from './garment-fields'

/**
 * Incorporacion de una prenda: fotos (camara o galeria, varias vistas) + ficha manual, o alta asistida:
 * se guarda como borrador, se analiza con IA y se abre la revision de la propuesta (nada se acepta solo).
 */
export function NewGarmentForm({ uid, roles, styles }: { uid: string; roles: { id: string; label: string }[]; styles: { id: string; name: string }[] }) {
  const router = useRouter()
  const [photos, setPhotos] = useState<Staged[]>([])
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
    const fd = new FormData(e.currentTarget)
    const withAI = submitter?.value === 'ai'
    if (withAI && !photos.some((p) => p.role !== 'worn')) { setErr('Para analizarla con IA añade al menos una foto de la prenda (frontal, posterior, detalle o etiqueta).'); return }
    fd.set('status', submitter?.value === 'active' ? 'active' : 'draft')
    setErr(''); setBusy('Creando la ficha…')
    const r = await createGarmentAction(fd)
    if (r.error || !r.id) { setErr(r.error ?? 'No se pudo crear'); setBusy(''); return }
    const failed: string[] = []
    let dup = false
    for (const [i, p] of photos.entries()) {
      setBusy(`Subiendo foto ${i + 1} de ${photos.length}…`)
      try { const u = await uploadGarmentPhoto(uid, r.id, p.file, p.role); if (u.duplicateOf) dup = true }
      catch (x) { failed.push(x instanceof Error ? x.message : 'error') }
    }
    const q = new URLSearchParams({ nuevo: '1' })
    if (withAI && failed.length < photos.length) {
      setBusy('Analizando la prenda con IA… (puede tardar unos segundos)')
      const a = await analyzeGarmentAction(r.id)
      q.set('tab', 'analisis')
      if (a.error) q.set('error', `No se pudo analizar: ${a.error}`)
    }
    if (r.warnings?.length) q.set('warn', r.warnings.join(' '))
    if (failed.length) q.set('error', `No se pudieron subir ${failed.length} fotos: ${failed[0]}`)
    if (dup) q.set('dup', '1')
    router.push(`/armario/${r.id}?${q}`)
  }

  return (
    <form onSubmit={submit}>
      <section>
        <h3>Fotografías</h3>
        <PhotoPicker roles={roles} value={photos} onChange={setPhotos} disabled={!!busy} />
      </section>
      <GarmentFields styles={styles} allowEmptyCategory />
      {err && <p className="note warn" role="alert">{err}</p>}
      <div className="btns">
        <button className="btn primary" value="ai" disabled={!!busy}>Guardar y analizar con IA</button>
        <button className="btn" value="active" disabled={!!busy}>Guardar en el armario</button>
        <button className="btn" value="draft" disabled={!!busy}>Guardar como borrador</button>
        {busy && <span className="m small" role="status">{busy}</span>}
      </div>
      <p className="m small">Con «Guardar y analizar con IA» basta con las fotos: la IA propone tipo, color, corte y características, con su nivel de confianza, y tú decides qué aceptar. Hasta entonces queda como borrador, que no cuenta en tu armario ni en el diagnóstico. La IA no valora cómo te queda: para eso hacen falta fotos tuyas llevándola.</p>
    </form>
  )
}
