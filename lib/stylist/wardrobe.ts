import { createHash } from 'node:crypto'
import type { Bundle } from '@/lib/profile/data'
import { garmentElements, type Evaluation } from '@/lib/wardrobe/compatibility'
import { ELEMENTS, elementLabel, styleById, styleName, STYLE_CATALOG } from '@/lib/style/catalog'
import { styleProfileOf } from '@/lib/style/dna'
import { duplicateGroups, occasionCoverage, usageStats } from '@/lib/wardrobe/audit'
import { garmentTitle } from '@/lib/wardrobe/display'
import { familyOf } from '@/lib/wardrobe/taxonomy'
import { simulateOutfits } from '@/lib/shopping/priority'
import { buildShopperContext } from '@/lib/shopping/intelligence/context'
import { analyzeColor } from '@/lib/shopping/intelligence/color'
import type { Signals } from '@/lib/outfits/learning'

/**
 * Personal Shopper 2.0 · 2.0B — Diagnóstico estratégico del armario.
 * Lee el armario COMO CONJUNTO (no como una lista de categorías): qué estética transmite frente a la identidad que
 * buscas, qué siluetas y proporciones predominan en los conjuntos reales que forma el Outfit Engine, qué colores usas y
 * cuáles te favorecen, formalidad, materiales, redundancias, prendas con potencial infrautilizadas y prendas aisladas.
 * Reutiliza Style DNA, la auditoría, el Outfit Engine y Color Intelligence (no duplica ninguno). Es DETERMINISTA y cada
 * hallazgo lleva sus evidencias, la confianza y lo que falta. Los hallazgos son diagnósticos e HIPÓTESIS ESTILÍSTICAS
 * (no tendencias ni compras): el Style Strategy Engine (2.0D) decidirá qué oportunidades merece la pena desarrollar.
 */
export const WARDROBE_ANALYSIS_VERSION = 'wardrobe-strategy@1'
type G = Record<string, any>
type Conf = 'alta' | 'media' | 'baja'

export const EXPERIMENTATION = ['Conservador', 'Abierto', 'Explorador'] as const
export type Experimentation = (typeof EXPERIMENTATION)[number]

export type FindingKind = 'aesthetic_gap' | 'identity_conflict' | 'silhouette_gap' | 'proportion_monotony' | 'color_monotony' | 'color_unfavorable'
  | 'formality_gap' | 'texture_flat' | 'redundancy' | 'underused_potential' | 'island' | 'strength'
export const FINDING_LABEL: Record<FindingKind, string> = {
  aesthetic_gap: 'Distancia con tu identidad', identity_conflict: 'Elementos que frenan tu estilo', silhouette_gap: 'Silueta que falta',
  proportion_monotony: 'Proporciones repetidas', color_monotony: 'Paleta sin matices', color_unfavorable: 'Colores poco favorables cerca de la cara',
  formality_gap: 'Ocasiones sin resolver', texture_flat: 'Texturas planas', redundancy: 'Prendas que se solapan', underused_potential: 'Potencial sin aprovechar',
  island: 'Prendas aisladas', strength: 'Lo que ya funciona',
}
export interface StrategicFinding {
  key: string; kind: FindingKind; title: string; diagnosis: string
  /** Pista de dirección (hipótesis estilística, no una compra ni una tendencia). */
  direction: string | null
  evidence: { garment_ids: string[]; facts: string[] }
  data_used: string[]; missing: string[]; confidence: Conf; weight: number
}

// ── Silueta corporal → cortes que la favorecen (versión estructurada de «Cortes que funcionan» del Style Blueprint) ──
const BODY_LEGS: Record<string, string[]> = { v: ['Recto', 'Wide'], equilibrada: ['Recto', 'Wide', 'Slim', 'Tapered'], recta: ['Recto', 'Slim'], cintura: ['Recto', 'Wide'] }
const BODY_TOPS: Record<string, string[]> = { v: ['Regular'], equilibrada: ['Regular', 'Ajustada', 'Amplia'], recta: ['Ajustada', 'Regular'], cintura: ['Regular'] }
const LEG_EL: Record<string, string> = { Slim: 'leg-slim', Recto: 'leg-straight', Wide: 'leg-wide', Amplia: 'leg-baggy' }
const EL_LEG: Record<string, string> = { 'leg-slim': 'Slim', 'leg-straight': 'Recto', 'leg-wide': 'Wide', 'leg-baggy': 'Amplia' }
const CUT_LABEL: Record<string, string> = { Slim: 'slim', Recto: 'recto', Wide: 'amplio (wide)', Tapered: 'tapered', Amplia: 'holgado' }
const TOP_EL: Record<string, string> = { Amplia: 'top-oversize', Ajustada: 'top-fitted' }
const EL_TOP: Record<string, string> = { 'top-oversize': 'Amplia', 'top-fitted': 'Ajustada' }
const SIL_LABEL: Record<string, string> = { Amplia: 'holgada u oversize', Ajustada: 'ajustada', Regular: 'regular' }
const NEUTRALS = new Set(['Negro', 'Blanco', 'Gris', 'Azul marino', 'Beige', 'Camel', 'Marrón', 'Crudo', 'Antracita', 'Gris claro', 'Denim', 'Denim claro', 'Caqui'])
const TEXTURED = /lana|wool|lino|linen|ante|suede|pana|corduroy|cachemir|cashmere|merino|alpaca|mohair|piel|leather|tweed|franela|flannel|punto|knit|seersucker|boucl/i
const DERIVABLE = new Set(ELEMENTS.filter((e) => ['Silueta', 'Prendas', 'Calzado', 'Complementos'].includes(e.group)).map((e) => e.id as string).concat(['technical', 'layers']))
const pct = (x: number) => `${Math.round(x * 100)} %`
const lc = (s: string) => s.toLowerCase()
const count = <T extends string>(xs: T[]) => xs.reduce((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {} as Record<string, number>)
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const top = (m: Record<string, number>) => Object.entries(m).sort((a, z) => z[1] - a[1])
const cutOf = (g: G) => g.cut ?? (g.silhouette === 'Amplia' ? 'Amplia' : null)

export interface WardrobeAnalysisInput { garments: G[]; evals: Map<string, Evaluation>; bundle: Bundle; signals?: Signals; wears?: { worn_on: string; garment_ids: string[] }[]; now?: Date; maxSimulated?: number }

export function analyzeWardrobe(input: WardrobeAnalysisInput) {
  const now = input.now ?? new Date()
  const b = input.bundle
  const active = input.garments.filter((g) => g.wardrobe_status === 'active' && g.decision !== 'donate_sell')
  const sp = styleProfileOf(b)
  const ctx = buildShopperContext({ bundle: b, garments: active, evals: input.evals })
  const use = usageStats(active, input.wears ?? [], now)
  const experimentation = (EXPERIMENTATION as readonly string[]).includes(b.goals?.experimentation) ? b.goals!.experimentation as Experimentation : null
  const findings: StrategicFinding[] = []
  const limitations: string[] = []
  const add = (f: Omit<StrategicFinding, 'title'> & { title?: string }) => findings.push({ title: f.title ?? FINDING_LABEL[f.kind], ...f } as StrategicFinding)
  const title = (id: string) => garmentTitle(active.find((g) => g.id === id) ?? { name: 'prenda' })

  // ── 1. Estética que transmite el armario frente a tu identidad ──
  const elOf = new Map(active.map((g) => [g.id as string, garmentElements(g)]))
  const elCount = count([...elOf.values()].flat())
  const present = new Set(Object.keys(elCount))
  const styleRead = STYLE_CATALOG.map((s) => {
    const own = s.elements.filter((e) => DERIVABLE.has(e))
    const hit = own.filter((e) => present.has(e))
    return { style: s.id, name: s.name, score: own.length ? hit.length / own.length : 0, hits: hit, missing: own.filter((e) => !present.has(e)) }
  }).filter((x) => x.score > 0).sort((a, z) => z.score - a.score || z.hits.length - a.hits.length)
  const transmits = styleRead.slice(0, 3).filter((x) => x.score >= 0.34)
  const identity = sp.identity.influences.slice(0, 3)
  const rejected = new Set(sp.elements.rejected.map((e) => e.element))
  const liked = new Set(sp.elements.liked.map((e) => e.element))
  const coherence = identity.length ? identity.reduce((s, i) => s + (styleRead.find((r) => r.style === i.style)?.score ?? 0) * i.weight, 0) / identity.reduce((s, i) => s + i.weight, 0) : null
  if (!identity.length) limitations.push('Sin identidad estética (declarada o propuesta): no puedo medir la distancia entre lo que tienes y lo que buscas.')
  for (const i of identity.filter((x) => x.role !== 'influencia' || x.weight >= 20)) {
    const r = styleRead.find((x) => x.style === i.style)
    const def = styleById(i.style); if (!def) continue
    const missing = def.elements.filter((e) => DERIVABLE.has(e) && !present.has(e) && !rejected.has(e))
    if (!missing.length || (r?.score ?? 0) >= 0.75) continue
    add({
      key: `aesthetic:${i.style}`, kind: 'aesthetic_gap', title: `Tu armario se queda lejos de ${def.name}`,
      diagnosis: `${def.name} es ${i.role === 'principal' ? 'tu estilo principal' : 'una de tus influencias'} (${i.weight} %), pero tu armario solo tiene ${pct(r?.score ?? 0)} de sus rasgos. Faltan: ${missing.slice(0, 5).map((e) => lc(elementLabel(e))).join(', ')}.`,
      direction: `Incorporar con criterio ${missing.slice(0, 2).map((e) => lc(elementLabel(e))).join(' o ')} acercaría lo que vistes a la imagen que buscas.`,
      evidence: { garment_ids: [], facts: [`Rasgos de ${def.name}: ${def.elements.filter((e) => DERIVABLE.has(e)).map((e) => lc(elementLabel(e))).join(', ')}`, `Presentes en tu armario: ${(r?.hits ?? []).map((e) => lc(elementLabel(e))).join(', ') || 'ninguno'}`] },
      data_used: [`Identidad ${sp.identity.source}`, 'Prendas activas traducidas a rasgos de estilo'], missing: [],
      confidence: sp.identity.source === 'declarada' ? 'alta' : 'media', weight: i.role === 'principal' ? 9 : 6,
    })
  }
  const conflicting = active.filter((g) => elOf.get(g.id)!.some((e) => rejected.has(e)))
  if (conflicting.length) add({
    key: 'identity-conflict', kind: 'identity_conflict',
    diagnosis: `${conflicting.length} prenda${conflicting.length === 1 ? '' : 's'} tiene${conflicting.length === 1 ? '' : 'n'} rasgos que dices evitar (${[...new Set(conflicting.flatMap((g) => elOf.get(g.id)!.filter((e) => rejected.has(e))))].map((e) => lc(elementLabel(e))).join(', ')}).`,
    direction: 'Si las sigues usando, conviene combinarlas con piezas que refuercen tu identidad; no hace falta sustituirlas.',
    evidence: { garment_ids: conflicting.map((g) => g.id), facts: conflicting.slice(0, 4).map((g) => garmentTitle(g)) }, data_used: ['Rasgos que rechazas (Style DNA)'], missing: [], confidence: 'media', weight: 4,
  })

  // ── 2. Siluetas: distribución y silueta que falta aunque la categoría esté cubierta ──
  const sil = ctx.fit.silhouette
  const bottoms = active.filter((g) => familyOf(g.subcategory, g.category) === 'bottom' && g.subcategory !== 'shorts')
  const tops = active.filter((g) => ['top', 'shirt'].includes(familyOf(g.subcategory, g.category)))
  const legDist = count(bottoms.map(cutOf).filter(Boolean) as string[])
  const topDist = count(tops.map((g) => g.silhouette).filter(Boolean) as string[])
  const legKnown = Object.values(legDist).reduce((s, x) => s + x, 0), topKnown = Object.values(topDist).reduce((s, x) => s + x, 0)
  if (bottoms.length && legKnown / bottoms.length < 0.6) limitations.push(`Solo ${legKnown} de ${bottoms.length} pantalones tienen el corte indicado: el análisis de siluetas es parcial.`)
  const identityEls = new Set<string>(identity.flatMap((i) => (styleById(i.style)?.elements ?? []) as string[]))
  const bodyAllows = (cut: string, kind: 'leg' | 'top') => (sil ? (kind === 'leg' ? BODY_LEGS : BODY_TOPS)[sil.shape]?.includes(cut) ?? true : null)
  const silhouetteGap = (kind: 'leg' | 'top', items: G[], dist: Record<string, number>, known: number) => {
    if (items.length < 3 || known < 3) return
    const [domCut, domN] = top(dist)[0] ?? []
    if (!domCut || domN / known < 0.7) return
    const toEl = kind === 'leg' ? EL_LEG : EL_TOP
    const candidates = Object.keys(toEl).filter((el) => toEl[el] !== domCut && !(dist[toEl[el]] ?? 0) && !rejected.has(el) && (identityEls.has(el) || liked.has(el)))
    for (const el of candidates.slice(0, 2)) {
      const cut = toEl[el]
      const body = bodyAllows(cut, kind)
      if (body === false) continue
      const label = kind === 'leg' ? CUT_LABEL[cut] : SIL_LABEL[cut]
      const why = [identityEls.has(el) ? `forma parte de ${identity.filter((i) => (styleById(i.style)?.elements as string[] | undefined)?.includes(el)).map((i) => styleName(i.style)).join(' y ')}` : null, liked.has(el) ? 'está entre los rasgos que te gustan' : null].filter(Boolean)
      add({
        key: `silhouette:${kind}:${cut}`, kind: 'silhouette_gap', title: kind === 'leg' ? `Te falta un pantalón ${label}` : `Te falta una parte de arriba ${label}`,
        diagnosis: `Tienes ${items.length} ${kind === 'leg' ? 'pantalones' : 'prendas de arriba'} y ${domN} de ${known} son de corte ${kind === 'leg' ? CUT_LABEL[domCut] : SIL_LABEL[domCut]}: la categoría está cubierta, pero la silueta no varía. Un corte ${label} ${why.join(' y ')}.`,
        direction: `Introducir una silueta ${label} cambiaría las proporciones de tus conjuntos sin cambiar tu identidad.`,
        evidence: { garment_ids: items.filter((g) => (kind === 'leg' ? cutOf(g) : g.silhouette) === domCut).map((g) => g.id), facts: [`Distribución: ${top(dist).map(([c, n]) => `${kind === 'leg' ? CUT_LABEL[c] : SIL_LABEL[c]} ${n}`).join(', ')}`, body ? `Tu silueta (${sil!.shape}) admite este corte` : 'Sin medidas: no puedo confirmar que te favorezca'] },
        data_used: ['Corte o silueta de tus prendas', 'Identidad estética', sil ? 'Silueta calculada con tus medidas' : ''].filter(Boolean), missing: sil ? [] : ['Pecho y cintura (para confirmar que el corte te favorece)'],
        confidence: body && sp.identity.source === 'declarada' ? 'alta' : body === null ? 'baja' : 'media', weight: 8,
      })
    }
  }
  silhouetteGap('leg', bottoms, legDist, legKnown)
  silhouetteGap('top', tops, topDist, topKnown)

  // ── 3. Conjuntos reales (Outfit Engine): combinabilidad, proporciones, prendas aisladas ──
  const simulable = active.filter((g) => !['accessories'].includes(g.category)).slice(0, input.maxSimulated ?? 60)
  const partners = new Map<string, Set<string>>(simulable.map((g) => [g.id as string, new Set<string>()]))
  const outfits = new Map<string, { ids: string[]; sig: string }>()
  for (const g of simulable) {
    let cands: ReturnType<typeof simulateOutfits> = []
    try { cands = simulateOutfits(g, active, { bundle: b, evals: input.evals, signals: input.signals, now }, g.seasons ?? []) } catch { /* sin conjuntos para esta prenda */ }
    for (const c of cands) {
      const ids = c.items.map((s) => s.g.id as string)
      for (const id of ids) if (id !== g.id) partners.get(g.id)?.add(id)
      const k = [...ids].sort().join(',')
      if (outfits.has(k)) continue
      const topG = c.items.find((s) => s.role === 'top_base')?.g, botG = c.items.find((s) => s.g.category === 'bottom')?.g
      outfits.set(k, { ids, sig: `${topG?.silhouette ?? '?'}|${botG ? cutOf(botG) ?? '?' : '?'}` })
    }
  }
  const sigs = [...outfits.values()].map((o) => o.sig).filter((s) => !s.includes('?'))
  const sigDist = count(sigs)
  const [domSig, domSigN] = top(sigDist)[0] ?? []
  if (domSig && sigs.length >= 8 && domSigN / sigs.length >= 0.6) {
    const [t, l] = domSig.split('|')
    add({
      key: 'proportion-monotony', kind: 'proportion_monotony',
      diagnosis: `De ${sigs.length} conjuntos válidos que forma tu armario, ${pct(domSigN / sigs.length)} repiten la misma proporción: arriba ${SIL_LABEL[t] ?? t} con pantalón ${CUT_LABEL[l] ?? l}. Tus conjuntos se parecen demasiado entre sí.`,
      direction: 'Una pieza que cambie la relación entre arriba y abajo (más volumen en una parte, o una capa con otra estructura) multiplicaría la variedad real, no solo el número de prendas.',
      evidence: { garment_ids: [], facts: top(sigDist).slice(0, 4).map(([s, n]) => { const [a, z] = s.split('|'); return `Arriba ${SIL_LABEL[a] ?? a} + pantalón ${CUT_LABEL[z] ?? z}: ${n}` }) },
      data_used: ['Conjuntos generados y validados por el Outfit Engine con tus prendas'], missing: [], confidence: sigs.length >= 20 ? 'alta' : 'media', weight: 8,
    })
  }
  const islands = simulable.filter((g) => !['footwear'].includes(g.category) && (partners.get(g.id)?.size ?? 0) === 0)
  if (islands.length) add({
    key: 'islands', kind: 'island',
    diagnosis: `${islands.length} prenda${islands.length === 1 ? ' no forma' : 's no forman'} ningún conjunto válido con el resto de tu armario: ${islands.slice(0, 4).map(garmentTitle).join(', ')}.`,
    direction: 'Una pieza puente (que combine con ellas y con tu base) las activaría; si no te representan, quizá sobran.',
    evidence: { garment_ids: islands.map((g) => g.id), facts: islands.map((g) => `${garmentTitle(g)}: 0 conjuntos`) }, data_used: ['Outfit Engine'], missing: [], confidence: 'media', weight: 5,
  })

  // ── 4. Potencial infrautilizado y fortalezas ──
  const combos = (id: string) => partners.get(id)?.size ?? 0
  if (use.tracked) {
    const low = new Set([...use.unused, ...use.dormant].map((x) => x.id))
    const under = active.filter((g) => low.has(g.id) && combos(g.id) >= 4).sort((a, z) => combos(z.id) - combos(a.id))
    if (under.length) add({
      key: 'underused', kind: 'underused_potential',
      diagnosis: `Tienes prendas con mucho potencial que casi no usas: ${under.slice(0, 4).map((g) => `${garmentTitle(g)} (combina con ${combos(g.id)})`).join(', ')}.`,
      direction: 'Antes de comprar, merece la pena construir conjuntos con ellas: el armario ya resuelve parte de lo que buscas.',
      evidence: { garment_ids: under.map((g) => g.id), facts: under.slice(0, 4).map((g) => `${garmentTitle(g)}: ${use.per.get(g.id)?.count ?? 0} usos registrados`) }, data_used: ['Registro de uso', 'Outfit Engine'], missing: [], confidence: 'alta', weight: 6,
    })
  } else limitations.push('Sin registro de uso suficiente: no puedo distinguir las prendas infrautilizadas.')
  const core = simulable.filter((g) => combos(g.id) >= 6).sort((a, z) => combos(z.id) - combos(a.id)).slice(0, 5)
  if (core.length) add({
    key: 'strength-core', kind: 'strength', title: 'Tu base funciona',
    diagnosis: `Estas prendas articulan tu armario: ${core.map((g) => `${garmentTitle(g)} (${combos(g.id)})`).join(', ')}.`, direction: null,
    evidence: { garment_ids: core.map((g) => g.id), facts: [] }, data_used: ['Outfit Engine'], missing: [], confidence: 'alta', weight: 2,
  })

  // ── 5. Color: paleta, matices y colores poco favorables cerca de la cara ──
  const colors = count(active.map((g) => g.primary_color).filter(Boolean) as string[])
  const totalC = Object.values(colors).reduce((s, x) => s + x, 0)
  const neutralShare = totalC ? active.filter((g) => NEUTRALS.has(g.primary_color)).length / totalC : 0
  const identityPalette = [...new Set(identity.flatMap((i) => styleById(i.style)?.palette ?? []))].filter((c) => !NEUTRALS.has(c))
  if (totalC >= 8 && neutralShare >= 0.85) {
    const favorableAccents = ctx.color.temp ? identityPalette.filter((c) => (analyzeColor(c, 'top', ctx)?.personal.value ?? 0) >= 0.75) : []
    add({
      key: 'color-monotony', kind: 'color_monotony',
      diagnosis: `${pct(neutralShare)} de tu armario son neutros (${top(colors).slice(0, 4).map(([c, n]) => `${lc(c)} ${n}`).join(', ')}). Es una base sólida, pero sin ningún color que dé profundidad.`,
      direction: favorableAccents.length ? `Un acento que te favorece y encaja con tu identidad: ${favorableAccents.slice(0, 3).map(lc).join(', ')}.` : 'Un color de acento o una textura con relieve daría profundidad sin perder coherencia.',
      evidence: { garment_ids: [], facts: [`Neutros: ${pct(neutralShare)}`] }, data_used: ['Colores de tus prendas', ctx.color.temp ? 'Colorimetría' : ''].filter(Boolean),
      missing: ctx.color.temp ? [] : ['Tu colorimetría (para elegir un acento que te favorezca)'], confidence: ctx.color.temp ? 'media' : 'baja', weight: 5,
    })
  }
  if (ctx.color.temp) {
    const nearFace = active.filter((g) => ['top', 'outerwear', 'tailoring'].includes(g.category) && g.primary_color)
    const poor = nearFace.filter((g) => { const a = analyzeColor(g.primary_color, g.category, ctx); return a && a.personal.value != null && a.personal.value < 0.5 })
    if (nearFace.length >= 4 && poor.length / nearFace.length >= 0.4) add({
      key: 'color-unfavorable', kind: 'color_unfavorable',
      diagnosis: `${poor.length} de ${nearFace.length} prendas que van cerca de la cara tienen colores que te favorecen poco (${[...new Set(poor.map((g) => lc(g.primary_color)))].join(', ')}).`,
      direction: 'Desplazar poco a poco la parte de arriba hacia tu paleta tendría más impacto en tu imagen que cualquier pieza nueva de abajo.',
      evidence: { garment_ids: poor.map((g) => g.id), facts: [] }, data_used: ['Colorimetría', 'Colores de tus prendas'], missing: [], confidence: ctx.color.confidence ?? 'baja', weight: 6,
    })
  } else limitations.push('Sin colorimetría: no puedo valorar qué colores te favorecen.')

  // ── 6. Formalidad y ocasiones reales ──
  const formality = count(active.map((g) => g.formality_level).filter((x) => x != null).map(String))
  for (const o of occasionCoverage(active, b).filter((x) => !x.covered && x.pct >= 15)) add({
    key: `occasion:${o.occasion}`, kind: 'formality_gap', title: `${cap(o.label)}: sin resolver`,
    diagnosis: `${cap(o.label)} es el ${o.pct} % de tu vida y no tienes ${o.missing.map((m) => (m === 'top' ? 'parte de arriba' : m === 'bottom' ? 'pantalón' : 'calzado')).join(' ni ')} adecuado para ello.`,
    direction: null, evidence: { garment_ids: [], facts: [] }, data_used: ['Estilo de vida', 'Ocasiones y formalidad de tus prendas'], missing: [], confidence: 'media', weight: 7,
  })

  // ── 7. Materiales y texturas ──
  const withMat = active.filter((g) => g.confirmed_composition || g.apparent_material)
  if (withMat.length >= Math.max(4, active.length * 0.5)) {
    const textured = withMat.filter((g) => TEXTURED.test(`${g.confirmed_composition ?? ''} ${g.apparent_material ?? ''}`) || ['knit', 'cardigan', 'turtleneck'].includes(g.subcategory))
    if (textured.length / withMat.length < 0.2) add({
      key: 'texture-flat', kind: 'texture_flat',
      diagnosis: `Solo ${textured.length} de ${withMat.length} prendas con material conocido aportan textura (lana, lino, ante, pana, punto…). El resto son tejidos lisos.`,
      direction: 'Introducir textura (punto grueso, lana, ante, pana) da profundidad a conjuntos sencillos sin añadir color.',
      evidence: { garment_ids: textured.map((g) => g.id), facts: [] }, data_used: ['Composición o material aparente'], missing: [], confidence: withMat.length / active.length >= 0.8 ? 'media' : 'baja', weight: 4,
    })
  } else limitations.push('Pocas prendas con material indicado: no valoro las texturas.')

  // ── 8. Redundancias funcionales (auditoría) ──
  for (const grp of duplicateGroups(active, input.evals)) {
    const ids = (grp as { members?: G[] }).members?.map((m) => m.id) ?? (grp as { ids?: string[] }).ids ?? []
    if (ids.length < 2) continue
    add({
      key: `dup:${[...ids].sort().join(',')}`, kind: 'redundancy',
      diagnosis: `${ids.map(title).join(', ')} cumplen prácticamente la misma función.`,
      direction: 'Más prendas de este tipo no añadirían variedad: la evolución está en otras siluetas o materiales.',
      evidence: { garment_ids: ids, facts: [] }, data_used: ['Similitud entre prendas (auditoría)'], missing: [], confidence: 'alta', weight: 3,
    })
  }

  // ── Resumen y huella ──
  findings.sort((a, z) => z.weight - a.weight)
  const summary = [
    transmits.length ? `Tu armario transmite sobre todo ${transmits.map((t) => t.name).join(', ')}.` : 'Tu armario no tiene todavía una estética definida en el catálogo de estilos.',
    identity.length ? `Tu identidad apunta a ${identity.map((i) => `${styleName(i.style)} (${i.weight} %)`).join(', ')}; coherencia actual ${pct(coherence ?? 0)}.` : null,
    legKnown ? `Pantalones: ${top(legDist).map(([c, n]) => `${CUT_LABEL[c] ?? c} ${n}`).join(', ')}.` : null,
    outfits.size ? `El Outfit Engine forma ${outfits.size} conjuntos válidos distintos con tus prendas.` : null,
    experimentation ? `Grado de experimentación: ${lc(experimentation)}.` : 'Sin grado de experimentación indicado (se asume abierto).',
  ].filter(Boolean).join(' ')
  return {
    version: WARDROBE_ANALYSIS_VERSION, generated_at: now.toISOString(), summary, experimentation,
    counts: { active: active.length, bottoms: bottoms.length, tops: tops.length, outfits: outfits.size, simulated: simulable.length },
    aesthetic: { transmits: transmits.map((t) => ({ style: t.style, name: t.name, score: Math.round(t.score * 100) })), identity: identity.map((i) => ({ style: i.style, name: styleName(i.style), weight: i.weight, role: i.role, wardrobe_score: Math.round((styleRead.find((r) => r.style === i.style)?.score ?? 0) * 100) })), coherence: coherence == null ? null : Math.round(coherence * 100), identity_source: sp.identity.source, elements: top(elCount).map(([e, n]) => ({ element: e, label: elementLabel(e), count: n })) },
    silhouettes: { legs: legDist, legs_unknown: bottoms.length - legKnown, tops: topDist, tops_unknown: tops.length - topKnown, body_shape: sil?.shape ?? null },
    proportions: { outfits: sigs.length, distribution: top(sigDist).map(([s, n]) => ({ signature: s, count: n })) },
    colors: { distribution: top(colors).map(([c, n]) => ({ color: c, count: n })), neutral_share: Math.round(neutralShare * 100), temperature: ctx.color.temp ?? null },
    formality,
    combinability: simulable.map((g) => ({ id: g.id as string, title: garmentTitle(g), partners: combos(g.id) })).sort((a, z) => z.partners - a.partners),
    usage: { tracked: use.tracked, events: use.events },
    findings, limitations,
  }
}
export type WardrobeAnalysis = ReturnType<typeof analyzeWardrobe>

/** Huella de todo lo que cambia el diagnóstico: prendas, identidad, colorimetría, medidas, ajuste, vida, objetivos y uso. */
export function wardrobeFingerprint(garments: G[], b: Bundle, wears: number, fitScores: Record<string, number | null> = {}) {
  return createHash('sha256').update(JSON.stringify({
    v: WARDROBE_ANALYSIS_VERSION, g: garments.map((g) => [g.id, g.updated_at ?? null, g.wardrobe_status, g.decision ?? null, fitScores[g.id] ?? null]).sort(),
    s: b.style ?? null, c: b.color ?? null, f: b.fit ?? null, l: b.life ?? null, go: b.goals ?? null, m: Object.keys(b.measures ?? {}).sort().map((k) => [k, (b.measures as Record<string, { value: number }>)[k]?.value]), w: wears,
  })).digest('hex').slice(0, 24)
}
