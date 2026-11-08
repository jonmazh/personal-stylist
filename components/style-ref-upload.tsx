'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { registerStyleReference } from '@/app/(app)/profile/actions'

/** Sube una referencia visual propia (captura de Pinterest, Instagram...) al bucket privado. */
export function StyleRefUpload({ uid }: { uid: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [url, setUrl] = useState('')
  const [note, setNote] = useState('')

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true); setErr('')
    try {
      const img = await createImageBitmap(file)
      const k = Math.min(1, 1024 / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo procesar la imagen'))), 'image/jpeg', 0.85))
      const path = `${uid}/ref-${Date.now()}.jpg`
      const { error } = await createClient().storage.from('references-private').upload(path, blob, { contentType: 'image/jpeg' })
      if (error) throw error
      await registerStyleReference(path, url, note)
      setUrl(''); setNote('')
      router.refresh()
    } catch (x) { setErr(x instanceof Error ? x.message : 'Error al subir') }
    setBusy(false)
  }

  return (
    <div className="stack">
      <div className="grid">
        <label>Enlace de origen (opcional)<input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://pinterest.com/…" /></label>
        <label>Qué te gusta de ella (opcional)<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="La caída del pantalón" /></label>
      </div>
      <label className="btn" style={{ width: 'fit-content' }}>{busy ? 'Subiendo…' : 'Añadir imagen'}
        <input type="file" accept="image/*" onChange={onChange} disabled={busy} style={{ display: 'none' }} aria-label="Subir referencia" />
      </label>
      {err && <p className="warn small">{err}</p>}
    </div>
  )
}
