'use client'
/**
 * Procesamiento de fotos de prendas en el navegador (fase 2A):
 * - original reducido a 2048 px y recodificado en JPEG (elimina metadatos, incluida la ubicacion GPS);
 * - miniatura WebP de 480 px para el catalogo (JPEG si el navegador no codifica WebP);
 * - hash SHA-256 del fichero original para no analizar dos veces la misma foto.
 */
export interface Processed { original: Blob; thumb: Blob; thumbType: string; width: number; height: number; sha256: string; preview: string }

async function encode(img: ImageBitmap, max: number, type: string, q: number) {
  const k = Math.min(1, max / Math.max(img.width, img.height))
  const c = document.createElement('canvas')
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, type, q))
  return { blob, width: c.width, height: c.height }
}

export async function processImage(file: File): Promise<Processed> {
  if (!file.type.startsWith('image/')) throw new Error('El archivo no es una imagen')
  const buf = await file.arrayBuffer()
  const hash = await crypto.subtle.digest('SHA-256', buf)
  const sha256 = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
  const img = await createImageBitmap(new Blob([buf], { type: file.type }))
  const o = await encode(img, 2048, 'image/jpeg', 0.88)
  if (!o.blob) throw new Error('No se pudo procesar la foto')
  let t = await encode(img, 480, 'image/webp', 0.8)
  let thumbType = 'image/webp'
  if (!t.blob || t.blob.type !== 'image/webp') { t = await encode(img, 480, 'image/jpeg', 0.8); thumbType = 'image/jpeg' }
  return { original: o.blob, thumb: t.blob!, thumbType, width: o.width, height: o.height, sha256, preview: URL.createObjectURL(t.blob!) }
}
