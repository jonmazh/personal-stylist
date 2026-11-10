import { colorFit } from '@/lib/color/temperature'
import { combines } from '@/lib/wardrobe/compatibility'
import { GARMENT_COLORS } from '@/lib/wardrobe/taxonomy'
import { DARK, LIGHT, pal, type Conf, type ShopperContext } from './context'

/**
 * Color Intelligence: separa tres preguntas que una búsqueda por palabras confunde.
 *  A. ¿Te favorece? (colorimetría, con la confianza de su origen: validada, declarada, estimada por IA o pistas)
 *  B. ¿Lo necesita tu armario? (cuántas prendas de ese color hay en esa categoría y en total; equilibrio claro/oscuro)
 *  C. ¿Combina con lo que tienes? (prendas complementarias con las que combina)
 * Un color que te favorece pero ya saturado NO gana automáticamente.
 */
const NEAR_FACE = new Set(['top', 'outerwear', 'tailoring'])
export type Saturation = 'ausente' | 'escaso' | 'presente' | 'saturado'
export type ColorLabel = 'favorable-poco-representado' | 'equilibra-el-armario' | 'redundante' | 'poco-compatible' | 'neutro' | 'sin-datos'
export interface ColorAnalysis {
  color: string; category: string | null
  personal: { verdict: 'favorece' | 'funciona' | 'con matices' | 'sin datos'; value: number | null; reason: string; confidence: Conf | null; avoided: boolean; liked: boolean }
  wardrobe: { inCategory: number; categoryTotal: number; overall: number; saturation: Saturation; value: number; reasons: string[] }
  combinability: { count: number; of: number; value: number | null; garmentIds: string[] }
  value: number | null; label: ColorLabel; confidence: Conf | null; reasons: string[]
}

export function saturationOf(inCat: number, catTotal: number): Saturation {
  if (!inCat) return 'ausente'
  if (inCat >= 3 || (inCat >= 2 && inCat / Math.max(1, catTotal) >= 0.5)) return 'saturado'
  return inCat === 1 && catTotal >= 3 ? 'escaso' : 'presente'
}

export function analyzeColor(rawColor: string | null | undefined, category: string | null | undefined, ctx: ShopperContext): ColorAnalysis | null {
  if (!rawColor || rawColor === 'Multicolor') return null
  const color = pal(rawColor)!
  const cat = category ?? null
  const c = ctx.color
  const liked = c.likes.includes(color) || c.likes.includes(rawColor), avoided = c.avoids.includes(color) || c.avoids.includes(rawColor)
  // A. Personal
  const fit = colorFit((c.temp as never) ?? null, color, { nearFace: NEAR_FACE.has(cat ?? ''), liked })
  let pv: number | null = fit.verdict === 'favorece' ? 1 : fit.verdict === 'funciona' ? 0.75 : fit.verdict === 'con matices' ? (liked ? 0.55 : 0.4) : null
  if (avoided) pv = 0.15
  else if (liked && pv != null) pv = Math.min(1, pv + 0.1)
  else if (pv == null && liked) pv = 0.7
  const personal = { verdict: fit.verdict, value: pv, reason: avoided ? `${rawColor} está entre los colores que evitas.` : fit.reason, confidence: pv == null ? null : avoided || liked ? 'alta' as Conf : c.confidence, avoided, liked }
  // B. Armario
  const bc = ctx.wardrobe.byCategory[cat ?? '—'] ?? { total: 0, colors: {} }
  const inCategory = bc.colors[color] ?? 0, overall = ctx.wardrobe.colors[color] ?? 0
  const saturation = saturationOf(inCategory, bc.total)
  let wv = saturation === 'ausente' ? 1 : saturation === 'escaso' ? 0.85 : saturation === 'presente' ? 0.6 : 0.2
  const wr: string[] = []
  wr.push(saturation === 'ausente' ? `No tienes ninguna prenda ${color.toLowerCase()} de este tipo.` : saturation === 'saturado' ? `Ya tienes ${inCategory} prendas ${color.toLowerCase()} de este tipo: el color está cubierto.` : `Tienes ${inCategory} prenda${inCategory === 1 ? '' : 's'} ${color.toLowerCase()} de este tipo.`)
  if (ctx.wardrobe.total >= 6 && overall / ctx.wardrobe.total >= 0.3) { wv = Math.max(0, wv - 0.2); wr.push(`${color} ya es el ${Math.round((overall / ctx.wardrobe.total) * 100)} % de tu armario.`) }
  const tones = ctx.wardrobe.light + ctx.wardrobe.dark
  if (tones >= 5) {
    if (LIGHT.has(rawColor) && ctx.wardrobe.light / tones < 0.25) { wv = Math.min(1, wv + 0.15); wr.push('Aporta un tono claro, que escasea en tu armario.') }
    if (DARK.has(rawColor) && ctx.wardrobe.dark / tones > 0.75) { wv = Math.max(0, wv - 0.1); wr.push('Tu armario ya es mayoritariamente oscuro.') }
  }
  // C. Combinabilidad con prendas complementarias reales
  const probe = { category: cat, primary_color: rawColor, formality_level: null, pattern: 'Liso' }
  const comp = ctx.garments.filter((g) => g.category && g.category !== cat)
  const ok = comp.filter((g) => combines(probe, g, c.temp ?? undefined))
  const combinability = { count: ok.length, of: comp.length, value: comp.length ? ok.length / comp.length : null, garmentIds: ok.map((g) => g.id as string) }
  // Mezcla: lo personal pesa más, pero un color saturado no puede ganar solo por favorecer
  const parts: [number, number][] = []
  // Sin colorimetría la parte personal queda neutra (50 %): ni se afirma que favorezca ni se penaliza
  parts.push([personal.value ?? 0.5, 0.55])
  parts.push([wv, 0.3])
  if (combinability.value != null) parts.push([combinability.value, 0.15])
  const total = parts.reduce((s, [, w]) => s + w, 0)
  let value = Math.round((parts.reduce((s, [v, w]) => s + v * w, 0) / total) * 100) / 100
  if (avoided) value = Math.min(value, 0.2)   // un color que evitas no lo compensa ni el armario ni la combinabilidad
  const label: ColorLabel = personal.value == null ? 'sin-datos' : personal.value < 0.5 ? 'poco-compatible' : saturation === 'saturado' ? 'redundante' : personal.value >= 0.75 && wv >= 0.8 ? 'favorable-poco-representado' : wv >= 0.95 ? 'equilibra-el-armario' : 'neutro'
  const reasons = [personal.reason, ...wr, combinability.of ? `Combina con ${combinability.count} de tus ${combinability.of} prendas complementarias.` : 'Aún no hay prendas complementarias para comprobar combinaciones.']
  return { color: rawColor, category: cat, personal, wardrobe: { inCategory, categoryTotal: bc.total, overall, saturation, value: wv, reasons: wr }, combinability, value, label, confidence: personal.confidence, reasons }
}

/** Colores a buscar para una categoría: los que te favorecen y tu armario no tiene saturados (máx. n). */
export function suggestColors(category: string, ctx: ShopperContext, n = 3): string[] {
  if (!ctx.color.temp) return []
  return GARMENT_COLORS.filter((c) => c !== 'Multicolor' && !ctx.color.avoids.includes(pal(c)!) && !ctx.color.avoids.includes(c))
    .map((c) => analyzeColor(c, category, ctx)!).filter((a) => a && a.personal.value != null && a.personal.value >= 0.75 && a.wardrobe.saturation !== 'saturado')
    .sort((a, z) => (z.value ?? 0) - (a.value ?? 0)).slice(0, n).map((a) => a.color)
}
