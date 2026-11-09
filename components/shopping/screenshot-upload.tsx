'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { processImage } from '@/lib/wardrobe/image-client'
import { registerProductImageAction } from '@/app/(app)/compras/product-actions'

/** Importación asistida: capturas o fotos del producto, recodificadas en el navegador (sin metadatos ni GPS) y guardadas en tu carpeta privada. */
export function ScreenshotUpload({ uid, productId }: { uid: string; productId: string }) {
  const ref = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  async function upload(files: FileList | null) {
    if (!files?.length) return
    setBusy(true); setError('')
    try {
      for (const file of [...files].slice(0, 6)) {
        const p = await processImage(file)
        const path = `${uid}/${productId}/${crypto.randomUUID()}.jpg`
        const up = await createClient().storage.from('shopping-private').upload(path, p.original, { contentType: 'image/jpeg' })
        if (up.error) throw new Error(up.error.message)
        const r = await registerProductImageAction(productId, path)
        if (r.error) { await createClient().storage.from('shopping-private').remove([path]); throw new Error(r.error) }
      }
      router.refresh()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false); if (ref.current) ref.current.value = '' }
  }
  return (
    <div className="btns">
      <input ref={ref} type="file" accept="image/*" multiple hidden aria-label="Elegir capturas del producto" onChange={(e) => upload(e.target.files)} />
      <button type="button" className="btn small" disabled={busy} onClick={() => ref.current?.click()}>{busy ? 'Subiendo…' : 'Añadir capturas o fotos'}</button>
      {error && <span className="note warn" role="alert">{error}</span>}
    </div>
  )
}
