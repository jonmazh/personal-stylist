import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Bundle } from '@/lib/profile/data'
import { evaluateGarment } from '@/lib/wardrobe/compatibility'
import { evaluatePurchase, normalizeWeights, PURCHASE_WEIGHTS } from '@/lib/shopping/evaluate'
import { VIRTUAL_ID } from '@/lib/shopping/priority'
import { buildShopperContext } from '@/lib/shopping/intelligence/context'
import { analyzeColor, saturationOf, suggestColors } from '@/lib/shopping/intelligence/color'
import { discoveryQueries } from '@/lib/shopping/intelligence/discovery'
import { groupHits, rankHits } from '@/lib/shopping/intelligence/rank'
import { queryFromNeed } from '@/lib/shopping/catalog/query'
import { NeedSpec } from '@/lib/shopping/taxonomy'

const bundle = (o: { temp?: string | null; avoids?: string[]; fit?: Record<string, string>; general?: string } = {}): Bundle => ({
  profile: { fit_pref: o.general ?? 'Regular', budget_max: 90 }, measures: {}, photos: [],
  color: o.temp === null ? { likes: [], avoids: o.avoids ?? [] } : { temperature: o.temp ?? 'Cálida', temperature_source: 'usuario', temperature_status: 'validado', likes: [], avoids: o.avoids ?? [] },
  style: { influences: [{ style: 'smart-casual', role: 'principal', weight: 70 }] }, life: { life: { trabajo: 50, ocio: 50 }, work_formality: 'Smart casual', climate: 'Cuatro estaciones marcadas', constraints: [] },
  fit: { prefs: o.fit ?? { pantalones: 'Recto', camisetas: 'Regular' } }, goals: null, validated: { a3: true }, observations: [], blueprints: [], garments: [], references: [], refRatings: [], styleRefs: [], colorAnalyses: [], chatValidated: false,
} as unknown as Bundle)
let n = 0
const G = (name: string, category: string, subcategory: string, c: string, f: number, x: Record<string, unknown> = {}) => ({ id: `00000000-0000-4000-8000-${String(++n).padStart(12, '1')}`, name, category, subcategory, primary_color: c, formality_level: f, wardrobe_status: 'active', pattern: 'Liso', occasions: ['trabajo', 'ocio'], seasons: ['primavera', 'otono', 'invierno'], silhouette: 'Regular', ...x })
const navyWardrobe = () => [G('Sudadera marino', 'top', 'sweatshirt', 'Azul marino', 2), G('Jersey marino', 'top', 'knit', 'Azul marino', 3), G('Polo marino', 'top', 'polo', 'Azul marino', 3), G('Camiseta marino', 'top', 'tee', 'Azul marino', 2),
  G('Chino marino', 'bottom', 'chinos', 'Azul marino', 3, { cut: 'Recto' }), G('Vaquero', 'bottom', 'jeans', 'Denim', 2, { cut: 'Recto' }), G('Chaqueta marino', 'outerwear', 'jacket', 'Azul marino', 3),
  G('Mocasín marrón', 'footwear', 'loafers', 'Marrón', 3), G('Zapatilla blanca', 'footwear', 'sneakers', 'Blanco', 2)]
const NEED_TOP = { id: 'n-top', title: 'Parte superior para ocio', type: 'need', spec: { category: 'top' }, priority_level: 'high' }
const env = (b: Bundle, gs: Record<string, any>[], extra: Record<string, unknown> = {}) => ({ garments: gs, evals: new Map(gs.map((g) => [g.id, evaluateGarment(g, b, { others: gs, imageCount: 1 })])), bundle: b, openNeeds: [NEED_TOP], staleDays: 0, analyzed: true, now: new Date('2026-10-15'), ...extra })
const prod = (name: string, cat: string, sub: string, c: string | null, x: Record<string, unknown> = {}) => ({ product_name: name, category: cat, subcategory: sub, primary_color: c, colors: c ? [c] : [], formality_level: 2, silhouette: 'Regular', seasons: ['otono', 'invierno'], current_price: 59, confirmed_composition: '100% algodón', field_sources: {}, images: [], variants: [{ size: 'M', availability: 'in_stock' }], ...x })
const pts = (e: ReturnType<typeof evaluatePurchase>, k: string) => e.criteria.find((c) => c.key === k)!.points

test('pesos de la especificación (25/20/15/20/10/10), configurables y normalizados', () => {
  assert.deepEqual({ ...PURCHASE_WEIGHTS }, { color: 25, cut: 20, style: 15, wardrobe: 20, need: 10, quality: 10 })
  const w = normalizeWeights({ color: 50 }); assert.equal(Math.round(Object.values(w).reduce((s, x) => s + x, 0)), 100); assert.ok(w.color > 25)
  const e = evaluatePurchase(prod('Sudadera crudo', 'top', 'sweatshirt', 'Crudo'), { ...env(bundle(), navyWardrobe()), weights: { color: 50 } })
  assert.equal(e.weights.color, w.color)
})

test('1. el mismo producto obtiene puntuaciones distintas para perfiles distintos', () => {
  const p = prod('Sudadera camel', 'top', 'sweatshirt', 'Camel')
  const warm = evaluatePurchase(p, env(bundle({ temp: 'Cálida' }), navyWardrobe())), cool = evaluatePurchase(p, env(bundle({ temp: 'Fría' }), navyWardrobe()))
  assert.ok(warm.score > cool.score, `${warm.score} > ${cool.score}`); assert.ok(pts(warm, 'color') > pts(cool, 'color'))
  assert.equal(warm.color!.personal.verdict, 'favorece'); assert.equal(cool.color!.personal.verdict, 'con matices')
  assert.notEqual(cool.verdict, 'buy', 'un color que no te favorece no puede ser «compra recomendada»')
})

test('2. un color favorable pero redundante no gana: azul marino con un armario saturado de azul marino', () => {
  const b = bundle({ temp: 'Cálida' }), gs = navyWardrobe()
  const navy = evaluatePurchase(prod('Sudadera marino', 'top', 'sweatshirt', 'Azul marino'), env(b, gs))
  const ecru = evaluatePurchase(prod('Sudadera crudo', 'top', 'sweatshirt', 'Crudo'), env(b, gs))
  assert.equal(navy.color!.personal.value! >= 0.75, true, 'el marino te favorece')
  assert.equal(navy.color!.wardrobe.saturation, 'saturado'); assert.equal(navy.color!.label, 'redundante')
  assert.equal(ecru.color!.label, 'favorable-poco-representado')
  assert.ok(ecru.score > navy.score && pts(ecru, 'color') > pts(navy, 'color'))
  assert.equal(navy.verdict, 'skip'); assert.ok(navy.discard_reasons.length)
  assert.ok(['buy', 'consider'].includes(ecru.verdict))
  assert.deepEqual(rankHits([{ id: 'navy', evaluation: navy }, { id: 'ecru', evaluation: ecru }]).map((h) => h.id), ['ecru', 'navy'])
})

test('3. compatible con el estilo pero no con las preferencias de corte: pierde puntos', () => {
  const b = bundle(), gs = navyWardrobe()
  const straight = evaluatePurchase(prod('Pantalón gris recto', 'bottom', 'trousers', 'Gris', { cut: 'Recto', formality_level: 3 }), env(b, gs))
  const slim = evaluatePurchase(prod('Pantalón gris slim', 'bottom', 'trousers', 'Gris', { cut: 'Slim', formality_level: 3 }), env(b, gs))
  assert.ok(pts(straight, 'cut') > pts(slim, 'cut')); assert.ok(straight.score > slim.score)
  assert.match(slim.criteria.find((c) => c.key === 'cut')!.reasons.join(' '), /Prefieres pantalones con corte recto/)
})

test('4. una prenda que crea outfits nuevos recibe reconocimiento (con IDs reales del Outfit Engine)', () => {
  const b = bundle(), full = navyWardrobe(), onlyTops = full.filter((g) => g.category === 'top')
  const p = prod('Sudadera crudo', 'top', 'sweatshirt', 'Crudo')
  const withWardrobe = evaluatePurchase(p, env(b, full)), alone = evaluatePurchase(p, env(b, onlyTops))
  assert.ok(withWardrobe.wva.new_outfits > 0); assert.equal(alone.wva.new_outfits, 0)
  assert.ok(pts(withWardrobe, 'wardrobe') > pts(alone, 'wardrobe'))
  const ids = new Set(full.map((g) => g.id))
  assert.ok(withWardrobe.wva.outfit_samples.length > 0)
  for (const s of withWardrobe.wva.outfit_samples) { assert.ok(s.garment_ids.includes(VIRTUAL_ID)); assert.ok(s.garment_ids.every((id) => id === VIRTUAL_ID || ids.has(id)), 'solo prendas reales') }
  assert.ok(withWardrobe.combines_with.every((g) => ids.has(g.id)))
})

test('5. una prenda redundante se penaliza aunque guste', () => {
  const b = bundle(), gs = [...navyWardrobe(), G('Chino beige', 'bottom', 'chinos', 'Beige', 3, { cut: 'Recto' }), G('Chino beige 2', 'bottom', 'chinos', 'Beige', 3, { cut: 'Recto' })]
  const dup = evaluatePurchase(prod('Chino beige recto', 'bottom', 'chinos', 'Beige', { cut: 'Recto', formality_level: 3 }), env(b, gs))
  const fresh = evaluatePurchase(prod('Pantalón oliva recto', 'bottom', 'trousers', 'Oliva', { cut: 'Recto', formality_level: 3 }), env(b, gs))
  assert.equal(dup.redundancy.level, 'alta'); assert.ok(dup.redundancy_score >= 80); assert.equal(dup.verdict, 'skip')
  assert.ok(pts(dup, 'wardrobe') < pts(fresh, 'wardrobe')); assert.equal(dup.wva.new_outfits, 0)
  assert.match(dup.verdict_text, /Ya tienes 2 prendas que cumplen prácticamente la misma función/)
})

test('6. la falta de datos no se interpreta como certeza negativa: queda neutra y baja la confianza', () => {
  const b = bundle(), gs = navyWardrobe()
  const unknown = evaluatePurchase(prod('Sudadera', 'top', 'sweatshirt', null, { silhouette: null, confirmed_composition: null, current_price: null }), env(b, gs))
  const avoided = evaluatePurchase(prod('Sudadera rosa', 'top', 'sweatshirt', 'Rosa'), env(bundle({ avoids: ['Rosa'] }), gs))
  const color = unknown.criteria.find((c) => c.key === 'color')!
  assert.equal(color.known, false); assert.equal(color.points, 12.5, 'neutra: 50 % del peso')
  assert.ok(pts(unknown, 'color') > pts(avoided, 'color'), 'desconocido puntúa más que un color que evitas')
  const known = evaluatePurchase(prod('Sudadera crudo', 'top', 'sweatshirt', 'Crudo'), env(b, gs))
  assert.ok(unknown.confidence_score < known.confidence_score); assert.ok(unknown.completeness < known.completeness)
  assert.ok(unknown.missing_info.some((m) => /color/i.test(m)))
  const noProfile = evaluatePurchase(prod('Sudadera camel', 'top', 'sweatshirt', 'Camel'), env(bundle({ temp: null }), gs))
  assert.equal(noProfile.color!.personal.value, null); assert.equal(noProfile.color!.label, 'sin-datos')
  assert.ok(noProfile.criteria.find((c) => c.key === 'color')!.missing.some((m) => /no puedo afirmar que este color te favorezca/.test(m)), 'sin colorimetría lo reconoce')
  assert.ok(pts(noProfile, 'color') < pts(known, 'color'), 'sin colorimetría no se afirma que favorezca')
})

test('7. las recomendaciones cambian cuando cambia el perfil', () => {
  const gs = navyWardrobe(), p = prod('Pantalón gris amplio', 'bottom', 'trousers', 'Gris', { cut: 'Wide', formality_level: 3 })
  const before = evaluatePurchase(p, env(bundle({ fit: { pantalones: 'Recto' } }), gs)), after = evaluatePurchase(p, env(bundle({ fit: { pantalones: 'Amplio' } }), gs))
  assert.ok(pts(after, 'cut') > pts(before, 'cut') && after.score > before.score, `${before.score} → ${after.score}`)
  const c1 = buildShopperContext({ bundle: bundle({ fit: { pantalones: 'Recto' } }), garments: gs, evals: new Map() }), c2 = buildShopperContext({ bundle: bundle({ fit: { pantalones: 'Amplio' } }), garments: gs, evals: new Map() })
  assert.notEqual(c1.hash, c2.hash, 'la huella del perfil cambia (invalida la caché)')
  const avoid = evaluatePurchase(prod('Sudadera crudo', 'top', 'sweatshirt', 'Crudo'), env(bundle({ avoids: ['Crudo'] }), gs))
  assert.equal(avoid.verdict, 'skip'); assert.match(avoid.discard_reasons.join(' '), /color que evitas/)
})

test('8. las recomendaciones cambian cuando cambia el armario', () => {
  const b = bundle(), gs = navyWardrobe(), p = prod('Sudadera crudo', 'top', 'sweatshirt', 'Crudo')
  const before = evaluatePurchase(p, env(b, gs))
  const more = [...gs, G('Sudadera crudo', 'top', 'sweatshirt', 'Crudo', 2), G('Jersey crudo', 'top', 'knit', 'Crudo', 3), G('Camiseta crudo', 'top', 'tee', 'Crudo', 2)]
  const after = evaluatePurchase(p, env(b, more))
  assert.equal(before.color!.wardrobe.saturation, 'ausente'); assert.equal(after.color!.wardrobe.saturation, 'saturado')
  assert.ok(after.score < before.score); assert.equal(after.verdict, 'skip')
  assert.notEqual(buildShopperContext({ bundle: b, garments: gs, evals: new Map() }).hash, buildShopperContext({ bundle: b, garments: more, evals: new Map() }).hash)
})

test('9. los productos descartados no aparecen como recomendaciones principales', () => {
  const b = bundle(), gs = navyWardrobe()
  const hits = [prod('Sudadera marino', 'top', 'sweatshirt', 'Azul marino'), prod('Sudadera crudo', 'top', 'sweatshirt', 'Crudo'), prod('Sudadera camel', 'top', 'sweatshirt', 'Camel'), prod('Sudadera rosa', 'top', 'sweatshirt', 'Rosa')]
    .map((p) => ({ ...p, evaluation: evaluatePurchase(p, env(bundle({ avoids: ['Rosa'] }), gs)) }))
  const ranked = rankHits(hits)
  const g = groupHits(ranked)
  const names = (is: number[]) => is.map((i) => ranked[i].product_name)
  assert.ok(!names(g.recommended).some((x) => /marino|rosa/.test(x)), names(g.recommended).join(', '))
  assert.deepEqual(names(g.not_recommended).sort(), ['Sudadera marino', 'Sudadera rosa'])
  assert.ok(g.best_wardrobe != null && !/marino|rosa/.test(ranked[g.best_wardrobe].product_name))
  assert.ok(ranked.slice(-2).every((h) => h.evaluation!.verdict === 'skip'), 'los descartados quedan al final')
  void b
})

test('Color Intelligence y búsqueda ampliada: favorables y escasos primero, sin limitarse al color pedido', () => {
  assert.equal(saturationOf(0, 4), 'ausente'); assert.equal(saturationOf(1, 5), 'escaso'); assert.equal(saturationOf(3, 9), 'saturado'); assert.equal(saturationOf(2, 3), 'saturado')
  const ctx = buildShopperContext({ bundle: bundle({ temp: 'Cálida' }), garments: navyWardrobe(), evals: new Map() })
  const sug = suggestColors('top', ctx)
  assert.ok(sug.length && !sug.includes('Azul marino'), sug.join(', '))
  const a = analyzeColor('Azul marino', 'top', ctx)!
  assert.equal(a.wardrobe.inCategory, 4); assert.ok(a.combinability.garmentIds.length > 0)
  const q = queryFromNeed({ spec: NeedSpec.parse({ category: 'footwear', subcategory: 'loafers', colors: ['Negro'] }) })
  const plan = discoveryQueries(q, ctx)
  assert.equal(plan.queries[0].text, 'Mocasines hombre', 'primero el tipo de prenda, sin exigir color')
  assert.ok(plan.queries.every((x) => x.colors.length === 0), 'el color no filtra el descubrimiento; lo valora la evaluación')
  assert.ok(plan.queries.some((x) => /negro/.test(x.text)), 'lo pedido también se busca')
  assert.ok(plan.notes.some((x) => /colores que te favorecen y faltan/.test(x)))
  const noColor = discoveryQueries(q, buildShopperContext({ bundle: bundle({ temp: null }), garments: navyWardrobe(), evals: new Map() }))
  assert.ok(noColor.notes.some((x) => /No conozco tu colorimetría/.test(x)))
})
