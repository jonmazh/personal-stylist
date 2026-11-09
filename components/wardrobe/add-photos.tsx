'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { uploadGarmentPhoto } from '@/lib/wardrobe/upload-client'
import { PhotoPicker, type Staged } from './photo-picker'

/** Añadir mas vistas a una prenda existente (posterior, detalle, etiqueta, puesta). */
export function AddPhotos({ uid, garmentId, roles }: { uid: string; garmentId: string; roles: { id: string; label: string }[] }) {
  const router = useRouter()
  const [photos, setPhotos] = useState<Staged[]>([])
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  async function upload() {
    let dup = false, fail = ''
    for (const [i, p] of photos.entries()) {
      setBusy(`Subiendo ${i + 1} de ${photos.length}…`)
      try { const r = await uploadGarmentPhoto(uid, garmentId, p.file, p.role); if (r.duplicateOf) dup = true } catch (e) { fail = e instanceof Error ? e.message : 'error' }
    }
    setBusy(''); setPhotos([])
    setMsg(fail ? `Alguna foto no se pudo subir: ${fail}` : dup ? 'Subidas. Ojo: alguna foto ya estaba en tu armario.' : 'Fotos añadidas.')
    router.refresh()
  }
  return (
    <div>
      <PhotoPicker roles={roles} value={photos} onChange={setPhotos} disabled={!!busy} />
      {photos.length > 0 && <div className="btns"><button type="button" className="btn primary" onClick={upload} disabled={!!busy}>{busy || `Subir ${photos.length} ${photos.length === 1 ? 'foto' : 'fotos'}`}</button></div>}
      {msg && <p className="msg" role="status">{msg}</p>}
    </div>
  )
}
