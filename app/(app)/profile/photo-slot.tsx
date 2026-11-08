'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { registerPhoto } from './actions'

async function resize(file: File, max = 1024): Promise<Blob> {
  const img = await createImageBitmap(file)
  const k = Math.min(1, max / Math.max(img.width, img.height))
  const c = document.createElement('canvas')
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo procesar la foto'))), 'image/jpeg', 0.8))
}

export function PhotoSlot({ uid, kind }: { uid: string; kind: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true); setErr('')
    try {
      const blob = await resize(file)
      const path = `${uid}/${kind}-${Date.now()}.jpg` // la 1.ª carpeta = uid: lo exige la politica de Storage
      const { error } = await createClient().storage.from('profile-private').upload(path, blob, { contentType: 'image/jpeg' })
      if (error) throw error
      await registerPhoto(kind, path)
      router.refresh()
    } catch (x) { setErr(x instanceof Error ? x.message : 'Error al subir') }
    setBusy(false)
  }
  return (
    <label>{kind}
      <input type="file" accept="image/*" onChange={onChange} disabled={busy} />
      {busy && <span className="m">Subiendo…</span>}{err && <span className="bad">{err}</span>}
    </label>
  )
}
