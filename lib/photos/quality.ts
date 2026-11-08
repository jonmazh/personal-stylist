import { z } from 'zod'

/**
 * Control de calidad de una foto ANTES de subirla (se ejecuta en el navegador sobre un canvas).
 * Funcion pura sobre pixeles RGBA para poder probarla sin navegador.
 * Los umbrales son orientativos: el resultado es un aviso, la decision final es del usuario.
 */
export const QualitySchema = z.object({
  ok: z.boolean(),
  issues: z.array(z.object({ code: z.string(), message: z.string() })),
  metrics: z.object({ width: z.number(), height: z.number(), brightness: z.number(), contrast: z.number(), sharpness: z.number(), cast: z.number(),
    shadow: z.number().optional(), saturation: z.number().optional() }),
})
export type Quality = z.infer<typeof QualitySchema>

export const THRESHOLDS = { minSide: 600, dark: 60, bright: 210, flat: 25, blurry: 40, cast: 0.08, shadow: 45, saturationHigh: 0.6, saturationLow: 0.04 }

export interface Pixels { width: number; height: number; data: Uint8ClampedArray | number[] }

/**
 * @param px     imagen reducida (lado mayor ~256 px) para las metricas
 * @param orig   tamano original del fichero, para la resolucion y la orientacion
 */
export function assessPhoto(px: Pixels, orig: { width: number; height: number }, opts: { vertical: boolean; colorCritical: boolean; face?: boolean }): Quality {
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

  // Dominante de color de la luz: se mide en las zonas claras y casi neutras (fondo, folio blanco), no en toda la imagen,
  // porque la piel es rosada o dorada por naturaleza. Si no hay zonas neutras suficientes, no se puede juzgar (cast = 0).
  let nr = 0, ng = 0, nb = 0, nn = 0
  for (let i = 0; i < n; i++) {
    const R = data[i * 4], G = data[i * 4 + 1], B = data[i * 4 + 2]
    const mx = Math.max(R, G, B), mn = Math.min(R, G, B)
    if (gray[i] > 170 && mx && (mx - mn) / mx < 0.25) { nr += R; ng += G; nb += B; nn++ }
  }
  void r; void g; void b
  const avg = nn ? (nr + ng + nb) / 3 / nn : 1
  const cast = nn >= n * 0.02 ? Math.max(Math.abs(nr / nn - avg), Math.abs(ng / nn - avg), Math.abs(nb / nn - avg)) / avg : 0

  // Rostro: sombras fuertes (mitad izquierda frente a derecha de la zona central) y filtros (saturacion anomala).
  let shadow = 0, saturation = 0
  if (opts.face) {
    let l = 0, r = 0, nl = 0, nr = 0
    for (let y = Math.floor(h * 0.2); y < Math.floor(h * 0.8); y++) for (let x = Math.floor(w * 0.15); x < Math.floor(w * 0.85); x++) {
      const v = gray[y * w + x]
      if (x < w / 2) { l += v; nl++ } else { r += v; nr++ }
    }
    shadow = Math.abs(l / (nl || 1) - r / (nr || 1))
    let sat = 0
    for (let i = 0; i < n; i++) {
      const R = data[i * 4], G = data[i * 4 + 1], B = data[i * 4 + 2]
      const mx = Math.max(R, G, B), mn = Math.min(R, G, B)
      sat += mx ? (mx - mn) / mx : 0
    }
    saturation = sat / n
  }

  const issues: Quality['issues'] = []
  const T = THRESHOLDS
  if (Math.min(orig.width, orig.height) < T.minSide) issues.push({ code: 'low_res', message: 'Resolución baja: usa la cámara principal del móvil, sin recortar.' })
  if (opts.vertical && orig.width > orig.height) issues.push({ code: 'orientation', message: 'Para cuerpo entero la foto debe ser vertical.' })
  if (mean < T.dark) issues.push({ code: 'dark', message: 'Está demasiado oscura: busca más luz natural.' })
  if (mean > T.bright) issues.push({ code: 'bright', message: 'Está sobreexpuesta: evita el sol directo o el contraluz.' })
  if (!opts.face && contrast < T.flat) issues.push({ code: 'flat', message: 'Tiene muy poco contraste: la silueta no se distingue del fondo.' })
  if (sharpness < T.blurry) issues.push({ code: 'blurry', message: 'Parece desenfocada o movida: apoya el móvil o usa el temporizador.' })
  if (opts.colorCritical && cast > T.cast) issues.push({ code: 'cast', message: 'La luz tiñe la imagen de color: con esta foto no se puede valorar tu colorimetría.' })
  if (opts.face && shadow > T.shadow) issues.push({ code: 'shadow', message: 'Hay sombras fuertes en un lado de la cara: busca una luz frontal y uniforme.' })
  if (opts.face && saturation > T.saturationHigh) issues.push({ code: 'filter', message: 'Los colores parecen exagerados, como con un filtro: usa la cámara sin filtros ni retoques.' })
  if (opts.face && saturation < T.saturationLow) issues.push({ code: 'filter', message: 'La foto parece en blanco y negro o sin color: así no se puede valorar tu piel.' })

  const round = (x: number) => Math.round(x * 10) / 10
  return { ok: issues.length === 0, issues, metrics: { width: orig.width, height: orig.height, brightness: round(mean), contrast: round(contrast), sharpness: round(sharpness), cast: Math.round(cast * 1000) / 1000,
    ...(opts.face ? { shadow: round(shadow), saturation: Math.round(saturation * 1000) / 1000 } : {}) } }
}
