import { createHash } from 'node:crypto'
import type { Bundle } from '@/lib/profile/data'
import { colorimetry, silhouette } from '@/lib/profile/blueprint'
import { PALETTES } from '@/lib/color/palette'
import { PALETTE_OF } from '@/lib/style/references'
import { styleProfileOf } from '@/lib/style/dna'
import type { Evaluation } from '@/lib/wardrobe/compatibility'
import type { Signals } from '@/lib/outfits/learning'

/**
 * Personal Shopper Context: todo lo que el motor de compra sabe de ti ANTES de buscar, reunido una vez por búsqueda
 * desde lo que ya existe (Style Blueprint, colorimetría, Body & Fit, identidad estética, armario, uso, aprendizaje y
 * necesidades). No inventa: lo que falta queda como desconocido y baja la confianza.
 */
type G = Record<string, any>
export type Conf = 'alta' | 'media' | 'baja'
export const pal = (c?: string | null) => (c ? PALETTE_OF[c] ?? c : null)
export const LIGHT = new Set(['Blanco', 'Crudo', 'Beige', 'Gris claro', 'Azul claro', 'Denim claro', 'Rosa', 'Lila', 'Camel'])
export const DARK = new Set(['Negro', 'Azul marino', 'Antracita', 'Marrón', 'Denim', 'Verde bosque', 'Burdeos'])

export interface ShopperContext {
  bundle: Bundle; garments: G[]; evals: Map<string, Evaluation>; signals?: Signals; needs: G[]; prefs: G | null; now: Date
  color: { temp: string | null; source: string | null; confidence: Conf | null; contrast: string | null; depth: string | null; intensity: string | null; likes: string[]; avoids: string[]; favorable: string[] }
  wardrobe: { total: number; colors: Record<string, number>; byCategory: Record<string, { total: number; colors: Record<string, number> }>; light: number; dark: number; mostWorn: string[]; leastWorn: string[] }
  fit: { general: string | null; prefs: Record<string, string>; silhouette: ReturnType<typeof silhouette>; neverWear: string | null; confidence: Conf | null }
  style: { source: string; influences: { style: string; weight: number }[]; liked: string[]; rejected: string[]; brands: string[]; confidence: Conf | null }
  completeness: { color: number; fit: number; style: number; wardrobe: number }
  hash: string
}

export function buildShopperContext(input: { bundle: Bundle; garments: G[]; evals: Map<string, Evaluation>; signals?: Signals; needs?: G[]; prefs?: G | null; use?: { tracked: boolean; per: Map<string, { count: number }> } | null; now?: Date }): ShopperContext {
  const b = input.bundle
  const active = input.garments.filter((g) => g.wardrobe_status === 'active' && g.decision !== 'donate_sell')
  const col = colorimetry(b)
  const colorConf: Conf | null = !col.temp ? null : col.tempSource === 'validado' || (col.tempSource === 'declarado' && b.validated?.a3) ? 'alta' : col.tempSource === 'declarado' ? 'media' : 'baja'
  const p = col.temp ? PALETTES[col.temp as keyof typeof PALETTES] : null
  const favorable = p ? [...new Set([...p.cara, ...p.neutros, ...p.acentos, ...p.inferiores])] : []
  const colors: Record<string, number> = {}, byCategory: Record<string, { total: number; colors: Record<string, number> }> = {}
  let light = 0, dark = 0
  for (const g of active) {
    const c = pal(g.primary_color)
    const cat = (byCategory[g.category ?? '—'] ??= { total: 0, colors: {} }); cat.total++
    if (!c) continue
    colors[c] = (colors[c] ?? 0) + 1; cat.colors[c] = (cat.colors[c] ?? 0) + 1
    if (LIGHT.has(g.primary_color)) light++; else if (DARK.has(g.primary_color)) dark++
  }
  // Uso real solo si hay registro suficiente (auditoría 2D); si no, no se concluye nada
  const per = input.use?.tracked ? new Map([...input.use.per].map(([k, v]) => [k, v.count])) : null
  const worn = per ? [...active].sort((a, z) => (per.get(z.id) ?? 0) - (per.get(a.id) ?? 0)) : []
  const sil = silhouette(b)
  const prefs: Record<string, string> = b.fit?.prefs ?? {}
  const sp = styleProfileOf(b)
  const ctx: Omit<ShopperContext, 'hash'> = {
    bundle: b, garments: active, evals: input.evals, signals: input.signals, needs: input.needs ?? [], prefs: input.prefs ?? null, now: input.now ?? new Date(),
    color: { temp: col.temp ?? null, source: col.tempSource ?? null, confidence: colorConf, contrast: col.contrast ?? null, depth: col.depth ?? null, intensity: col.intensity ?? null, likes: b.color?.likes ?? [], avoids: b.color?.avoids ?? [], favorable },
    wardrobe: { total: active.length, colors, byCategory, light, dark, mostWorn: per ? worn.slice(0, 5).filter((g) => (per.get(g.id) ?? 0) > 0).map((g) => g.id) : [], leastWorn: per ? worn.slice(-5).filter((g) => !(per.get(g.id) ?? 0)).map((g) => g.id) : [] },
    fit: { general: b.profile?.fit_pref ?? null, prefs, silhouette: sil, neverWear: b.style?.never_wear || null, confidence: b.validated?.a6 && sil ? 'alta' : Object.keys(prefs).length || b.profile?.fit_pref ? 'media' : null },
    style: { source: sp.identity.source, influences: sp.identity.influences.map((i) => ({ style: i.style, weight: i.weight })), liked: sp.elements.liked.map((e) => e.element), rejected: sp.elements.rejected.map((e) => e.element), brands: sp.declared.brands, confidence: sp.identity.source === 'declarada' ? (b.validated?.a4 ? 'alta' : 'media') : sp.identity.source === 'ninguna' ? null : 'baja' },
    completeness: {
      color: [col.temp, col.contrast, col.depth, col.intensity, (b.color?.likes ?? []).length || (b.color?.avoids ?? []).length].filter(Boolean).length / 5,
      fit: [b.profile?.fit_pref, Object.keys(prefs).length, sil, b.validated?.a6].filter(Boolean).length / 4,
      style: [sp.identity.source !== 'ninguna', sp.elements.liked.length || sp.elements.rejected.length, b.validated?.a4].filter(Boolean).length / 3,
      wardrobe: Math.min(1, active.length / 15),
    },
  }
  // Huella del perfil y del armario: si cambian, las evaluaciones guardadas en caché dejan de valer
  const hash = createHash('sha256').update(JSON.stringify([ctx.color, ctx.fit.general, prefs, sil, ctx.fit.neverWear, ctx.style.influences, ctx.style.liked, ctx.style.rejected,
    active.map((g) => `${g.id}:${g.updated_at ?? ''}:${g.primary_color}:${g.cut}:${g.decision ?? ''}`).sort(), (input.needs ?? []).map((n) => `${n.id}:${n.priority_level}:${n.user_priority}:${n.status}`).sort(), b.life])).digest('hex').slice(0, 16)
  return { ...ctx, hash }
}
