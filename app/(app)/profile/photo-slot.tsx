'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { assessPhoto, type Quality } from '@/lib/photos/quality'
import { registerPhoto } from './actions'

const loadBitmap = (file: File) => createImageBitmap(file)

function draw(img: ImageBitmap, max: number) {
  const k = Math.min(1, max / Math.max(img.width, img.height))
  const c = document.createElement('canvas')
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, c.width, c.height)
  return { c, ctx }
}

/** Reduce a 1024 px y vuelve a codificar en JPEG: elimina los metadatos (incluida la ubicacion GPS). */
const toJpeg = (img: ImageBitmap) => new Promise<Blob>((res, rej) =>
  draw(img, 1024).c.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo procesar la foto'))), 'image/jpeg', 0.85))

function check(img: ImageBitmap, vertical: boolean, colorCritical: boolean): Quality {
  const { c, ctx } = draw(img, 256)
  const { data } = ctx.getImageData(0, 0, c.width, c.height)
  return assessPhoto({ width: c.width, height: c.height, data }, { width: img.width, height: img.height }, { vertical, colorCritical, face: colorCritical })
}

/** Silueta guia del hueco vacio. */
const Guide = ({ face }: { face: boolean }) => face
  ? <svg className="guide" viewBox="0 0 60 70" aria-hidden="true"><ellipse cx="30" cy="30" rx="17" ry="22" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M8 70c3-12 12-17 22-17s19 5 22 17" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
  : <svg className="guide" viewBox="0 0 40 100" aria-hidden="true"><circle cx="20" cy="9" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M9 22h22l3 30h-5l-2 46h-6l-1-30-1 30h-6l-2-46H6z" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>

export function PhotoSlot({ uid, kind, help, vertical, consent }: { uid: string; kind: string; help: string; vertical: boolean; consent: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [pending, setPending] = useState<{ img: ImageBitmap; quality: Quality } | null>(null)

  async function upload(img: ImageBitmap, quality: Quality) {
    setBusy(true); setErr(''); setPending(null)
    try {
      const blob = await toJpeg(img)
      const path = `${uid}/${kind}-${Date.now()}.jpg` // la 1.ª carpeta = uid: lo exige la politica de Storage
      const { error } = await createClient().storage.from('profile-private').upload(path, blob, { contentType: 'image/jpeg' })
      if (error) throw error
      await registerPhoto(kind, path, quality)
      router.refresh()
    } catch (x) { setErr(x instanceof Error ? x.message : 'Error al subir') }
    setBusy(false)
  }

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setErr('')
    try {
      const img = await loadBitmap(file)
      const quality = check(img, vertical, kind === 'rostro')
      if (quality.ok) await upload(img, quality)
      else setPending({ img, quality }) // el usuario decide: repetir o subir igualmente
    } catch { setErr('No se pudo leer la imagen') }
  }

  if (pending) return (
    <div className="photo-frame empty qc" role="alert">
      <div>
        <b>Antes de subirla:</b>
        <ul>{pending.quality.issues.map((i) => <li key={i.code}>{i.message}</li>)}</ul>
        <div className="btns" style={{ marginTop: 10 }}>
          <button type="button" className="btn" onClick={() => setPending(null)}>Repetir</button>
          <button type="button" className="btn quiet" onClick={() => upload(pending.img, pending.quality)}>Subir igualmente</button>
        </div>
      </div>
    </div>
  )

  return (
    <label className="photo-frame empty" aria-disabled={!consent}>
      <span>
        <Guide face={kind === 'rostro'} />
        {busy ? 'Subiendo…' : <>{help}<br />{consent ? <u>Añadir foto</u> : <span className="m">Acepta antes las condiciones</span>}</>}
        {err && <><br /><span className="warn">{err}</span></>}
      </span>
      <input type="file" accept="image/*" onChange={onChange} disabled={busy || !consent} aria-label={`Subir foto ${kind}`} />
    </label>
  )
}
