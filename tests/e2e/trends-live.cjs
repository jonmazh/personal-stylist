// Trend Intelligence con Brave Search y Channel3 REALES (TRENDS_LIVE=1). Consume ~13 consultas de Brave y ≤6 créditos de Channel3.
// La app debe arrancar con BRAVE_SEARCH_API_KEY y CHANNEL3_API_KEY (y, tras un proxy, NODE_USE_ENV_PROXY=1 y SHOPPING_FETCH_VIA_PROXY=1),
// sin SHOPPING_SEARCH_URL. La SÍNTESIS usa el proveedor de IA configurado: si es el simulado de las pruebas, esta prueba verifica
// la recuperación, el filtrado, la validación y la presencia comercial reales, pero no la calidad de una síntesis real.
const { chromium, devices } = require('playwright'); const assert = require('assert')
const { signup } = require('./lib.cjs')
const U = process.env.APP_URL || 'http://127.0.0.1:3100'
const log = (...a) => console.log('✔', ...a)
if (process.env.TRENDS_LIVE !== '1') { console.log('— omitida: exporta TRENDS_LIVE=1 para investigar con Brave y Channel3 reales'); process.exit(0) }

;(async () => {
  const br = await chromium.launch()
  const p = await (await br.newContext({ ...devices['iPhone 13'] })).newPage(); p.setDefaultTimeout(120000)
  const api = async (method, path, data, status = 200) => { const r = await p.request[method](U + path, data ? { data, timeout: 180000 } : { timeout: 180000 }); assert.equal(r.status(), status, `${path}: ${await r.text()}`); return r.json() }
  await signup(p, U)
  await p.goto(U + '/estilos/clean-streetwear'); await p.selectOption('select[aria-label="Papel en tu identidad"]', 'principal'); await p.click('button:has-text("Añadir a mi identidad")'); await p.waitForURL(/added=1/)
  const G = (name, category, subcategory, primary_color, x = {}) => ({ name, category, subcategory, primary_color, formality_level: 2, status: 'active', occasions: ['ocio'], seasons: ['otono', 'invierno'], silhouette: 'Regular', ...x })
  for (const g of [...['Gris', 'Negro', 'Azul marino', 'Beige'].map((c, i) => G(`Pantalón ${i}`, 'bottom', 'chinos', c, { cut: 'Recto' })), G('Camiseta', 'top', 'tee', 'Blanco'), G('Sudadera', 'top', 'sweatshirt', 'Gris'), G('Zapatilla', 'footwear', 'sneakers', 'Blanco')]) await api('post', '/api/wardrobe/items', g, 201)
  await api('get', '/api/stylist/wardrobe')
  const r = await api('post', '/api/stylist/trends', { force: true })
  const st = r.research.stats
  console.log(`    modo ${r.research.mode} · ${st.retrieved} resultados → ${st.evidence} fuentes editoriales válidas de ${st.hosts} medios · descartes ${JSON.stringify(st.discarded)}`)
  console.log(`    Brave: ${st.brave.requests} consultas (${st.brave.errors} errores, ~${st.brave.est_usd} $) · Channel3: ${st.channel3.credits} créditos · IA: ${st.ai.calls} llamada(s)`)
  assert.equal(r.research.mode, 'editorial_comercial'); assert.ok(st.brave.requests >= 12 && st.brave.errors === 0, 'consultas reales a Brave sin errores')
  assert.ok(st.evidence >= 5, 'fuentes editoriales reales'); assert.ok(st.channel3.credits <= 6, 'tope de créditos de Channel3')
  assert.equal(r.research.evidence, null); assert.ok(r.signals.every((s) => s.evidence === null))
  for (const s of r.signals) console.log(`    · [${s.kind}] ${s.name} — ${s.stage}, confianza ${s.confidence}, ${s.source_count} medios${s.presence ? ` · Channel3: ${s.presence.products} productos de ${s.presence.brands} marcas` : ''}${s.validation.length ? ` · ${s.validation.join(' ')}` : ''}`)
  for (const h of r.research.hypotheses) console.log(`    · hipótesis «${h.title}»: ${h.presence.products} productos de ${h.presence.brands} marcas en España`)
  assert.ok(r.signals.every((s) => s.kind !== 'tendencia_editorial' || s.source_count >= 2), 'ninguna tendencia con una sola fuente')
  assert.ok(r.research.hypotheses.length >= 1, 'presencia comercial de la hipótesis del armario')
  if (r.signals[0]) {
    const src = await api('get', `/api/stylist/trends/${r.signals[0].id}/sources`)
    assert.equal(src.live, true); console.log(`    fuentes en vivo de «${r.signals[0].name}»: ${src.sources.length} (${src.sources.slice(0, 3).map((x) => x.outlet).join(', ')})`)
  }
  log('investigación real: Brave (editorial) + Channel3 (presencia), filtrada y validada; nada de Brave guardado')
  await br.close()
})().catch((e) => { console.error('✘', e); process.exit(1) })
