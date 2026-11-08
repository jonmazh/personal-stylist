import { z } from 'zod'

/**
 * Control de calidad de una foto ANTES de subirla (se ejecuta en el navegador sobre un canvas).
 * Funcion pura sobre pixeles RGBA para poder probarla sin navegador.
 * Los umbrales son orientativos: el resultado es un aviso, la decision final es del usuario.
 */
export const QualitySchema = z.object({
  ok: z.boolean(),
  issues: z.array(z.object({ code: z.string(), message: z.string() })),
  metrics: z.object({ width: z.number(), height: z.number(), brightness: z.number(), contrast: z.number(), sharpness: z.number(), cast: z.number() }),
})
export type Quality = z.infer<typeof QualitySchema>

export const THRESHOLDS = { minSide: 600, dark: 60, bright: 210, flat: 25, blurry: 40, cast: 0.16 }

export interface Pixels { width: number; height: number; data: Uint8ClampedArray | number[] }

/**
 * @param px     imagen reducida (lado mayor ~256 px) para las metricas
 * @param orig   tamano original del fichero, para la resolucion y la orientacion
 */
export function assessPhoto(px: Pixels, orig: { width: number; height: number }, opts: { vertical: boolean; colorCritical: boolean }): Quality {
  const { width: w, height: h, data } = px
  const n = w * h
  const gray = new Float32Array(n)
  let sum = 0, r = 0, g = 0, b = 0
  for (let i = 0; i < n; i++) {
    const R = data[i * 4], G = data[i * 4 + 1], B = data[i * 4 + 2]
    const y = 0.299 * R + 0.587 * G + 0.114 * B
    gray[i] = y; sum += y; r += R; g += G; b += B
  }
  const mean = sum / n
  let varSum = 0
  for (let i = 0; i < n; i++) varSum += (gray[i] - mean) ** 2
  const contrast = Math.sqrt(varSum / n)

  // Nitidez: varianza del laplaciano (bordes marcados = foto nitida).
  let lapSum = 0, lapSq = 0, cnt = 0
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x
    const l = gray[i - w] + gray[i + w] + gray[i - 1] + gray[i + 1] - 4 * gray[i]
    lapSum += l; lapSq += l * l; cnt++
  }
  const sharpness = cnt ? lapSq / cnt - (lapSum / cnt) ** 2 : 0

  // Dominante de color: desviacion maxima de un canal respecto a la media de los tres.
  const avg = (r + g + b) / 3 / n || 1
  const cast = Math.max(Math.abs(r / n - avg), Math.abs(g / n - avg), Math.abs(b / n - avg)) / avg

  const issues: Quality['issues'] = []
  const T = THRESHOLDS
  if (Math.min(orig.width, orig.height) < T.minSide) issues.push({ code: 'low_res', message: 'Resolución baja: usa la cámara principal del móvil, sin recortar.' })
  if (opts.vertical && orig.width > orig.height) issues.push({ code: 'orientation', message: 'Para cuerpo entero la foto debe ser vertical.' })
  if (mean < T.dark) issues.push({ code: 'dark', message: 'Está demasiado oscura: busca más luz natural.' })
  if (mean > T.bright) issues.push({ code: 'bright', message: 'Está sobreexpuesta: evita el sol directo o el contraluz.' })
  if (contrast < T.flat) issues.push({ code: 'flat', message: 'Tiene muy poco contraste: la silueta no se distingue del fondo.' })
  if (sharpness < T.blurry) issues.push({ code: 'blurry', message: 'Parece desenfocada o movida: apoya el móvil o usa el temporizador.' })
  if (opts.colorCritical && cast > T.cast) issues.push({ code: 'cast', message: 'La luz tiñe la imagen de color: con esta foto no se puede valorar tu colorimetría.' })

  const round = (x: number) => Math.round(x * 10) / 10
  return { ok: issues.length === 0, issues, metrics: { width: orig.width, height: orig.height, brightness: round(mean), contrast: round(contrast), sharpness: round(sharpness), cast: Math.round(cast * 1000) / 1000 } }
}
