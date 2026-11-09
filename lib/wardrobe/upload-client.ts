'use client'
import { createClient } from '@/lib/supabase/client'
import { registerImageAction } from '@/app/(app)/armario/actions'
import { processImage } from './image-client'

/** Sube original y miniatura a los buckets privados y registra la imagen en la ficha. */
export async function uploadGarmentPhoto(uid: string, garmentId: string, file: File, role: string) {
  const p = await processImage(file)
  const sb = createClient()
  const name = crypto.randomUUID()
  const storage_path = `${uid}/${garmentId}/${name}.jpg`
  const thumb_path = `${uid}/${garmentId}/${name}.${p.thumbType === 'image/webp' ? 'webp' : 'jpg'}`
  const up = await sb.storage.from('wardrobe-originals').upload(storage_path, p.original, { contentType: 'image/jpeg' })
  if (up.error) throw new Error(up.error.message)
  const ut = await sb.storage.from('wardrobe-thumbnails').upload(thumb_path, p.thumb, { contentType: p.thumbType })
  if (ut.error) throw new Error(ut.error.message)
  const r = await registerImageAction(garmentId, { storage_path, thumb_path, role, width: p.width, height: p.height, bytes: p.original.size, sha256: p.sha256 })
  if (r.error) throw new Error(r.error)
  return r
}
