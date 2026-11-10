import { createHash } from 'node:crypto'
import { subOf } from '@/lib/wardrobe/taxonomy'

/**
 * Tallas personalizadas (4B.2/4C).
 * 1) Normalizador: cada talla conserva su etiqueta original, su sistema (letras, numérica EU, cintura en pulgadas,
 *    calzado EU…), su valor normalizado y la confianza de esa lectura. Sin tabla oficial de la marca NO se convierte entre
 *    sistemas (una 42 EU no es una W32) ni se da por hecho que una M de una marca sea la M de otra.
 * 2) PersonalizedSizeResolver: por grupo de tallaje (camisetas, camisas, punto, pantalones, vaqueros, chaquetas,
 *    sastrería, calzado) decide tus tallas a partir de datos reales: tallas habituales que declaras, prendas de tu
 *    armario que te quedan bien (talla que te funciona, Fit Assessment confirmado, medidas de referencia) y, por marca,
 *    lo que ya tienes de esa marca. Las medidas corporales se usan solo con una guía oficial de la marca (no hay ninguna
 *    disponible hoy), así que se informan pero no se convierten en talla.
 * 3) Elegibilidad: un producto solo puede recomendarse si existe una variante en una de tus tallas, disponible y con la
 *    disponibilidad comprobada hace poco. Es una condición PREVIA al motor 4C, no un criterio más de la puntuación.
 */

// ── Grupos de tallaje ──
export const SIZE_GROUPS = [
  { id: 'camisetas', label: 'Camisetas y polos', subs: ['tee', 'polo', 'tank', 'sport_top'], words: ['camiseta', 'camisetas', 'polo', 'polos', 'tshirt', 't-shirt'] },
  { id: 'camisas', label: 'Camisas y sobrecamisas', subs: ['shirt', 'overshirt'], words: ['camisa', 'camisas', 'sobrecamisa'] },
  { id: 'punto', label: 'Punto y sudaderas', subs: ['knit', 'cardigan', 'sweatshirt', 'hoodie', 'turtleneck'], words: ['jersey', 'jerseis', 'jerseys', 'sudadera', 'sudaderas', 'punto', 'cardigan', 'rebeca'] },
  { id: 'pantalones', label: 'Pantalones', subs: ['trousers', 'chinos', 'cargo', 'joggers', 'shorts', 'sport_bottom'], words: ['pantalon', 'pantalones', 'chino', 'chinos', 'bermuda', 'bermudas'] },
  { id: 'vaqueros', label: 'Vaqueros', subs: ['jeans'], words: ['vaquero', 'vaqueros', 'jeans', 'tejano', 'tejanos'] },
  { id: 'chaquetas', label: 'Chaquetas y abrigos', subs: ['jacket', 'denim_jacket', 'leather_jacket', 'bomber', 'coat', 'trench', 'parka', 'puffer', 'gilet', 'sport_jacket'], words: ['chaqueta', 'chaquetas', 'abrigo', 'abrigos', 'cazadora', 'cazadoras', 'parka', 'plumifero'] },
  { id: 'sastreria', label: 'Americanas y trajes', subs: ['blazer', 'suit', 'waistcoat', 'tuxedo'], words: ['americana', 'americanas', 'blazer', 'traje', 'trajes', 'chaleco'] },
  { id: 'calzado', label: 'Calzado', subs: ['sneakers', 'loafers', 'boots', 'derby', 'sandals'], words: ['calzado', 'zapato', 'zapatos', 'zapatilla', 'zapatillas', 'pie', 'botas'] },
] as const
export type SizeGroup = (typeof SIZE_GROUPS)[number]['id']
const GROUP_DEFAULT: Record<string, SizeGroup> = { top: 'camisetas', outerwear: 'chaquetas', bottom: 'pantalones', footwear: 'calzado', tailoring: 'sastreria', sport: 'camisetas' }
/** Grupo de tallaje de una prenda; null si no lleva talla (complementos, ropa interior…). */
export function sizeGroupOf(subcategory?: string | null, category?: string | null): SizeGroup | null {
  const g = SIZE_GROUPS.find((x) => (x.subs as readonly string[]).includes(subcategory ?? ''))
  if (g) return g.id
  const cat = category ?? subOf(subcategory)?.group ?? null
  return cat ? GROUP_DEFAULT[cat] ?? null : null
}
export const groupLabel = (g: SizeGroup) => SIZE_GROUPS.find((x) => x.id === g)!.label

// ── Normalización de tallas ──
export type SizeSystem = 'alpha' | 'eu_num' | 'waist_in' | 'shoe_eu' | 'shoe_uk' | 'shoe_us' | 'collar_cm' | 'unknown'
export const SYSTEM_LABEL: Record<SizeSystem, string> = { alpha: 'letras (XS–XXL)', eu_num: 'numérica EU', waist_in: 'cintura en pulgadas (W)', shoe_eu: 'calzado EU', shoe_uk: 'calzado UK', shoe_us: 'calzado US', collar_cm: 'cuello (cm)', unknown: 'sin identificar' }
export interface SizeToken { original: string; normalized: string | null; system: SizeSystem; confidence: 'alta' | 'media' | 'baja'; note?: string }
const ALPHA: [RegExp, string][] = [
  [/^(xxxs|3xs|triple extra small)/, 'XXXS'], [/^(xxs|2xs|double extra small)/, 'XXS'], [/^(xs|extra small)/, 'XS'], [/^(s|small|pequeñ[ao])$/, 'S'], [/^(m|medium|mediana)$/, 'M'],
  [/^(l|large|grande)$/, 'L'], [/^(xl|extra large)$/, 'XL'], [/^(xxl|2xl|double extra large)$/, 'XXL'], [/^(xxxl|3xl|triple extra large)$/, 'XXXL'], [/^(xxxxl|4xl|four extra large)$/, '4XL'],
]
const clean = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\(([^)]+)\)/, ' $1').replace(/\s+/g, ' ').trim()
/**
 * Lee una talla en su contexto (grupo de prenda, resto de tallas del producto y mercado). Las numéricas de pantalón se
 * distinguen por el rango: 36-56 EU frente a 26-40 en pulgadas; si el rango no lo aclara, el sistema queda sin identificar.
 */
export function normalizeSize(label: string, ctx: { group: SizeGroup | null; siblings?: string[]; market?: string | null }): SizeToken {
  const original = String(label ?? '').trim().slice(0, 40)
  const t = clean(original)
  const alphaKey = t.match(/\b(xxxs|3xs|xxs|2xs|xs|s|m|l|xl|xxl|2xl|xxxl|3xl|xxxxl|4xl)\b$/)?.[1] ?? t
  for (const [re, v] of ALPHA) if (re.test(alphaKey) || re.test(t)) return { original, normalized: v, system: 'alpha', confidence: 'alta' }
  const wl = t.match(/^w\s?(\d{2})(?:\s*[/x ]\s*l?\s?(\d{2}))?$/) ?? t.match(/^(\d{2})\s*[/x]\s*(\d{2})$/)
  if (wl) return { original, normalized: `W${wl[1]}${wl[2] ? ` L${wl[2]}` : ''}`, system: 'waist_in', confidence: 'alta' }
  const num = t.match(/^(\d{2}(?:[.,]5)?)$/)?.[1]?.replace(',', '.')
  if (!num) return { original, normalized: null, system: 'unknown', confidence: 'baja', note: 'Etiqueta de talla no reconocida.' }
  const n = Number(num)
  const sib = (ctx.siblings ?? []).map((x) => Number(clean(x).replace(',', '.'))).filter((x) => Number.isFinite(x))
  const foreign = ctx.market && ['GB', 'US', 'CA', 'AU'].includes(ctx.market)
  if (ctx.group === 'calzado') {
    if (n >= 35 && n <= 50) return { original, normalized: String(n), system: 'shoe_eu', confidence: 'alta' }
    if (n >= 4 && n <= 15) return ctx.market === 'GB' ? { original, normalized: String(n), system: 'shoe_uk', confidence: 'media' } : ctx.market === 'US' ? { original, normalized: String(n), system: 'shoe_us', confidence: 'media' } : { original, normalized: String(n), system: 'unknown', confidence: 'baja', note: 'Calzado UK o US sin identificar.' }
    return { original, normalized: null, system: 'unknown', confidence: 'baja' }
  }
  if (ctx.group === 'pantalones' || ctx.group === 'vaqueros') {
    const oddInches = sib.some((x) => x >= 27 && x <= 35 && x % 2 === 1)
    const highEu = sib.some((x) => x >= 42 && x <= 60)
    if (n >= 42 && n <= 60) return { original, normalized: String(n), system: 'eu_num', confidence: 'alta' }
    if (n >= 24 && n <= 35) return { original, normalized: `W${n}`, system: 'waist_in', confidence: n % 2 === 1 || oddInches || foreign ? 'alta' : 'media' }
    if (n >= 36 && n <= 40) {
      if (highEu && !(oddInches && foreign)) return { original, normalized: String(n), system: 'eu_num', confidence: 'media' }
      if (oddInches || foreign) return { original, normalized: `W${n}`, system: 'waist_in', confidence: 'media' }
      // En el mercado español, una talla de pantalón 36-40 sin más contexto es la numeración EU habitual
      if (ctx.market === 'ES' && !oddInches) return { original, normalized: String(n), system: 'eu_num', confidence: 'media', note: 'Leída como EU por el mercado español.' }
      return { original, normalized: null, system: 'unknown', confidence: 'baja', note: 'Puede ser EU o cintura en pulgadas.' }
    }
    return { original, normalized: null, system: 'unknown', confidence: 'baja' }
  }
  if (ctx.group === 'camisas' && n >= 36 && n <= 47) return { original, normalized: String(n), system: 'collar_cm', confidence: 'media', note: 'Talla de cuello.' }
  if ((ctx.group === 'sastreria' || ctx.group === 'chaquetas') && n >= 44 && n <= 62 && n % 2 === 0) return { original, normalized: String(n), system: 'eu_num', confidence: 'media' }
  return { original, normalized: null, system: 'unknown', confidence: 'baja', note: 'Numeración sin sistema identificable para este tipo de prenda.' }
}
/** Mismo sistema y mismo valor. No hay conversiones entre sistemas sin tabla oficial (no se inventan). */
export const sameSize = (a: SizeToken, b: SizeToken) => a.system !== 'unknown' && a.system === b.system && !!a.normalized && a.normalized === b.normalized

// ── Tallas habituales declaradas («camisa M, pantalón 42, calzado 43») ──
const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
export function parseDeclaredSizes(text?: string | null): { group: SizeGroup; label: string; brand: string | null }[] {
  if (!text) return []
  const out: { group: SizeGroup; label: string; brand: string | null }[] = []
  for (const part of strip(text).split(/[,;\n]+|\s+y\s+/)) {
    const words = part.trim().split(/\s+/); if (words.length < 2) continue
    const gi = words.findIndex((w) => SIZE_GROUPS.some((g) => (g.words as readonly string[]).includes(w.replace(/[:.]/g, ''))))
    if (gi < 0) continue
    const group = SIZE_GROUPS.find((g) => (g.words as readonly string[]).includes(words[gi].replace(/[:.]/g, '')))!.id
    const rest = words.slice(gi + 1).filter((w) => !['talla', 'de', 'la', 'una', 'un', 'el', ':'].includes(w))
    const sizeIdx = rest.findIndex((w) => /^(x{0,3}s|m|x{0,4}l|[234]xl|w?\d{2}(?:[.,]5)?(?:\/\d{2})?)$/i.test(w))
    if (sizeIdx < 0) continue
    const brandWords = rest.slice(sizeIdx + 1).filter((w) => !['en', 'de'].includes(w))
    out.push({ group, label: rest[sizeIdx].toUpperCase(), brand: brandWords.length ? brandWords.join(' ') : null })
  }
  return out
}

// ── PersonalizedSizeResolver ──
export interface SizeEvidence { kind: 'declarada' | 'talla_que_funciona' | 'fit_confirmado' | 'medidas_referencia' | 'etiqueta' | 'mal_ajuste'; size: SizeToken; brand: string | null; weight: number; detail: string; garment_id?: string }
export interface SizeChoice { size: SizeToken; weight: number; brands: string[]; basis: 'respaldada' | 'estimada'; sources: string[] }
export interface GroupSizes {
  group: SizeGroup; label: string; principal: SizeChoice | null; alternatives: SizeChoice[]; discarded: SizeChoice[]
  byBrand: Record<string, SizeToken[]>; confidence: 'alta' | 'media' | 'baja' | null; evidence: SizeEvidence[]; reason: string; missing: string[]; fit_pref: string | null
}
export interface SizeContext { groups: Record<SizeGroup, GroupSizes>; measures_available: string[]; fingerprint: string }
type G = Record<string, any>
const PREF_KEY: Partial<Record<SizeGroup, string>> = { camisetas: 'camisetas', camisas: 'camisas', pantalones: 'pantalones', vaqueros: 'pantalones', chaquetas: 'chaquetas', sastreria: 'chaquetas', calzado: 'calzado' }
const lc = (s?: string | null) => (s ? strip(s).trim() : '')

export function resolveSizes(input: {
  declared?: string | null; garments: G[]; fitScore?: (id: string) => number | null; references?: { garment_id: string; fits_well: boolean }[]
  measures?: Record<string, unknown>; fitPrefs?: Record<string, string>; generalFit?: string | null; market?: string
}): SizeContext {
  const market = input.market ?? 'ES'
  const declared = parseDeclaredSizes(input.declared)
  const refs = new Map((input.references ?? []).map((r) => [r.garment_id, r.fits_well]))
  const measures_available = Object.keys(input.measures ?? {})
  const groups = {} as Record<SizeGroup, GroupSizes>
  for (const def of SIZE_GROUPS) {
    const g = def.id
    const ev: SizeEvidence[] = []
    for (const d of declared.filter((x) => x.group === g)) ev.push({ kind: 'declarada', size: normalizeSize(d.label, { group: g, market }), brand: d.brand, weight: 2, detail: `Talla habitual que indicas: ${def.label.toLowerCase().split(' ')[0]} ${d.label}${d.brand ? ` en ${d.brand}` : ''}.` })
    for (const gm of input.garments.filter((x) => x.wardrobe_status !== 'archived' && sizeGroupOf(x.subcategory, x.category) === g)) {
      const label = gm.size_fit || gm.size_label; if (!label) continue
      const tok = normalizeSize(String(label), { group: g, market })
      const fs = input.fitScore?.(gm.id) ?? null
      const brand = gm.brand ? lc(gm.brand) : null
      const name = gm.name ?? gm.title ?? 'una prenda tuya'
      if (fs != null && fs < 5) { ev.push({ kind: 'mal_ajuste', size: tok, brand, weight: -3, detail: `«${name}» (${label}) no te queda bien según su Fit Assessment confirmado (${fs}/10).`, garment_id: gm.id }); continue }
      if (refs.get(gm.id) === true) ev.push({ kind: 'medidas_referencia', size: tok, brand, weight: 2.5, detail: `«${name}» en ${label}: la marcaste como prenda que te queda bien (con sus medidas).`, garment_id: gm.id })
      else if (fs != null && fs >= 7) ev.push({ kind: 'fit_confirmado', size: tok, brand, weight: 3, detail: `«${name}» en ${label}: ajuste confirmado (${fs}/10).`, garment_id: gm.id })
      else if (gm.size_fit) ev.push({ kind: 'talla_que_funciona', size: tok, brand, weight: 2.5, detail: `«${name}»: indicas que te funciona la ${gm.size_fit}.`, garment_id: gm.id })
      else ev.push({ kind: 'etiqueta', size: tok, brand, weight: 1, detail: `«${name}» lleva la talla ${label} (sin confirmar que te quede bien).`, garment_id: gm.id })
    }
    // Agrupar por talla normalizada (mismo sistema y valor)
    const byKey = new Map<string, SizeChoice>()
    for (const e of ev) {
      if (!e.size.normalized || e.size.system === 'unknown') continue
      const k = `${e.size.system}:${e.size.normalized}`
      const c = byKey.get(k) ?? { size: e.size, weight: 0, brands: [], basis: 'estimada' as const, sources: [] }
      c.weight += e.weight; if (e.brand && !c.brands.includes(e.brand)) c.brands.push(e.brand); c.sources.push(e.kind)
      byKey.set(k, c)
    }
    for (const c of byKey.values()) c.basis = c.sources.some((s) => ['fit_confirmado', 'talla_que_funciona', 'medidas_referencia', 'declarada'].includes(s)) ? 'respaldada' : 'estimada'
    const pos = [...byKey.values()].filter((c) => c.weight > 0).sort((a, z) => z.weight - a.weight)
    const discarded = [...byKey.values()].filter((c) => c.weight <= 0)
    const principal = pos[0] ?? null
    const alternatives = pos.slice(1).filter((c) => c.weight >= 1.5 && c.basis === 'respaldada')
    const byBrand: Record<string, SizeToken[]> = {}
    for (const e of ev.filter((x) => x.brand && x.weight > 0 && x.size.normalized)) (byBrand[e.brand!] ??= []).some((t) => sameSize(t, e.size)) || byBrand[e.brand!].push(e.size)
    const confidence = !principal ? null : principal.weight >= 4.5 || (principal.weight >= 3 && principal.sources.includes('fit_confirmado')) ? 'alta' : principal.weight >= 2 ? 'media' : 'baja'
    const missing: string[] = []
    if (!declared.some((d) => d.group === g)) missing.push(`Tu talla habitual de ${def.label.toLowerCase()} (perfil → Tallas habituales)`)
    if (!ev.some((e) => ['fit_confirmado', 'talla_que_funciona', 'medidas_referencia'].includes(e.kind))) missing.push(`Una prenda de ${def.label.toLowerCase()} que te quede bien, con su talla (o su Fit Assessment confirmado)`)
    missing.push('Guía de tallas oficial de la marca (Channel3 no la publica): sin ella no comparo medidas ni convierto entre sistemas')
    const pref = (PREF_KEY[g] ? input.fitPrefs?.[PREF_KEY[g]!] : null) ?? null
    const reason = !principal ? `Sin datos de tu talla de ${def.label.toLowerCase()}: no puedo comprobar si hay tu talla.`
      : `${principal.size.original} (${SYSTEM_LABEL[principal.size.system]}) por: ${ev.filter((e) => e.size.normalized === principal.size.normalized && e.size.system === principal.size.system).map((e) => e.detail).slice(0, 3).join(' ')}`
      + (pref ? ` Prefieres un ajuste ${pref.toLowerCase()}: lo valora el criterio de corte; la talla no se cambia sin datos.` : '')
    groups[g] = { group: g, label: def.label, principal, alternatives, discarded, byBrand, confidence, evidence: ev, reason, missing, fit_pref: pref }
  }
  const fingerprint = createHash('sha256').update(JSON.stringify({
    d: input.declared ?? '', g: input.garments.map((x) => [x.id, x.size_label ?? null, x.size_fit ?? null, x.brand ?? null, x.subcategory ?? null, x.wardrobe_status ?? null, input.fitScore?.(x.id) ?? null]).sort(),
    r: [...refs.entries()].sort(), m: measures_available.sort(), p: input.fitPrefs ?? {}, f: input.generalFit ?? null,
  })).digest('hex').slice(0, 16)
  return { groups, measures_available, fingerprint }
}

// ── Elegibilidad por talla y disponibilidad de variante ──
export type SizeStatus = 'disponible' | 'stock_desconocido' | 'agotada_en_tu_talla' | 'sin_talla_compatible' | 'tallas_desconocidas' | 'sin_talla_usuario' | 'no_aplica'
export const SIZE_STATUS_LABEL: Record<SizeStatus, string> = {
  disponible: 'Disponible en tu talla', stock_desconocido: 'Tu talla existe, pero su disponibilidad no está comprobada', agotada_en_tu_talla: 'Agotado en tu talla',
  sin_talla_compatible: 'No hay ninguna de tus tallas', tallas_desconocidas: 'La tienda no publica tallas', sin_talla_usuario: 'Indica tu talla para comprobarlo', no_aplica: 'Sin talla',
}
export interface SizeEligibility {
  status: SizeStatus; eligible: boolean; group: SizeGroup | null
  size: { original: string; normalized: string; system: SizeSystem; role: 'principal' | 'alternativa'; also: string[] } | null
  fit_confidence: 'alta' | 'media' | 'baja' | null; basis: 'respaldada' | 'estimada' | null
  equivalence: { method: 'misma_marca' | 'mismo_sistema'; source: string; confidence: 'alta' | 'media' | 'baja' } | null
  availability: 'confirmada' | 'no_verificable' | 'agotada' | null; checked_at: string | null; selected_color: string | null
  reason: string; missing: string[]
}
const MAX_AGE_MIN = 60
/** ¿Hay una variante en una de tus tallas, disponible y comprobada hace poco? Nunca se deduce stock de que el producto aparezca o tenga precio. */
export function sizeEligibility(p: { subcategory?: string | null; category?: string | null; brand?: string | null; variants?: { size: string | null; availability: string }[]; raw_attributes?: Record<string, any> | null },
  sc: SizeContext, opts: { now?: number; checkedAt?: string | null; market?: string | null; maxAgeMin?: number } = {}): SizeEligibility {
  const group = sizeGroupOf(p.subcategory, p.category)
  const base = { group, size: null, fit_confidence: null, basis: null, equivalence: null, availability: null, checked_at: opts.checkedAt ?? null, selected_color: (p.raw_attributes?.selected_color as string) ?? null, missing: [] as string[] }
  if (!group) return { ...base, status: 'no_aplica', eligible: true, reason: 'Este tipo de producto no se elige por talla.' }
  const gs = sc.groups[group]
  if (!gs.principal) return { ...base, status: 'sin_talla_usuario', eligible: false, reason: gs.reason, missing: gs.missing.slice(0, 2) }
  const labels = (p.variants ?? []).map((v) => v.size).filter((x): x is string => !!x)
  if (!labels.length) return { ...base, status: 'tallas_desconocidas', eligible: false, reason: 'La fuente no publica las tallas de este producto: no puedo comprobar si está tu talla.' }
  const brand = lc(p.brand)
  const brandSizes = brand ? gs.byBrand[brand] ?? null : null
  const accepted: { tok: SizeToken; role: 'principal' | 'alternativa'; choice: SizeChoice; brandMatch: boolean }[] = []
  if (brandSizes) for (const t of brandSizes) { const ch = [gs.principal, ...gs.alternatives].find((c) => c && sameSize(c.size, t)) ?? { size: t, weight: 2, brands: [brand], basis: 'respaldada' as const, sources: ['marca'] }; accepted.push({ tok: t, role: gs.principal && sameSize(gs.principal.size, t) ? 'principal' : 'alternativa', choice: ch, brandMatch: true }) }
  for (const c of [gs.principal, ...gs.alternatives]) if (c && !accepted.some((a) => sameSize(a.tok, c.size)) && !gs.discarded.some((d) => sameSize(d.size, c.size) && d.brands.includes(brand))) accepted.push({ tok: c.size, role: c === gs.principal ? 'principal' : 'alternativa', choice: c, brandMatch: false })
  const variants = (p.variants ?? []).filter((v) => v.size).map((v) => ({ v, tok: normalizeSize(v.size!, { group, siblings: labels, market: opts.market ?? null }) }))
  const matches = variants.map((x) => ({ ...x, acc: accepted.find((a) => sameSize(a.tok, x.tok)) })).filter((x) => x.acc)
    .sort((a, z) => Number(z.acc!.role === 'principal') - Number(a.acc!.role === 'principal') || Number(z.acc!.brandMatch) - Number(a.acc!.brandMatch))
  if (!matches.length) {
    const systems = [...new Set(variants.map((x) => x.tok.system))]
    const mine = [...new Set(accepted.map((a) => a.tok.system))]
    const crossSystem = !systems.some((s) => mine.includes(s))
    return { ...base, status: 'sin_talla_compatible', eligible: false, reason: crossSystem ? `Las tallas del producto (${labels.slice(0, 6).join(', ')}) están en ${systems.map((s) => SYSTEM_LABEL[s]).join(' / ')} y las tuyas en ${mine.map((s) => SYSTEM_LABEL[s]).join(' / ')}: sin tabla oficial de la marca no las convierto.` : `No está en tu talla (${accepted.map((a) => a.tok.original).join(' o ')}); tallas publicadas: ${labels.slice(0, 8).join(', ')}.` }
  }
  const age = opts.checkedAt ? ((opts.now ?? Date.now()) - new Date(opts.checkedAt).getTime()) / 60e3 : Infinity
  const fresh = age <= (opts.maxAgeMin ?? MAX_AGE_MIN)
  const inStock = matches.filter((m) => m.v.availability === 'in_stock' || m.v.availability === 'limited')
  const best = (inStock[0] ?? matches[0])
  const acc = best.acc!
  const fitConf = acc.brandMatch ? (acc.choice.basis === 'respaldada' ? 'alta' : 'media') : gs.confidence === 'alta' ? 'media' : 'baja'
  const equivalence = acc.brandMatch ? { method: 'misma_marca' as const, source: `Tu talla en ${p.brand} según prendas tuyas de esa marca`, confidence: acc.choice.basis === 'respaldada' ? 'alta' as const : 'media' as const }
    : { method: 'mismo_sistema' as const, source: `Misma talla (${SYSTEM_LABEL[best.tok.system]}) que te funciona en otras marcas; puede variar entre marcas`, confidence: best.tok.confidence === 'alta' && gs.confidence === 'alta' ? 'media' as const : 'baja' as const }
  const size = { original: best.v.size!, normalized: best.tok.normalized!, system: best.tok.system, role: acc.role, also: inStock.filter((m) => m !== best).map((m) => m.v.size!) }
  const common = { ...base, size, fit_confidence: fitConf as 'alta' | 'media' | 'baja', basis: acc.choice.basis, equivalence, missing: acc.brandMatch ? [] : [`Tu talla en ${p.brand ?? 'esta marca'} (una prenda suya que te quede bien) o su guía oficial`] }
  if (inStock.length && fresh) return { ...common, status: 'disponible', eligible: true, availability: 'confirmada', reason: `Hay ${best.v.size} disponible (comprobado ${opts.checkedAt ? new Date(opts.checkedAt).toLocaleString('es-ES') : ''}).` }
  if (matches.every((m) => m.v.availability === 'out_of_stock')) return { ...common, status: 'agotada_en_tu_talla', eligible: false, availability: 'agotada', reason: `Agotado en ${matches.map((m) => m.v.size).join(' y ')}.` }
  return { ...common, status: 'stock_desconocido', eligible: false, availability: 'no_verificable', reason: inStock.length ? 'La disponibilidad de tu talla no se ha comprobado recientemente.' : `La fuente no indica si ${matches.map((m) => m.v.size).join(' / ')} está disponible.` }
}

/** Valores para el filtro `attributes.size` / `shoe-size` de Channel3 (solo prefiltro: la validación es local). */
const C3_ALPHA: Record<string, string> = { XXXS: 'Triple extra small (XXXS)', XXS: 'Double extra small (XXS)', XS: 'Extra small (XS)', S: 'Small (S)', M: 'Medium (M)', L: 'Large (L)', XL: 'Extra large (XL)', XXL: 'Double extra large (XXL)', XXXL: 'Triple extra large (XXXL)', '4XL': 'Four extra large (4XL)' }
export function channel3SizeFilter(group: SizeGroup | null, sc: SizeContext | null): { key: 'size' | 'shoe-size'; values: string[] } | null {
  if (!group || !sc) return null
  const gs = sc.groups[group]
  const toks = [gs.principal, ...gs.alternatives].filter(Boolean).map((c) => c!.size).concat(...Object.values(gs.byBrand))
  const values = [...new Set(toks.map((t) => (t.system === 'alpha' ? C3_ALPHA[t.normalized!] : ['eu_num', 'shoe_eu', 'collar_cm'].includes(t.system) ? t.normalized : t.system === 'waist_in' ? t.normalized!.replace(/^W(\d+).*/, '$1') : null)).filter((x): x is string => !!x))]
  if (!values.length) return null
  return { key: group === 'calzado' ? 'shoe-size' : 'size', values: values.slice(0, 6) }
}
