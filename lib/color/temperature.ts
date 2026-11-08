import type { TemperatureAI } from '@/lib/ai/schemas'
import { PALETTES, type Temp } from './palette'

/**
 * Temperatura cromatica (BIS 2): reglas de la capa de aplicacion sobre la propuesta de la IA.
 * La IA propone; la aplicacion valida, rebaja la confianza si la captura no es buena y nunca sobrescribe lo validado.
 */
export type Confidence = 'alta' | 'media' | 'baja'
const MAP: Record<string, Temp | null> = { calida: 'Cálida', fria: 'Fría', neutra: 'Neutra', indeterminada: null }
const RANK: Record<Confidence, number> = { baja: 0, media: 1, alta: 2 }
const cap = (c: Confidence, max: Confidence): Confidence => (RANK[c] > RANK[max] ? max : c)

/** Avisos del control de calidad del navegador que impiden una conclusion fiable de color. */
export const SERIOUS_ISSUES = ['dark', 'bright', 'blurry', 'cast', 'shadow', 'filter']

export interface TemperatureResult {
  suitable: boolean
  temperature: Temp | null
  secondary: Exclude<Temp, 'Neutra'> | null
  confidence: Confidence
  capped: boolean
  explanation: string
  observations: string[]
  limitations: string[]
  issues: string[]
}

/**
 * Convierte la propuesta de la IA en el resultado que se guarda:
 *  - Foto no apta → sin conclusion (temperature null, confianza baja) y se pide otra foto.
 *  - «Indeterminada» → sin conclusion: no se fuerza una categoria.
 *  - Avisos graves en la captura (oscura, quemada, desenfocada, dominante de color, sombras, filtro) → confianza maxima baja.
 *  - Otros avisos, o sin control previo → confianza maxima media. La IA tampoco puede dar «alta» si ella misma ve problemas.
 *  - La tendencia secundaria solo existe si difiere de la principal.
 */
export function finalizeTemperature(ai: TemperatureAI, client?: { issues?: { code: string; message: string }[] } | null): TemperatureResult {
  const clientIssues = client?.issues ?? []
  const issues = [...ai.image_quality.issues, ...clientIssues.map((i) => i.message)]
  const limitations = ai.limitations.length ? ai.limitations : ['La luz, el balance de blancos y el procesado del móvil alteran el color de la piel.']
  if (!ai.image_quality.suitable) {
    return { suitable: false, temperature: null, secondary: null, confidence: 'baja', capped: ai.confidence !== 'baja', explanation: ai.explanation, observations: ai.observations, limitations, issues }
  }
  const temperature = MAP[ai.temperature] ?? null
  let max: Confidence = 'alta'
  if (!client) max = 'media'
  if (clientIssues.length || ai.image_quality.issues.length) max = 'media'
  if (clientIssues.some((i) => SERIOUS_ISSUES.includes(i.code))) max = 'baja'
  if (!temperature) max = 'baja'
  const confidence = cap(ai.confidence, max)
  const sec = ai.secondary_tendency ? MAP[ai.secondary_tendency] : null
  const secondary = temperature && sec && sec !== temperature && sec !== 'Neutra' ? (sec as Exclude<Temp, 'Neutra'>) : null
  return { suitable: true, temperature, secondary, confidence, capped: confidence !== ai.confidence, explanation: ai.explanation, observations: ai.observations, limitations, issues }
}

const ADJ: Record<Temp, string> = { 'Cálida': 'cálida', 'Fría': 'fría', 'Neutra': 'neutra' }
/** «Neutra con tendencia cálida», «Cálida» o «Sin información suficiente». */
export const temperatureLabel = (t: Temp | null | undefined, secondary?: string | null) =>
  !t ? 'Sin información suficiente' : `${t}${secondary ? ` con tendencia ${ADJ[secondary as Temp] ?? secondary.toLowerCase()}` : ''}`

export type TemperatureStatus = 'pendiente' | 'recopilado' | 'validado'
export interface TemperatureState {
  /** Valor vigente para recomendaciones: el validado o declarado por el usuario; si no hay, la ultima estimacion apta de la IA. */
  value: Temp | null
  secondary: string | null
  status: TemperatureStatus
  source: 'usuario' | 'ia' | null      // de donde sale el dato vigente
  fromUser: boolean                     // false = solo hay estimacion de IA sin confirmar
  confidence: Confidence | null         // de la estimacion de IA, cuando el dato vigente procede de ella
  validatedAt?: string
  updatedAt?: string
  latest?: Record<string, any>          // ultima estimacion de la IA (puede diferir de lo validado)
  aiDiffers: boolean                    // la ultima estimacion propone otra cosa que lo validado: no se aplica sin confirmacion
}

/** Estado de la temperatura a partir del perfil cromatico y de las estimaciones de la IA (la mas reciente primero). */
export function temperatureState(color: Record<string, any> | null | undefined, analyses: Record<string, any>[] = []): TemperatureState {
  const c = color ?? {}
  const latest = [...analyses].sort((a, z) => String(z.created_at).localeCompare(String(a.created_at)))[0]
  const userValue = (['Cálida', 'Fría', 'Neutra'] as const).find((t) => t === c.temperature) ?? null
  const linked = c.temperature_analysis_id ? analyses.find((a) => a.id === c.temperature_analysis_id) : undefined
  if (userValue) {
    const status: TemperatureStatus = c.temperature_status === 'validado' ? 'validado' : 'recopilado'
    return {
      value: userValue, secondary: c.temperature_source === 'ia' ? linked?.secondary_tendency ?? null : null, status, source: c.temperature_source === 'ia' ? 'ia' : 'usuario', fromUser: true,
      confidence: null, validatedAt: c.temperature_validated_at ?? undefined, updatedAt: c.temperature_updated_at ?? undefined, latest,
      aiDiffers: !!(latest?.temperature && latest.id !== c.temperature_analysis_id && latest.temperature !== userValue),
    }
  }
  if (latest?.temperature) return { value: latest.temperature, secondary: latest.secondary_tendency ?? null, status: 'recopilado', source: 'ia', fromUser: false, confidence: latest.confidence, latest, aiDiffers: false }
  return { value: null, secondary: null, status: 'pendiente', source: null, fromUser: false, confidence: null, latest, aiDiffers: false }
}

/**
 * Encaje de un color con la temperatura (armario, compras, combinaciones). Orienta, nunca prohibe:
 * fuera de la paleta se recomienda llevarlo lejos de la cara o con un neutro, sobre todo si al usuario le gusta.
 */
export function colorFit(temp: Temp | null, color: string, opts: { nearFace: boolean; liked?: boolean }) {
  if (!temp) return { verdict: 'sin datos' as const, reason: 'Aún no conozco tu temperatura cromática.' }
  const p = PALETTES[temp]
  if (p.cara.includes(color)) return { verdict: 'favorece' as const, reason: `${color} armoniza con tu temperatura ${temp.toLowerCase()}, también cerca de la cara.` }
  if (p.neutros.includes(color) || p.inferiores.includes(color) || p.acentos.includes(color))
    return { verdict: 'funciona' as const, reason: `${color} está en tu paleta${opts.nearFace && !p.cara.includes(color) ? '; cerca de la cara, combínalo con un color de tu grupo «cerca de la cara»' : ''}.` }
  if (!opts.nearFace) return { verdict: 'funciona' as const, reason: `${color} queda lejos de la cara: aquí la temperatura apenas influye.` }
  return { verdict: 'con matices' as const, reason: `${color} no es de tu temperatura ${temp.toLowerCase()}${opts.liked ? ', pero te gusta: llévalo' : ': mejor llevarlo'} lejos de la cara o separado del rostro con un neutro de tu paleta.` }
}
