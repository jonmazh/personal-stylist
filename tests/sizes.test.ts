import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { Bundle } from '@/lib/profile/data'
import { evaluateGarment } from '@/lib/wardrobe/compatibility'
import { evaluatePurchase, PURCHASE_WEIGHTS } from '@/lib/shopping/evaluate'
import { VIRTUAL_ID } from '@/lib/shopping/priority'
import { buildShopperContext } from '@/lib/shopping/intelligence/context'
import { groupHits, rankHits } from '@/lib/shopping/intelligence/rank'
import { classifyGender, genderGate } from '@/lib/shopping/intelligence/gender'
import { channel3SizeFilter, normalizeSize, parseDeclaredSizes, resolveSizes, sizeEligibility, sizeGroupOf } from '@/lib/shopping/intelligence/sizes'
import { ageOut, eligibilityOf, gateVerdict } from '@/lib/shopping/intelligence/eligibility'
import { buildSearchBody, channel3Config, normalizeChannel3Product } from '@/lib/shopping/catalog/channel3'
import { normalizeUcpProduct } from '@/lib/shopping/catalog/ucp'
import { queryFromText } from '@/lib/shopping/catalog/query'
import { searchCacheKey } from '@/lib/shopping/catalog-service'

/** Datos reales de Channel3 (Zara España, 10-11-2026): la talla 48 de estos vaqueros figura como OutOfStock en la ficha. */
const fx = (f: string) => JSON.parse(readFileSync(`tests/fixtures/${f}`, 'utf8'))
const JEANS = fx('channel3-product-zara-jeans-sizes.json'), CARGO = fx('channel3-product-zara-cargo-mixed-sizes.json'), BERSHKA = fx('channel3-product-bershka-gb.json'), ZARA_SEARCH = fx('channel3-search-zara-es.json')
const CFG = { ...channel3Config({} as NodeJS.ProcessEnv), key: 'k' }
const NOW = Date.now()
const c3 = (raw: unknown, market = 'ES', fetched = new Date(NOW - 5 * 60e3)) => normalizeChannel3Product(raw, { market, cfg: CFG, now: fetched })!
let k = 0
const G = (name: string, category: string, subcategory: string, x: Record<string, unknown> = {}) => ({ id: `00000000-0000-4000-8000-${String(++k).padStart(12, '7')}`, name, category, subcategory, primary_color: 'Gris', formality_level: 2, wardrobe_status: 'active', pattern: 'Liso', occasions: ['ocio'], seasons: ['otono'], silhouette: 'Regular', ...x })

test('normalizador: conserva la etiqueta original, identifica el sistema por el rango y no adivina cuando es ambiguo', () => {
  const zara = ['36', '38', '40', '42', '44', '46', '48']
  assert.deepEqual(normalizeSize('42', { group: 'vaqueros', siblings: zara }), { original: '42', normalized: '42', system: 'eu_num', confidence: 'alta' })
  assert.equal(normalizeSize('38', { group: 'vaqueros', siblings: zara }).system, 'eu_num')
  const uk = ['26', '28', '29', '30', '31', '32', '34', '36']
  assert.equal(normalizeSize('32', { group: 'vaqueros', siblings: uk, market: 'GB' }).normalized, 'W32')
  assert.equal(normalizeSize('36', { group: 'vaqueros', siblings: uk, market: 'GB' }).system, 'waist_in')
  assert.equal(normalizeSize('38', { group: 'pantalones', siblings: ['36', '38', '40'] }).system, 'unknown', 'sin contexto, 38 puede ser EU o pulgadas')
  assert.equal(normalizeSize('Medium (M)', { group: 'camisetas' }).normalized, 'M'); assert.equal(normalizeSize('XXL', { group: 'punto' }).normalized, 'XXL')
  assert.equal(normalizeSize('W32 L34', { group: 'vaqueros' }).normalized, 'W32 L34')
  assert.equal(normalizeSize('43', { group: 'calzado' }).system, 'shoe_eu'); assert.equal(normalizeSize('9', { group: 'calzado' }).system, 'unknown')
  // Lista real mixta de Zara (29-34 en pulgadas que no existen + 38-44 EU)
  const labels = (CARGO.variants.options as { name: string; values: { label: string }[] }[]).find((o) => /talla|size/i.test(o.name))!.values.map((v) => v.label)
  assert.equal(normalizeSize('31', { group: 'pantalones', siblings: labels }).system, 'waist_in'); assert.equal(normalizeSize('42', { group: 'pantalones', siblings: labels }).system, 'eu_num')
})

test('4. tallas distintas por categoría (no una talla global) y con su procedencia', () => {
  assert.deepEqual(parseDeclaredSizes('camisa M, pantalón 42, calzado 43').map((d) => [d.group, d.label]), [['camisas', 'M'], ['pantalones', '42'], ['calzado', '43']])
  const sc = resolveSizes({ declared: 'camisa M, pantalón 42, calzado 43; camiseta L en Zara', garments: [G('Sudadera', 'top', 'hoodie', { size_fit: 'L', brand: 'Zara' }), G('Vaquero', 'bottom', 'jeans', { size_label: '44' })] })
  assert.equal(sc.groups.camisas.principal!.size.normalized, 'M')
  assert.equal(sc.groups.pantalones.principal!.size.normalized, '42')
  assert.equal(sc.groups.calzado.principal!.size.system, 'shoe_eu')
  assert.equal(sc.groups.punto.principal!.size.normalized, 'L')
  assert.equal(sc.groups.camisetas.principal!.size.normalized, 'L'); assert.deepEqual(sc.groups.camisetas.byBrand.zara.map((t) => t.normalized), ['L'])
  assert.equal(sc.groups.vaqueros.principal!.basis, 'estimada', 'una etiqueta sin confirmar el ajuste es solo una estimación')
  assert.equal(sc.groups.vaqueros.confidence, 'baja')
  assert.equal(sc.groups.chaquetas.principal, null); assert.ok(sc.groups.chaquetas.missing.length)
  // Un Fit Assessment malo descarta esa talla; uno bueno la respalda
  const fs = new Map<string, number>()
  const bad = G('Chino L', 'bottom', 'chinos', { size_label: 'L', brand: 'Mango' }), good = G('Chino M', 'bottom', 'chinos', { size_label: 'M', brand: 'Mango' })
  fs.set(bad.id, 3); fs.set(good.id, 8)
  const sc2 = resolveSizes({ garments: [bad, good], fitScore: (id) => fs.get(id) ?? null })
  assert.equal(sc2.groups.pantalones.principal!.size.normalized, 'M'); assert.equal(sc2.groups.pantalones.principal!.basis, 'respaldada')
  assert.equal(sc2.groups.pantalones.discarded[0].size.normalized, 'L')
  assert.ok(sc2.groups.pantalones.missing.some((m) => /guía de tallas oficial/i.test(m)))
})

const scJeans = (decl = 'vaqueros 42') => resolveSizes({ declared: decl, garments: [] })

test('6. disponible en general pero agotado en tu talla → excluido; 8. con tu talla en stock confirmado → apto', () => {
  const p = c3(JEANS)
  assert.equal(p.availability_status, 'in_stock', 'el producto, en general, está disponible')
  const out = eligibilityOf(p, scJeans('vaqueros 48'), NOW)
  assert.equal(out.size.status, 'agotada_en_tu_talla'); assert.equal(out.excluded, true); assert.equal(out.ok, false)
  const ok = eligibilityOf(p, scJeans('vaqueros 42'), NOW)
  assert.equal(ok.ok, true); assert.equal(ok.size.status, 'disponible'); assert.equal(ok.size.availability, 'confirmada')
  assert.equal(ok.size.size!.original, '42'); assert.equal(ok.size.size!.role, 'principal'); assert.equal(ok.gender.class, 'male')
})

test('7. disponible solo en tallas que no son las tuyas → excluido; tallas en otro sistema → no se convierten', () => {
  const p = c3(JEANS)
  const e = eligibilityOf(p, scJeans('vaqueros 54'), NOW)
  assert.equal(e.size.status, 'sin_talla_compatible'); assert.equal(e.excluded, true)
  // Bershka Reino Unido publica 26-36 (pulgadas): una 42 EU no se convierte sin tabla oficial
  const b = c3(BERSHKA, 'GB')
  const x = sizeEligibility(b, scJeans('vaqueros 42'), { checkedAt: new Date(NOW).toISOString(), market: 'GB', now: NOW })
  assert.equal(x.status, 'sin_talla_compatible'); assert.match(x.reason, /no las convierto/)
})

test('5. las equivalencias entre marcas no se inventan: misma marca = alta; otra marca = misma talla con confianza limitada', () => {
  const p = c3(JEANS)
  const other = eligibilityOf(p, resolveSizes({ declared: 'vaqueros 42', garments: [] }), NOW)
  assert.equal(other.size.equivalence!.method, 'mismo_sistema'); assert.notEqual(other.size.fit_confidence, 'alta'); assert.notEqual(other.size.equivalence!.confidence, 'alta')
  assert.ok(other.size.missing.some((m) => /Zara/.test(m)))
  const zara = eligibilityOf(p, resolveSizes({ garments: [G('Vaquero Zara', 'bottom', 'jeans', { size_fit: '40', brand: 'Zara' })] }), NOW)
  assert.equal(zara.size.size!.original, '40'); assert.equal(zara.size.equivalence!.method, 'misma_marca'); assert.equal(zara.size.fit_confidence, 'alta')
  // Una M de otra marca no se da por buena para un producto con tallas numéricas
  assert.equal(eligibilityOf(p, resolveSizes({ declared: 'vaqueros M', garments: [] }), NOW).size.status, 'sin_talla_compatible')
})

test('9. disponibilidad desconocida o antigua o de otro mercado → nunca aparece como disponible', () => {
  // Resultado de búsqueda sin ficha: Channel3 no hidrata la disponibilidad por talla
  const fromSearch = c3(ZARA_SEARCH.products.find((x: { variants?: unknown }) => x.variants))
  const sc = resolveSizes({ declared: 'pantalón M, pantalón XL', garments: [] })
  const e = eligibilityOf(fromSearch, sc, NOW)
  assert.equal(e.ok, false); assert.equal(e.excluded, false); assert.equal(e.size.status, 'stock_desconocido'); assert.equal(e.size.availability, 'no_verificable')
  // Sin tallas publicadas: no se infiere stock por tener precio o aparecer en resultados
  const noSizes = c3(ZARA_SEARCH.products[0])
  assert.equal(noSizes.current_price != null, true); assert.equal(eligibilityOf(noSizes, sc, NOW).size.status, 'tallas_desconocidas')
  // Comprobación antigua (2 h)
  const old = c3(JEANS, 'ES', new Date(NOW - 2 * 3600e3))
  assert.equal(eligibilityOf(old, scJeans(), NOW).size.status, 'stock_desconocido')
  // Otro mercado: stock comprobado en Reino Unido no prueba stock en España
  const gb = c3(BERSHKA, 'GB')
  assert.equal(eligibilityOf(gb, resolveSizes({ declared: 'vaqueros 42', garments: [] }), NOW).size.status, 'sin_talla_compatible', '42 EU frente a pulgadas: sistema distinto')
  const gbOk = eligibilityOf(gb, resolveSizes({ declared: 'vaqueros W32', garments: [] }), NOW, 'ES')
  assert.equal(gbOk.size.status, 'stock_desconocido'); assert.match(gbOk.size.reason, /España/)
  // Una búsqueda guardada envejece: lo confirmado deja de estarlo al mostrarla más tarde
  const h = { ...c3(JEANS), eligibility: eligibilityOf(c3(JEANS), scJeans(), NOW), evaluation: { verdict: 'buy', verdict_text: 'Compra recomendada', score: 80 } }
  const later = ageOut(h, NOW + 3 * 3600e3)
  assert.equal(later.eligibility.ok, false); assert.equal(later.evaluation.verdict, 'consider')
  // Sin talla del usuario: nada se puede confirmar
  assert.equal(eligibilityOf(c3(JEANS), resolveSizes({ garments: [] }), NOW).size.status, 'sin_talla_usuario')
})

test('1-3. moda masculina por datos estructurados: mujer e infantil fuera; unisex solo con regla explícita; el nombre no cuenta', () => {
  const fem = c3({ ...JEANS, gender: 'female' }); assert.equal(genderGate(fem).excluded, true)
  const kid = c3({ ...JEANS, age: 'kids' }); assert.equal(genderGate(kid).excluded, true); assert.equal(classifyGender(kid).gender, 'kids')
  const baby = c3({ ...JEANS, category: { slug: 'baby-toddler-bottoms', path: [{ slug: 'apparel-accessories' }, { slug: 'baby-toddler-clothing' }] } })
  assert.equal(classifyGender(baby).gender, 'kids')
  const noGender = c3({ ...JEANS, gender: null, title: "Men's straight jeans" })
  assert.equal(classifyGender(noGender).gender, 'unknown', 'el nombre comercial no basta'); assert.equal(genderGate(noGender).ok, false); assert.equal(genderGate(noGender).excluded, false)
  // UCP (EME Studios, etiquetas reales): «mujer» + «FOR EVERYONE» en un pantalón → unisex con patrón por género: no apto
  const eme = fx('eme-search-catalog.json').products
  const solan = normalizeUcpProduct(eme.find((x: { title: string }) => /Solan/.test(x.title)), { name: 'EME Studios' })!
  assert.equal(classifyGender(solan).gender, 'unisex'); assert.equal(genderGate(solan).ok, false)
  const ledger = normalizeUcpProduct(eme.find((x: { title: string }) => /Ledger/.test(x.title)), { name: 'EME Studios' })!
  assert.equal(classifyGender(ledger).gender, 'male')
  // Unisex aceptado en una prenda de tallaje neutro (regla explícita)
  assert.equal(genderGate({ subcategory: 'tee', category: 'top', raw_attributes: { gender: 'unisex' } }).ok, true)
  assert.equal(genderGate({ subcategory: 'trousers', category: 'bottom', raw_attributes: { gender: 'unisex' } }).ok, false)
  // En el agrupado: excluidos y pendientes nunca son recomendados
  const sc = scJeans()
  const hits = [fem, noGender, c3(JEANS)].map((p) => ({ ...p, eligibility: eligibilityOf(p, sc, NOW), evaluation: { score: 90, verdict: 'buy', wva: { score: 80 }, confidence_score: 80, criteria: [{ key: 'need', value: 1 }] } }))
  const g = groupHits(rankHits(hits))
  const r = rankHits(hits)
  assert.deepEqual(g.recommended.map((i) => r[i].eligibility.gender.class), ['male'])
  assert.equal(g.excluded.length, 1); assert.equal(g.pending.length, 1)
})

test('Channel3: la petición lleva hombre, adulto y tus tallas (prefiltro) sin datos personales', () => {
  const sc = resolveSizes({ declared: 'pantalón 42, camiseta M', garments: [] })
  const q = queryFromText('pantalón beige', null)
  const body = buildSearchBody(q, 'ES', ['zara.com'], CFG, channel3SizeFilter(sizeGroupOf(q.subcategory, q.category), sc)) as { filters: Record<string, unknown> }
  assert.equal(body.filters.gender, 'male'); assert.deepEqual(body.filters.age, ['adult'])
  assert.deepEqual(body.filters.attributes, { size: ['42'] })
  assert.deepEqual(channel3SizeFilter('camisetas', sc), { key: 'size', values: ['Medium (M)'] })
  assert.equal(channel3SizeFilter('chaquetas', sc), null, 'sin talla conocida no se filtra')
  const gb = buildSearchBody(q, 'GB', ['bershka.com'], CFG, channel3SizeFilter(sizeGroupOf(q.subcategory, q.category), sc)) as { filters: Record<string, unknown> }
  assert.equal(gb.filters.attributes, undefined, 'fuera de tu mercado el «42» no significa lo mismo: sin prefiltro de talla')
  assert.ok(!JSON.stringify(body).match(/cintura|pecho|altura|medid/i))
})

test('10. un cambio de tallas, ajuste o Fit Assessment invalida el contexto de tallas y la caché de la búsqueda', () => {
  const g = G('Vaquero', 'bottom', 'jeans', { size_fit: '42' })
  const base = resolveSizes({ declared: 'pantalón 42', garments: [g], fitPrefs: { pantalones: 'Recto' } })
  const same = resolveSizes({ declared: 'pantalón 42', garments: [g], fitPrefs: { pantalones: 'Recto' } })
  assert.equal(base.fingerprint, same.fingerprint)
  const changes = [
    resolveSizes({ declared: 'pantalón 44', garments: [g], fitPrefs: { pantalones: 'Recto' } }),
    resolveSizes({ declared: 'pantalón 42', garments: [{ ...g, size_fit: '40' }], fitPrefs: { pantalones: 'Recto' } }),
    resolveSizes({ declared: 'pantalón 42', garments: [g], fitPrefs: { pantalones: 'Amplio' } }),
    resolveSizes({ declared: 'pantalón 42', garments: [g], fitPrefs: { pantalones: 'Recto' }, fitScore: () => 4 }),
    resolveSizes({ declared: 'pantalón 42', garments: [g], fitPrefs: { pantalones: 'Recto' }, measures: { cintura: { value: 84 } } }),
  ]
  for (const c of changes) assert.notEqual(c.fingerprint, base.fingerprint)
  const q = queryFromText('pantalón', null)
  assert.notEqual(searchCacheKey(q, `x|sz:${base.fingerprint}`), searchCacheKey(q, `x|sz:${changes[0].fingerprint}`))
})

// ── Integración con el motor 4C ──
const bundle = (): Bundle => ({
  profile: { fit_pref: 'Regular', budget_max: 90, sizes: 'vaqueros 42' }, measures: {}, photos: [], color: { temperature: 'Cálida', temperature_source: 'usuario', temperature_status: 'validado', likes: [], avoids: [] },
  style: { influences: [{ style: 'smart-casual', role: 'principal', weight: 70 }] }, life: { life: { trabajo: 50, ocio: 50 }, work_formality: 'Smart casual', climate: 'Cuatro estaciones marcadas', constraints: [] },
  fit: { prefs: { pantalones: 'Recto' } }, goals: null, validated: { a3: true }, observations: [], blueprints: [], garments: [], references: [], refRatings: [], styleRefs: [], colorAnalyses: [], chatValidated: false,
} as unknown as Bundle)
const wardrobe = () => [G('Camisa blanca', 'top', 'shirt', { primary_color: 'Blanco', formality_level: 3 }), G('Jersey marino', 'top', 'knit', { primary_color: 'Azul marino', formality_level: 3 }), G('Camiseta gris', 'top', 'tee'),
  G('Chaqueta marino', 'outerwear', 'jacket', { primary_color: 'Azul marino', formality_level: 3 }), G('Mocasín marrón', 'footwear', 'loafers', { primary_color: 'Marrón', formality_level: 3 }), G('Zapatilla blanca', 'footwear', 'sneakers', { primary_color: 'Blanco' })]

test('11-12. pesos y WVA intactos; la elegibilidad no cambia la puntuación; los productos aptos usan el Outfit Engine con IDs reales', () => {
  assert.deepEqual({ ...PURCHASE_WEIGHTS }, { color: 25, cut: 20, style: 15, wardrobe: 20, need: 10, quality: 10 })
  const b = bundle(), gs = wardrobe(), ids = new Set(gs.map((g) => g.id))
  const evals = new Map(gs.map((g) => [g.id, evaluateGarment(g as never, b, { others: gs as never, imageCount: 1 })]))
  const env = { garments: gs, evals, bundle: b, staleDays: 0, analyzed: false, ctx: buildShopperContext({ bundle: b, garments: gs as never, evals: evals as never }) }
  const p = c3(JEANS)
  const el = eligibilityOf(p, resolveSizes({ declared: 'vaqueros 42', garments: gs }), NOW)
  assert.equal(el.ok, true)
  const e = evaluatePurchase(p as never, env as never)
  assert.deepEqual(e.weights, { ...PURCHASE_WEIGHTS })
  assert.ok(e.wva.total_outfits > 0)
  for (const o of e.wva.outfit_samples) for (const id of o.garment_ids) assert.ok(ids.has(id) || id === VIRTUAL_ID)
  // La puerta solo puede rebajar «comprar» a «considerar»; la puntuación, los criterios y el WVA no cambian
  const blocked = eligibilityOf(p, resolveSizes({ declared: 'vaqueros 48', garments: [] }), NOW)
  const fake = { ...e, verdict: 'buy' }
  const gated = gateVerdict(fake, blocked)!
  assert.equal(gated.verdict, 'consider'); assert.equal(gated.score, e.score); assert.deepEqual(gated.criteria, e.criteria); assert.deepEqual(gated.wva, e.wva)
  assert.equal(gateVerdict(fake, el)!.verdict, 'buy')
})

test('4C: un color estimado de la imagen (procedencia «Foto») baja la confianza del criterio de color', () => {
  const b = bundle(), gs = wardrobe()
  const evals = new Map(gs.map((g) => [g.id, evaluateGarment(g as never, b, { others: gs as never, imageCount: 1 })]))
  const env = { garments: gs, evals, bundle: b, staleDays: 0, analyzed: false, ctx: buildShopperContext({ bundle: b, garments: gs as never, evals: evals as never }) }
  const base = { product_name: 'Pantalón', category: 'bottom', subcategory: 'trousers', primary_color: 'Beige', colors: ['Beige'], images: [], variants: [] }
  const store = evaluatePurchase({ ...base, field_sources: { primary_color: { source: 'channel3' } } } as never, env as never)
  const photo = evaluatePurchase({ ...base, field_sources: { primary_color: { source: 'photo' } } } as never, env as never)
  assert.equal(photo.criteria.find((c) => c.key === 'color')!.confidence, 'baja')
  assert.notEqual(store.criteria.find((c) => c.key === 'color')!.confidence, 'baja')
  assert.equal(photo.weights.color, 25)
})
