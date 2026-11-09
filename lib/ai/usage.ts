import type { SupabaseClient } from '@supabase/supabase-js'
import { providerId, PROVIDER_LABEL } from './client'

const LABEL: Record<string, string> = {
  chat: 'Chat del estilista', photo_analysis: 'Análisis de fotos corporales', temperature_analysis: 'Temperatura cromática',
  reference_analysis: 'Referencias de estilo', garment_analysis: 'Análisis de prendas', fit_assessment: 'Fit Assessment (ajuste)', wardrobe_audit: 'Auditoría del armario (reglas, sin IA)', outfit_generation: 'Generador de outfits (reglas, sin IA)', stylist_parse: 'Estilista: interpretar la petición', stylist_select: 'Estilista: elegir y explicar propuestas', stylist_chat: 'Estilista: conversación', outfit_evaluation: 'Evaluación de conjuntos', taste_extract: 'Perfil de gustos: extraer de la conversación', taste_update: 'Perfil de gustos: anotaciones (sin IA)', shopping_analysis: 'Personal Shopper: detección de necesidades (reglas, sin IA)',
}

/**
 * Seguimiento sencillo del consumo de IA (fase 2B, seccion 10) a partir de ai_runs.
 * Coste: 0 con proveedores gratuitos; si se definen AI_PRICE_IN y AI_PRICE_OUT (€ por millon de tokens), se estima.
 */
export async function aiUsageSummary(sb: SupabaseClient, days = 30) {
  const since = new Date(Date.now() - days * 864e5).toISOString()
  const { data } = await sb.from('ai_runs').select('kind, meta, created_at').gte('created_at', since)
  const pin = Number(process.env.AI_PRICE_IN) || 0, pout = Number(process.env.AI_PRICE_OUT) || 0
  const by = new Map<string, { kind: string; label: string; count: number; cached: number; prompt: number; completion: number; ms: number; timed: number; cost: number; avgMs: number }>()
  for (const r of data ?? []) {
    const x = by.get(r.kind) ?? { kind: r.kind, label: LABEL[r.kind] ?? r.kind, count: 0, cached: 0, prompt: 0, completion: 0, ms: 0, timed: 0, cost: 0, avgMs: 0 }
    x.count++
    if (r.meta?.cached) x.cached++
    const u = r.meta?.usage
    if (u) { x.prompt += u.prompt ?? 0; x.completion += u.completion ?? 0; if (u.ms) { x.ms += u.ms; x.timed++ } }
    by.set(r.kind, x)
  }
  const rows = [...by.values()].map((x) => ({ ...x, avgMs: x.timed ? x.ms / x.timed : 0, cost: (x.prompt * pin + x.completion * pout) / 1e6 })).sort((a, z) => z.count - a.count)
  return { rows, provider: `${PROVIDER_LABEL()} (${providerId()})`, priced: !!(pin || pout) }
}
