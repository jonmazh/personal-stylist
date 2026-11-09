import type { Bundle } from '@/lib/profile/data'
import { colorimetry } from '@/lib/profile/blueprint'
import { PALETTES } from '@/lib/color/palette'
import { PALETTE_OF } from '@/lib/style/references'
import { categoryCoverage, occasionCoverage, seasonCoverage, type Use } from '@/lib/wardrobe/audit'
import type { Evaluation } from '@/lib/wardrobe/compatibility'
import { garmentTitle } from '@/lib/wardrobe/display'
import { subOf } from '@/lib/wardrobe/taxonomy'
import type { NeedSpecT, NeedType } from './taxonomy'

/**
 * Shopping Intelligence (fase 4A): detecta necesidades de compra a partir del armario real, la auditoria, el uso y el perfil.
 * Nunca propone «deseos» (eso lo decides tu) ni productos: describe la prenda que falta y por que.
 * Las claves coinciden con las de las necesidades de la auditoria (2D) para enlazarlas y respetar lo que rechazaste.
 */
export interface Detected { key: string; title: string; type: NeedType; spec: NeedSpecT; rationale: string; related_garment_ids: string[]; replaces_garment_id?: string | null }
type G = Record<string, any>
const pal = (c?: string | null) => (c ? PALETTE_OF[c] ?? c : null)
const lc = (s: string) => s.toLowerCase()
const WORK: Record<string, [number, number]> = { 'Muy formal (traje)': [4, 5], 'Smart casual': [3, 4], Casual: [2, 3], Teletrabajo: [1, 3] }
const CUT_OF: Record<string, string> = { Recto: 'Recto', Amplio: 'Wide', Tapered: 'Tapered' }

export function detectNeeds(garments: G[], evals: Map<string, Evaluation>, b: Bundle, use?: Use | null): Detected[] {
  const active = garments.filter((g) => g.wardrobe_status === 'active' && g.decision !== 'donate_sell')
  const temp = colorimetry(b).temp
  const p = temp ? PALETTES[temp] : null
  const avoid = new Set<string>(b.color?.avoids ?? [])
  const wf = WORK[b.life?.work_formality as string] ?? [2, 4]
  const formalWork = wf[0] >= 3
  const prefs = b.fit?.prefs ?? {}
  const climateCold = ['Cuatro estaciones marcadas', 'Frío y húmedo'].includes(b.life?.climate)
  const owned = (cat: string) => new Set(active.filter((g) => g.category === cat).map((g) => pal(g.primary_color)))
  const color = (cat: string, list: string[]) => list.filter((c) => !avoid.has(c)).find((c) => !owned(cat).has(c)) ?? list.find((c) => !avoid.has(c)) ?? null
  const base = (cat: string): NeedSpecT => {
    switch (cat) {
      case 'top': return { category: 'top', subcategory: formalWork ? 'shirt' : 'tee', colors: [color('top', p?.cara ?? ['Blanco', 'Azul claro'])].filter(Boolean) as string[], silhouette: 'Regular', formality_min: wf[0], formality_max: wf[1], seasons: [], occasions: [] }
      case 'bottom': return { category: 'bottom', subcategory: formalWork ? 'trousers' : 'chinos', colors: [color('bottom', p?.inferiores ?? ['Gris', 'Azul marino'])].filter(Boolean) as string[], cut: CUT_OF[prefs.pantalones] ?? 'Recto', formality_min: wf[0], formality_max: wf[1], seasons: [], occasions: [] }
      case 'footwear': return { category: 'footwear', subcategory: formalWork ? 'loafers' : 'sneakers', colors: [color('footwear', ['Marrón', 'Negro', 'Blanco'])].filter(Boolean) as string[], formality_min: wf[0], formality_max: wf[1], seasons: [], occasions: [] }
      case 'outerwear': return { category: 'outerwear', subcategory: climateCold ? 'coat' : 'jacket', colors: [color('outerwear', p?.neutros ?? ['Azul marino', 'Gris'])].filter(Boolean) as string[], formality_min: Math.max(1, wf[0] - 1), formality_max: wf[1], seasons: climateCold ? ['otono', 'invierno'] : ['primavera', 'otono'], occasions: [] }
      default: return { category: cat as never, colors: [], seasons: [], occasions: [] }
    }
  }
  const title = (s: NeedSpecT) => `${subOf(s.subcategory)?.label ?? 'Prenda'}${s.colors[0] ? ` ${lc(s.colors[0])}` : ''}${s.cut ? ` de corte ${lc(s.cut)}` : ''}`
  const out = new Map<string, Detected>()
  const add = (d: Detected) => { if (!out.has(d.key)) out.set(d.key, d) }

  // Ocasiones de tu semana sin cubrir (una necesidad por categoria; deporte, una sola)
  const occ = occasionCoverage(active, b)
  const sport = occ.find((o) => o.occasion === 'deporte' && o.missing.length)
  if (sport) add({ key: 'occ:deporte', title: 'Ropa de deporte', type: 'need', spec: { category: 'sport', colors: [], seasons: [], occasions: ['deporte'] }, rationale: `El deporte es un ${sport.pct} % de tu semana y no tienes prendas para ello.`, related_garment_ids: [] })
  for (const cat of ['top', 'bottom', 'footwear'] as const) {
    const os = occ.filter((o) => o.occasion !== 'deporte' && o.missing.includes(cat))
    if (!os.length) continue
    const spec = { ...base(cat), occasions: os.map((o) => o.occasion) as never }
    add({ key: `occ:${cat}`, title: title(spec), type: 'need', spec, rationale: os.map((o) => `Para ${o.label} (${o.pct} % de tu semana) no tienes ${cat === 'footwear' ? 'calzado adecuado' : cat === 'bottom' ? 'parte inferior adecuada' : 'parte superior adecuada'}.`).join(' '), related_garment_ids: [] })
  }
  // Categorias sin prendas o con poca variedad
  for (const c of categoryCoverage(active, evals, b)) {
    if (c.status !== 'Sin prendas' && c.status !== 'Falta variedad') continue
    if (out.has(`occ:${c.id}`)) continue
    const spec = base(c.id)
    add({ key: `cat:${c.id}`, title: title(spec), type: 'need', spec, rationale: `${c.label}: ${lc(c.status)}. ${c.why}`, related_garment_ids: active.filter((g) => g.category === c.id).map((g) => g.id) })
  }
  // Temporadas sin cubrir segun tu clima
  for (const s of seasonCoverage(active, b)) {
    if ([...out.values()].some((d) => d.spec.category === s.group)) continue
    const spec = { ...base(s.group), seasons: (s.key === 'winter-outer' ? ['otono', 'invierno'] : s.key === 'summer-top' ? ['verano'] : ['primavera', 'otono']) as never }
    add({ key: `season:${s.key}`, title: s.need, type: 'need', spec, rationale: s.why, related_garment_ids: [] })
  }
  // Sustituciones: prendas marcadas para sustituir, dañadas, o desgastadas que usas
  for (const g of garments.filter((x) => x.wardrobe_status === 'active')) {
    const worn = use?.per.get(g.id)?.count ?? 0
    const why = g.decision === 'replace' ? 'La marcaste para sustituir.' : g.condition === 'danado' ? 'Está dañada.' : g.condition === 'desgastado' && (worn >= 3 || g.is_favorite) ? `Está desgastada y la usas${worn ? ` (${worn} veces registradas)` : ' (es favorita)'}.` : null
    if (!why) continue
    const spec: NeedSpecT = { category: g.category, subcategory: g.subcategory ?? null, colors: g.primary_color && !avoid.has(pal(g.primary_color)!) ? [g.primary_color] : [], cut: g.cut ?? null, silhouette: g.silhouette ?? null, formality_min: g.formality_level ?? null, formality_max: g.formality_level ?? null, seasons: g.seasons ?? [], occasions: g.occasions ?? [] }
    add({ key: `repl:${g.id}`, title: `Sustituir «${garmentTitle(g)}»`, type: 'replacement', spec, rationale: `${why} Una prenda equivalente mantendría las combinaciones que ya haces con ella.`, related_garment_ids: [g.id], replaces_garment_id: g.id })
  }
  // Mejoras: prendas que usas (o favoritas) que encajan poco contigo
  for (const g of active) {
    const e = evals.get(g.id), worn = use?.per.get(g.id)?.count ?? 0
    if (e?.compat.score == null || e.compat.score >= 5.5 || (!g.is_favorite && worn < 3) || out.has(`repl:${g.id}`)) continue
    const weak = e.compat.criteria.filter((c) => c.score != null && c.id !== 'info').sort((a, z) => (a.score ?? 0) - (z.score ?? 0))[0]
    const spec = { ...base(g.category), subcategory: g.subcategory ?? null, occasions: g.occasions ?? [], seasons: g.seasons ?? [] }
    add({ key: `impr:${g.id}`, title: `Mejor alternativa a «${garmentTitle(g)}»`, type: 'improvement', spec, rationale: `La ${worn ? `usas a menudo (${worn} veces)` : 'tienes como favorita'}, pero encaja poco contigo (compatibilidad ${e.compat.score.toLocaleString('es-ES')}/10${weak ? `; lo que menos: ${lc(weak.label)}` : ''}). Una versión con ${spec.colors[0] ? `color ${lc(spec.colors[0])}` : 'otro color'}${spec.cut ? ` y corte ${lc(spec.cut)}` : ''} funcionaría mejor.`, related_garment_ids: [g.id] })
  }
  return [...out.values()]
}
