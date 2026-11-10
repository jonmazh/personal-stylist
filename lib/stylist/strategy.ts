import { createHash } from 'node:crypto'
import type { Bundle } from '@/lib/profile/data'
import type { Evaluation } from '@/lib/wardrobe/compatibility'
import { elementLabel, styleById, styleName } from '@/lib/style/catalog'
import { styleProfileOf } from '@/lib/style/dna'
import { buildShopperContext } from '@/lib/shopping/intelligence/context'
import { analyzeColor } from '@/lib/shopping/intelligence/color'
import { detectColors } from '@/lib/shopping/catalog/normalize'
import type { StrategicFinding, WardrobeAnalysis, Experimentation } from './wardrobe'
import { generalColors } from './discovery'
import { emptyLearned, type Learned } from './feedback'

/**
 * Personal Shopper 2.0 · 2.0D — Style Strategy Engine.
 * Transforma el diagnóstico del armario (2.0B), las señales de mercado (2.0C) y tu perfil en OPORTUNIDADES de estilo,
 * antes de buscar ningún producto. La categoría de prenda no se fija de antemano: surge del razonamiento (una silueta
 * que falta, una proporción repetida, un rasgo de tu identidad ausente, una textura, un acento de color, una tendencia
 * que te favorece). Cada oportunidad separa tres criterios:
 *  - Relevancia de moda (solo con señales validadas; puede no haberla: vestir bien no es estar a la moda).
 *  - Idoneidad personal (identidad, rasgos que rechazas, silueta corporal, colorimetría).
 *  - Impacto estilístico (cuánto cambia tus conjuntos según el diagnóstico).
 * El grado de experimentación ordena las oportunidades (evolución / expansión / exploración) sin prohibir ninguna.
 * Puede concluir que no hace falta comprar nada. Determinista y explicable.
 */
export const STRATEGY_VERSION = 'style-strategy@1'
type G = Record<string, any>
type Conf = 'alta' | 'media' | 'baja'
export const MODES = [
  { id: 'evolution', label: 'Tu estilo evolucionado', help: 'Coherente con tu identidad actual, pero eleva tus conjuntos.' },
  { id: 'expansion', label: 'Expansión de estilo', help: 'Nuevas siluetas, proporciones, materiales o colores compatibles contigo.' },
  { id: 'exploration', label: 'Exploración', help: 'Propuestas más atrevidas que podrían llevar tu estilo a otro nivel.' },
] as const
export type Mode = (typeof MODES)[number]['id']

export interface Target { category: string | null; subcategory: string | null; label: string; element: string | null; cut: string | null; silhouette: string | null; color: string | null; material: string | null; colors_ok: string[] }
export interface Opportunity {
  key: string; title: string; mode: Mode; purchase: boolean
  diagnosis: string; wardrobe_evidence: { garment_ids: string[]; facts: string[] }; profile_relation: string[]
  market: { signal_id: string | null; name: string; kind: string; confidence: string; stage: string; presence: G | null } | null
  proposal: string; target: Target | null; benefits: string[]; drawbacks: string[]
  scores: { fashion_relevance: number | null; personal_suitability: number; stylistic_impact: number }
  confidence: Conf; priority: number; sources: string[]
}
export interface RejectedIdea { key: string; title: string; reason: string; source: 'tendencia' | 'armario' }

// ── Vocabulario: rasgo de estilo → prenda objetivo (descriptiva, no un producto) ──
const T = (category: string | null, subcategory: string | null, label: string, x: Partial<Target> = {}): Omit<Target, 'element' | 'color' | 'material' | 'colors_ok'> & Partial<Target> => ({ category, subcategory, label, cut: null, silhouette: null, ...x })
export const ELEMENT_TARGET: Record<string, ReturnType<typeof T>> = {
  'leg-wide': T('bottom', 'trousers', 'pantalón de pierna amplia', { cut: 'Wide' }), 'leg-baggy': T('bottom', 'trousers', 'pantalón holgado', { silhouette: 'Amplia' }),
  'leg-straight': T('bottom', 'trousers', 'pantalón recto', { cut: 'Recto' }), 'leg-slim': T('bottom', 'trousers', 'pantalón slim', { cut: 'Slim' }),
  'top-oversize': T('top', null, 'parte de arriba holgada', { silhouette: 'Amplia' }), 'top-fitted': T('top', null, 'parte de arriba ajustada', { silhouette: 'Ajustada' }),
  overshirt: T('outerwear', 'overshirt', 'sobrecamisa'), 'long-coat': T('outerwear', 'coat', 'abrigo largo'), blazer: T('outerwear', 'blazer', 'americana'),
  'denim-jacket': T('outerwear', 'denim_jacket', 'cazadora vaquera'), leather: T('outerwear', 'leather_jacket', 'cazadora de cuero'), varsity: T('outerwear', 'bomber', 'cazadora varsity o bomber'),
  puffer: T('outerwear', 'puffer', 'plumífero'), knit: T('top', 'knit', 'jersey de punto'), cardigan: T('top', 'cardigan', 'cárdigan'), turtleneck: T('top', 'turtleneck', 'jersey de cuello alto'),
  shirt: T('top', 'shirt', 'camisa'), polo: T('top', 'polo', 'polo'), hoodie: T('top', 'hoodie', 'sudadera'), 'basic-tee': T('top', 'tee', 'camiseta básica de calidad'), 'graphic-tee': T('top', 'tee', 'camiseta gráfica'),
  flannel: T('top', 'shirt', 'camisa de cuadros'), cargo: T('bottom', 'cargo', 'pantalón cargo'), denim: T('bottom', 'jeans', 'vaquero'), tailoring: T('bottom', 'trousers', 'pantalón de sastrería'),
  'leg-jogger': T('bottom', 'joggers', 'pantalón jogger'), sneaker: T('footwear', 'sneakers', 'zapatilla limpia'), chunky: T('footwear', 'sneakers', 'zapatilla chunky'), runner: T('footwear', 'sneakers', 'zapatilla de running'),
  skate: T('footwear', 'sneakers', 'zapatilla de skate'), loafer: T('footwear', 'loafers', 'mocasín'), derby: T('footwear', 'derby', 'zapato de cordones'), boot: T('footwear', 'boots', 'bota'),
  cap: T('accessories', 'headwear', 'gorra'), beanie: T('accessories', 'headwear', 'gorro'), crossbody: T('accessories', 'bag', 'bandolera'), sunglasses: T('accessories', 'glasses', 'gafas de sol'),
  chain: T('accessories', 'jewelry', 'cadena'), layers: T('outerwear', null, 'una capa ligera (sobrecamisa, cárdigan o chaqueta abierta)'), technical: T('outerwear', null, 'prenda exterior técnica'),
}
const CUT_EL: Record<string, string> = { Wide: 'leg-wide', Recto: 'leg-straight', Slim: 'leg-slim', Amplia: 'leg-baggy' }
const TOP_EL: Record<string, string> = { Amplia: 'top-oversize', Ajustada: 'top-fitted' }
const BODY_LEGS: Record<string, string[]> = { v: ['Recto', 'Wide'], equilibrada: ['Recto', 'Wide', 'Slim', 'Tapered'], recta: ['Recto', 'Slim'], cintura: ['Recto', 'Wide'] }
const BODY_TOPS: Record<string, string[]> = { v: ['Regular'], equilibrada: ['Regular', 'Ajustada', 'Amplia'], recta: ['Ajustada', 'Regular'], cintura: ['Regular'] }
const MATERIAL_TARGET: Record<string, { label: string; category: string | null; subcategory: string | null }> = {
  ante: { label: 'una pieza de ante (sobrecamisa o cazadora)', category: 'outerwear', subcategory: null }, pana: { label: 'una pieza de pana', category: 'bottom', subcategory: 'trousers' },
  lana: { label: 'una pieza de lana con textura', category: 'top', subcategory: 'knit' }, lino: { label: 'una pieza de lino', category: 'top', subcategory: 'shirt' },
  punto: { label: 'un punto grueso', category: 'top', subcategory: 'knit' },
}

// ── Tendencia (texto validado de 2.0C) → rasgos concretos ──
const lc = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const LEGS = /(pantal|trouser|pants?\b|jeans?|vaquer|denim)/
const TOPS = /(camis|jersey|sudader|top\b|chaquet|jacket|abrigo|coat|sobrecamisa|overshirt|knit|punto)/
export function trendTraits(text: string): { elements: string[]; materials: string[]; colors: string[] } {
  const t = lc(text); const els = new Set<string>(); const mats = new Set<string>()
  if (/(wide|amplio|ancho|baggy|holgad|relaxed|loose|barrel|palazzo)/.test(t)) { if (LEGS.test(t)) els.add('leg-wide'); else if (TOPS.test(t)) els.add('top-oversize') }
  if (/(oversize|boxy)/.test(t)) els.add('top-oversize')
  if (/(slim|pitillo|skinny|ajustad|ceñid)/.test(t) && LEGS.test(t)) els.add('leg-slim')
  if (/(\brecto\b|straight)/.test(t) && LEGS.test(t)) els.add('leg-straight')
  const word: [RegExp, string][] = [[/overshirt|sobrecamisa/, 'overshirt'], [/abrigo largo|long coat|overcoat|trench|gabardina/, 'long-coat'], [/blazer|americana/, 'blazer'], [/cardigan|rebeca/, 'cardigan'],
    [/cuello alto|turtleneck|roll ?neck/, 'turtleneck'], [/mocas|loafer/, 'loafer'], [/\bbotas?\b|\bboots?\b/, 'boot'], [/cargo/, 'cargo'], [/\bcapas\b|layering|layer/, 'layers'], [/\bpolos?\b/, 'polo'], [/camiseta|t-?shirt|\btees?\b/, 'basic-tee'],
    [/varsity|bomber/, 'varsity'], [/chunky/, 'chunky'], [/runner|running/, 'runner'], [/derby|blucher/, 'derby'], [/pinzas|pleat|sastrer|tailor/, 'tailoring'], [/cuero|leather/, 'leather']]
  for (const [re, el] of word) if (re.test(t)) els.add(el)
  for (const [re, m] of [[/suede|\bante\b/, 'ante'], [/pana|corduroy/, 'pana'], [/\blana\b|wool|tweed|franela|flannel/, 'lana'], [/\blino\b|linen/, 'lino'], [/punto grueso|chunky knit|cable knit/, 'punto']] as [RegExp, string][]) if (re.test(t)) mats.add(m)
  return { elements: [...els], materials: [...mats], colors: detectColors(text) }
}

export interface StrategyInput { analysis: WardrobeAnalysis; signals: G[]; bundle: Bundle; garments: G[]; evals: Map<string, Evaluation>; now?: Date; learned?: Learned }
export function buildStrategy(input: StrategyInput) {
  const { analysis: a, bundle: b } = input
  const sp = styleProfileOf(b)
  const ctx = buildShopperContext({ bundle: b, garments: input.garments, evals: input.evals })
  const exp: Experimentation = a.experimentation ?? 'Abierto'
  // Aprendido de tus valoraciones (aparte del Style Blueprint, que no se toca): rasgos que no son tuyos o que te gustan
  const learned = input.learned ?? emptyLearned()
  const rejected = new Set([...sp.elements.rejected.map((e) => e.element), ...learned.soft_rejected]), liked = new Set([...sp.elements.liked.map((e) => e.element), ...learned.liked.filter((e) => !learned.soft_rejected.includes(e))])
  const learnedReject = new Set(learned.soft_rejected)
  const identity = sp.identity.influences
  const principal = identity.find((i) => i.role === 'principal') ?? identity[0]
  const idEls = (filter: (i: typeof identity[number]) => boolean) => new Set<string>(identity.filter(filter).flatMap((i) => (styleById(i.style)?.elements ?? []) as string[]))
  const principalEls = principal ? new Set<string>((styleById(principal.style)?.elements ?? []) as string[]) : new Set<string>()
  const identityEls = idEls(() => true)
  const relatedEls = new Set<string>((principal ? styleById(principal.style)?.related ?? [] : []).flatMap((r) => (styleById(r)?.elements ?? []) as string[]))
  const present = new Map(a.aesthetic.elements.map((e) => [e.element, e.count]))
  const shape = a.silhouettes.body_shape
  const bodyOk = (el: string): boolean | null => {
    if (!shape) return null
    const leg = Object.entries(CUT_EL).find(([, e]) => e === el)?.[0]; if (leg) return BODY_LEGS[shape]?.includes(leg) ?? true
    const top = Object.entries(TOP_EL).find(([, e]) => e === el)?.[0]; if (top) return BODY_TOPS[shape]?.includes(top) ?? true
    return true
  }
  const favorable = (c: string) => { const r = analyzeColor(c, 'top', ctx); return r ? r.personal.value : null }
  const modeFor = (el: string | null): Mode => !el ? 'expansion' : principalEls.has(el) && (liked.has(el) || present.has(el)) ? 'evolution' : identityEls.has(el) || liked.has(el) ? 'expansion' : 'exploration'
  const suitability = (el: string | null, color: string | null) => {
    let s = 55; const why: string[] = []
    if (el) {
      if (principalEls.has(el)) { s += 25; why.push(`${elementLabel(el)} forma parte de ${styleName(principal!.style)}, tu estilo principal.`) }
      else if (identityEls.has(el)) { s += 15; why.push(`${elementLabel(el)} está en tu identidad (${identity.filter((i) => (styleById(i.style)?.elements as string[] | undefined)?.includes(el)).map((i) => styleName(i.style)).join(', ')}).`) }
      else if (relatedEls.has(el)) { s += 5; why.push(`${elementLabel(el)} pertenece a estilos cercanos al tuyo: es una exploración coherente.`) }
      else { s -= 10; why.push(`${elementLabel(el)} está lejos de tu identidad actual.`) }
      if (liked.has(el)) { s += 10; why.push('Está entre los rasgos que te gustan.') }
      const body = bodyOk(el)
      if (body === true && (CUT_EL.Wide === el || Object.values(CUT_EL).includes(el) || Object.values(TOP_EL).includes(el))) { s += 5; why.push(`Tu silueta (${shape}) lo admite.`) }
      if (body === null && (Object.values(CUT_EL).includes(el) || Object.values(TOP_EL).includes(el))) why.push('Sin medidas no puedo confirmar que el corte te favorezca.')
    }
    if (color) { const v = favorable(color); if (v != null) { s += Math.round((v - 0.6) * 40); why.push(v >= 0.75 ? `El ${color.toLowerCase()} te favorece.` : `El ${color.toLowerCase()} te favorece poco.`) } else why.push('Sin colorimetría: no afirmo que el color te favorezca.') }
    return { score: Math.max(0, Math.min(100, s)), why }
  }
  const expBonus: Record<Experimentation, Record<Mode, number>> = { Conservador: { evolution: 15, expansion: 0, exploration: -20 }, Abierto: { evolution: 5, expansion: 10, exploration: -5 }, Explorador: { evolution: 0, expansion: 10, exploration: 15 } }
  // Si has dicho varias veces que algo te parece demasiado arriesgado, la exploración baja (sin desaparecer)
  const riskAdj: Record<Mode, number> = learned.risk_averse ? { evolution: 5, expansion: -5, exploration: -15 } : { evolution: 0, expansion: 0, exploration: 0 }
  const confOf = (...cs: (string | null | undefined)[]): Conf => cs.includes('baja') ? 'baja' : cs.includes('media') ? 'media' : 'alta'
  const signals = input.signals.filter((s) => s.stage !== 'saturada')
  const traitsOf = new Map(input.signals.map((s) => [s.id ?? s.key, trendTraits(`${s.name}. ${s.description}`)]))
  const marketFor = (pred: (t: ReturnType<typeof trendTraits>) => boolean) => {
    const s = signals.filter((x) => !learned.trends_rejected.includes(x.key) && pred(traitsOf.get(x.id ?? x.key)!)).sort((x, z) => (x.kind === 'tendencia_editorial' ? 0 : 1) - (z.kind === 'tendencia_editorial' ? 0 : 1) || ({ alta: 0, media: 1, baja: 2 } as Record<string, number>)[x.confidence] - ({ alta: 0, media: 1, baja: 2 } as Record<string, number>)[z.confidence])[0]
    return s ? { signal_id: s.id ?? null, name: s.name, kind: s.kind, confidence: s.confidence, stage: s.stage, presence: s.presence ?? null } : null
  }
  const relevance = (m: Opportunity['market']) => (!m ? null : m.kind === 'tendencia_editorial' ? ({ alta: 85, media: 70, baja: 55 } as Record<string, number>)[m.confidence] : 35)
  const ops = new Map<string, Opportunity>(); const rejectedIdeas: RejectedIdea[] = []
  const used = new Set<string>()
  const add = (o: Omit<Opportunity, 'priority' | 'mode' | 'scores'> & { mode?: Mode; impact: number; suit?: ReturnType<typeof suitability> }) => {
    const mode = o.mode ?? modeFor(o.target?.element ?? null)
    const suit = o.suit ?? suitability(o.target?.element ?? null, o.target?.color ?? null)
    const fr = relevance(o.market)
    const later = learned.opps_later.includes(o.key), have = learned.opps_have.includes(o.key)
    const purchase = o.purchase && !have
    const priority = Math.round(Math.max(0, Math.min(100, o.impact * 0.45 + suit.score * 0.35 + (fr ?? 40) * 0.2 + expBonus[exp][mode] + riskAdj[mode] - (purchase ? 0 : 15) - (later ? 10 : 0))))
    const notes = [...(later ? ['Te interesa, pero no ahora: la dejo con menos prioridad.'] : []), ...(have ? ['Dices que ya tienes algo parecido: no propongo comprar.'] : []),
      ...(o.target?.element && learned.cut_avoid[o.target.element]?.length ? [`Aprendido de tus valoraciones: evita el corte ${learned.cut_avoid[o.target.element].join(', ').toLowerCase()}.`] : [])]
    const prev = ops.get(o.key)
    if (prev) { prev.sources.push(...o.sources); prev.wardrobe_evidence.facts.push(...o.wardrobe_evidence.facts); prev.benefits = [...new Set([...prev.benefits, ...o.benefits])]; if (!prev.market && o.market) prev.market = o.market; return }
    const { impact: _i, suit: _s, ...rest } = o
    ops.set(o.key, { ...rest, purchase, mode, profile_relation: [...new Set([...o.profile_relation, ...suit.why, ...notes])], scores: { fashion_relevance: fr, personal_suitability: suit.score, stylistic_impact: o.impact }, priority })
  }
  const fid = (f: StrategicFinding) => ({ garment_ids: f.evidence.garment_ids, facts: [f.diagnosis, ...f.evidence.facts] })
  // Orden de razonamiento: primero lo estructural (silueta, proporción), después identidad, color, textura y el resto
  const ORDER: Record<string, number> = { silhouette_gap: 0, proportion_monotony: 1, aesthetic_gap: 2, color_unfavorable: 3, color_monotony: 4, texture_flat: 5, formality_gap: 6 }
  const findings = [...a.findings].sort((x, z) => (ORDER[x.kind] ?? 9) - (ORDER[z.kind] ?? 9))

  // ── Oportunidades que nacen del armario ──
  for (const f of findings) {
    if (f.kind === 'silhouette_gap') {
      const [, kind, cut] = f.key.split(':')
      const el = kind === 'leg' ? CUT_EL[cut] : TOP_EL[cut]
      if (!el) continue
      if (learnedReject.has(el)) { rejectedIdeas.push({ key: `armario:${f.key}`, title: f.title, reason: `Tu armario lo pediría, pero has dicho varias veces que ${elementLabel(el).toLowerCase()} no representa tu estilo.`, source: 'armario' }); used.add(el); continue }
      const tgt = ELEMENT_TARGET[el]
      const market = marketFor((t) => t.elements.includes(el))
      used.add(el)
      add({
        key: `el:${el}`, title: `Introducir ${tgt.label}`, purchase: true, diagnosis: f.diagnosis, wardrobe_evidence: fid(f), profile_relation: [], market,
        proposal: `${f.direction ?? ''} Un ${tgt.label} que funcione con las prendas que ya tienes, sin renovar el armario.`.trim(),
        target: { ...tgt, element: el, color: null, material: null, colors_ok: [] }, impact: 85,
        benefits: ['Introduce una proporción que hoy no tienes', `Combina con tus ${kind === 'leg' ? 'partes de arriba' : 'pantalones'} actuales`, 'Evoluciona tu estética sin cambiar tu identidad'],
        drawbacks: [kind === 'leg' && cut === 'Wide' ? 'Pide equilibrar arriba: mejor con prendas superiores más limpias o cortas' : 'Requiere probarlo: el ajuste real no se garantiza con fotos', ...(f.confidence === 'baja' ? ['Sin medidas: confirma antes que el corte te favorece'] : [])],
        confidence: confOf(f.confidence, market?.confidence), sources: [`armario:${f.key}`, ...(market?.signal_id ? [`tendencia:${market.signal_id}`] : [])],
      })
    }
    if (f.kind === 'proportion_monotony' && !findings.some((x) => x.kind === 'silhouette_gap')) {
      const top = (a.proportions.distribution[0]?.signature ?? '').split('|')[0]
      const el = !rejected.has('layers') ? 'layers' : top !== 'Amplia' ? 'top-oversize' : 'leg-wide'
      const tgt = ELEMENT_TARGET[el]
      used.add(el)
      add({
        key: `el:${el}`, title: 'Romper la proporción repetida', purchase: true, diagnosis: f.diagnosis, wardrobe_evidence: fid(f), profile_relation: [], market: marketFor((t) => t.elements.includes(el)),
        proposal: `${f.direction} Propuesta: ${tgt.label}.`, target: { ...tgt, element: el, color: null, material: null, colors_ok: [] }, impact: 75,
        benefits: ['Multiplica la variedad real de tus conjuntos', 'Aprovecha prendas existentes'], drawbacks: ['Si no te sientes cómodo con capas, el cambio puede notarse poco'], confidence: f.confidence, sources: [`armario:${f.key}`],
      })
    }
    if (f.kind === 'aesthetic_gap') {
      const style = f.key.split(':')[1]
      const missing = ((styleById(style)?.elements ?? []) as string[]).filter((e) => ELEMENT_TARGET[e] && !present.has(e) && !rejected.has(e) && !used.has(e) && bodyOk(e) !== false)
      for (const el of missing.slice(0, 2)) {
        const tgt = ELEMENT_TARGET[el]; used.add(el)
        add({
          key: `el:${el}`, title: `Acercarte a ${styleName(style)}: ${tgt.label}`, purchase: true, diagnosis: f.diagnosis, wardrobe_evidence: fid(f), profile_relation: [], market: marketFor((t) => t.elements.includes(el)),
          proposal: `Incorporar ${tgt.label} acerca lo que vistes a ${styleName(style)}, la imagen que buscas.`, target: { ...tgt, element: el, color: null, material: null, colors_ok: [] }, impact: 65,
          benefits: [`Más coherencia con ${styleName(style)}`, 'Da una dirección clara a tus conjuntos'], drawbacks: ['Una sola pieza no cambia la estética: funciona si se combina con intención'], confidence: f.confidence, sources: [`armario:${f.key}`],
        })
      }
    }
    if (f.kind === 'color_monotony' || f.kind === 'color_unfavorable') {
      const accents = (f.direction ?? '').match(/: ([^.]+)\./)?.[1]?.split(', ').map((c) => c.trim()).map((c) => c.charAt(0).toUpperCase() + c.slice(1)).filter((c) => detectColors(c).length) ?? []
      const fromTrend = signals.flatMap((s) => traitsOf.get(s.id ?? s.key)!.colors).filter((c) => (favorable(c) ?? 0) >= 0.75)
      // Sin colorimetría: consejo general de estilista (colores versátiles que menos tienes), nunca «te favorece»
      const general = !ctx.color.temp ? generalColors('top', ctx.wardrobe.byCategory.top?.colors ?? {}, 3) : []
      const colors = [...new Set([...fromTrend, ...accents, ...general])].slice(0, 3)
      const market = marketFor((t) => t.colors.some((c) => colors.includes(c)))
      add({
        key: `color:${f.kind}`, title: f.kind === 'color_monotony' ? 'Un acento de color que te favorece' : 'Llevar tu paleta cerca de la cara', purchase: true, diagnosis: f.diagnosis, wardrobe_evidence: fid(f), profile_relation: [], market,
        proposal: colors.length ? `Introducir ${colors.map((c) => c.toLowerCase()).join(' o ')} en una prenda de arriba o una capa, sobre tu base actual.` : (f.direction ?? 'Introducir un color de tu paleta.'),
        target: { category: 'top', subcategory: null, label: 'prenda de arriba o capa en un color de tu paleta', element: null, cut: null, silhouette: null, color: colors[0] ?? null, material: null, colors_ok: colors },
        impact: f.kind === 'color_unfavorable' ? 70 : 55, suit: general.length ? { score: 55, why: ['Sin colorimetría: colores versátiles por consejo general de estilista, no porque te favorezcan. Completa tu estudio cromático para personalizarlos.'] } : suitability(null, colors[0] ?? null),
        benefits: ['Da profundidad a conjuntos sencillos', 'Mejora el efecto del color en tu cara'], drawbacks: ['Un acento mal combinado se nota más que un neutro'], confidence: confOf(f.confidence, market?.confidence), sources: [`armario:${f.key}`],
      })
    }
    if (f.kind === 'texture_flat') {
      const mats = signals.flatMap((s) => traitsOf.get(s.id ?? s.key)!.materials)
      const mat = mats[0] ?? 'punto'
      const market = marketFor((t) => t.materials.includes(mat))
      const tt = MATERIAL_TARGET[mat]
      add({
        key: `material:${mat}`, title: `Textura: ${tt.label}`, purchase: true, diagnosis: f.diagnosis, wardrobe_evidence: fid(f), profile_relation: [], market,
        proposal: `${f.direction} Concretamente: ${tt.label}.`, target: { category: tt.category, subcategory: tt.subcategory, label: tt.label, element: null, cut: null, silhouette: null, color: null, material: mat, colors_ok: [] }, impact: 55,
        benefits: ['Profundidad sin añadir color', 'Eleva prendas básicas'], drawbacks: ['Algunas texturas piden más cuidado'], confidence: confOf(f.confidence, market?.confidence), sources: [`armario:${f.key}`],
      })
    }
    if (f.kind === 'formality_gap') add({
      key: f.key, title: f.title, purchase: true, mode: 'evolution', diagnosis: f.diagnosis, wardrobe_evidence: fid(f), profile_relation: ['Responde a tu estilo de vida real.'], market: null,
      proposal: 'Cubrir esa ocasión con una pieza coherente con tu identidad.', target: null, impact: 70, benefits: ['Resuelve una situación real de tu vida'], drawbacks: [], confidence: f.confidence, sources: [`armario:${f.key}`],
    })
    if (f.kind === 'underused_potential' || f.kind === 'island') add({
      key: f.key, title: f.kind === 'underused_potential' ? 'Activa lo que ya tienes' : 'Prendas aisladas', purchase: false, mode: 'evolution', diagnosis: f.diagnosis, wardrobe_evidence: fid(f), profile_relation: [], market: null,
      proposal: f.direction ?? '', target: null, impact: f.kind === 'underused_potential' ? 60 : 40, benefits: ['Mejora tus conjuntos sin comprar'], drawbacks: [], confidence: f.confidence, sources: [`armario:${f.key}`],
    })
    if (f.kind === 'redundancy') rejectedIdeas.push({ key: f.key, title: 'Más de lo mismo', reason: `${f.diagnosis} Otra prenda de este tipo no aportaría variedad.`, source: 'armario' })
  }

  // ── Oportunidades que nacen del mercado: una tendencia solo se propone si encaja contigo ──
  for (const s of input.signals) {
    const t = traitsOf.get(s.id ?? s.key)!
    const title = `Tendencia «${s.name}»`
    if (learned.trends_rejected.includes(s.key)) { rejectedIdeas.push({ key: `trend:${s.key}`, title, reason: 'La descartaste tú (no es tu estilo o te parece demasiado arriesgada).', source: 'tendencia' }); continue }
    if (s.stage === 'saturada') { rejectedIdeas.push({ key: `trend:${s.key}`, title, reason: 'Las fuentes la describen como saturada o en declive.', source: 'tendencia' }); continue }
    if (s.kind !== 'tendencia_editorial') { rejectedIdeas.push({ key: `trend:${s.key}`, title, reason: 'Solo la respalda una fuente: es una propuesta aislada, no una tendencia.', source: 'tendencia' }); continue }
    const els = t.elements.filter((e) => ELEMENT_TARGET[e])
    if (!els.length && !t.colors.length && !t.materials.length) { rejectedIdeas.push({ key: `trend:${s.key}`, title, reason: 'No se traduce en una incorporación concreta para tu armario.', source: 'tendencia' }); continue }
    if (els.some((e) => rejected.has(e))) { const bad = els.filter((e) => rejected.has(e)); rejectedIdeas.push({ key: `trend:${s.key}`, title, reason: bad.some((e) => learnedReject.has(e)) ? `Has dicho varias veces que ${bad.map((e) => elementLabel(e).toLowerCase()).join(', ')} no representa tu estilo.` : `Incluye algo que rechazas (${bad.map((e) => elementLabel(e).toLowerCase()).join(', ')}).`, source: 'tendencia' }); continue }
    const badBody = els.find((e) => bodyOk(e) === false)
    if (badBody) { rejectedIdeas.push({ key: `trend:${s.key}`, title, reason: `${elementLabel(badBody)} no es de los cortes que favorecen tu silueta (${shape}).`, source: 'tendencia' }); continue }
    const color = t.colors[0] ?? null
    if (color) {
      const v = favorable(color); const avoided = ctx.color.avoids.some((x) => lc(x) === lc(color))
      if (avoided || (v != null && v < 0.5)) { rejectedIdeas.push({ key: `trend:${s.key}`, title, reason: avoided ? `El ${color.toLowerCase()} está entre los colores que evitas.` : `El ${color.toLowerCase()} te favorece poco según tu colorimetría.`, source: 'tendencia' }); continue }
    }
    const el = els.find((e) => !used.has(e)) ?? null
    if (els.length && !el) continue   // ya la recoge una oportunidad del armario (con esta tendencia como respaldo)
    if (el && (present.get(el) ?? 0) >= 2) { rejectedIdeas.push({ key: `trend:${s.key}`, title, reason: `Ya tienes ${present.get(el)} prendas con ${elementLabel(el).toLowerCase()}: tu armario ya la resuelve.`, source: 'tendencia' }); continue }
    const mat = t.materials[0] ?? null
    if (!el && mat && ops.has(`material:${mat}`)) continue
    if (!el && color && [...ops.values()].some((o) => o.target?.colors_ok.includes(color))) continue
    const tgt = el ? ELEMENT_TARGET[el] : mat ? { ...MATERIAL_TARGET[mat], cut: null, silhouette: null } : { category: 'top', subcategory: null, label: `prenda en ${color!.toLowerCase()}`, cut: null, silhouette: null }
    if (el) used.add(el)
    const market = { signal_id: s.id ?? null, name: s.name, kind: s.kind, confidence: s.confidence, stage: s.stage, presence: s.presence ?? null }
    add({
      key: el ? `el:${el}` : mat ? `material:${mat}` : `color:${color}`, title: `${s.name}, a tu manera`, purchase: true, diagnosis: `El mercado propone «${s.name}» (${s.source_count} medios). ${s.description}`, wardrobe_evidence: { garment_ids: [], facts: [] }, profile_relation: [], market,
      proposal: `Adoptar la idea con ${tgt.label}${color ? ` en ${color.toLowerCase()}` : ''}, integrada en tu base actual.`, target: { ...tgt, element: el, color, material: mat, colors_ok: color ? [color] : [] }, impact: 50,
      benefits: ['Incorpora una propuesta actual de forma coherente contigo'], drawbacks: ['Una tendencia puede caducar: mejor en una pieza que combine con lo que tienes'], confidence: confOf(s.confidence), sources: [`tendencia:${s.id ?? s.key}`],
    })
  }

  const list = [...ops.values()].sort((x, z) => z.priority - x.priority)
  const buys = list.filter((o) => o.purchase && o.priority >= 45)
  const noPurchase = !buys.length
  const direction = [
    principal ? `Desarrollar ${styleName(principal.style)}${identity[1] ? ` con matices de ${styleName(identity[1].style)}` : ''}.` : 'Sin identidad estética definida: la estrategia se apoya solo en tu armario y en el mercado.',
    buys.length ? `Prioridad: ${buys.slice(0, 2).map((o) => o.title.charAt(0).toLowerCase() + o.title.slice(1)).join(' y ')}.` : 'No hace falta comprar nada ahora: tu armario ya resuelve lo que buscas.',
    list.some((o) => !o.purchase) ? 'Antes de comprar, aprovecha mejor lo que ya tienes.' : null,
    `Grado de experimentación ${exp.toLowerCase()}${a.experimentation ? '' : ' (supuesto)'}.`,
  ].filter(Boolean).join(' ')
  return { version: STRATEGY_VERSION, direction, experimentation: exp, no_purchase_needed: noPurchase, opportunities: list, rejected: rejectedIdeas, learned: { applied: learned.applied, pending: learned.pending }, market_level: input.signals.length ? 'con señales de mercado' : 'sin señales de mercado' }
}
export type Strategy = ReturnType<typeof buildStrategy>
export const strategyFingerprint = (wardrobeFp: string, researchId: string | null, b: Bundle, learnedHash = '') => createHash('sha256').update(JSON.stringify({ v: STRATEGY_VERSION, wardrobeFp, researchId, style: b.style ?? null, goals: b.goals ?? null, color: b.color ?? null, learnedHash })).digest('hex').slice(0, 24)
