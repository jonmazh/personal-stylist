// Tienda y buscador de prueba para la fase 4B (no es una tienda real). Puerto 4700.
// /robots.txt, páginas de producto con schema.org, con OpenGraph, sin metadatos y bloqueadas por robots, una redirección a una IP interna,
// un feed CSV y una API de búsqueda con la forma de Brave Search (exige la clave «test»). /admin/price?v= cambia el precio.
import http from 'node:http'
let price = '89.00', lastQuery = ''
const ld = () => `<!doctype html><html><head><title>Pantalón</title><script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org', '@type': 'ProductGroup', name: 'Pantalón recto de lana gris', brand: { '@type': 'Brand', name: 'Tienda Test' }, productGroupID: 'PL-1',
  description: 'Pantalón de vestir de pernera recta. Composición: 100% lana.', url: 'http://127.0.0.1:4700/p/pantalon-lana.html?utm_source=x',
  hasVariant: [
    { '@type': 'Product', sku: 'PL-1-48', size: '48', color: 'Gris oscuro', image: 'http://127.0.0.1:4700/img/1.jpg', offers: { '@type': 'Offer', price, priceCurrency: 'EUR', availability: 'https://schema.org/InStock' } },
    { '@type': 'Product', sku: 'PL-1-50', size: '50', color: 'Gris oscuro', offers: { '@type': 'Offer', price, priceCurrency: 'EUR', availability: 'https://schema.org/OutOfStock' } },
  ] })}</script></head><body><h1>Pantalón</h1><span class="precio">1 €</span></body></html>`
const og = '<!doctype html><html><head><meta property="og:type" content="product"><meta property="og:title" content="Camisa oxford azul claro"><meta property="product:price:amount" content="45,00"><meta property="product:price:currency" content="EUR"></head><body></body></html>'
const feed = `id,title,link,price,availability,brand,color,size,material,product_type,item_group_id,gender
F1,"Pantalón recto de lana gris",http://127.0.0.1:4700/p/pantalon-lana.html,89.00 EUR,in stock,Tienda Test,Gris,48,100% lana,Hombre > Pantalones,G1,male
F2,"Pantalón recto de lana gris",http://127.0.0.1:4700/p/pantalon-lana.html,89.00 EUR,out of stock,Tienda Test,Gris,50,100% lana,Hombre > Pantalones,G1,male
F3,"Chino beige",http://127.0.0.1:4700/p/chino.html,49.00 EUR,in stock,Tienda Test,Beige,48,98% algodón 2% elastano,Hombre > Pantalones,,male
F4,"Pantalón de vestir gris marengo",http://127.0.0.1:4700/p/marengo.html,140.00 EUR,in stock,Tienda Test,Gris,48,,Hombre > Pantalones,,male`
// Feed para Personal Shopper Intelligence: mismos productos para perfiles distintos y pares parecidos. Una fila por talla
// (item_group_id), con género y edad como en Google Merchant. Incluye un producto de mujer, uno infantil y uno agotado en M.
const row = (id, title, slug, price, color, sizes, cat, extra = 'male,adult', mat = '100% algodón') => sizes.map(([size, av], i) => `${id}-${i},"${title}",http://127.0.0.1:4700/p/${slug}.html,${price} EUR,${av},Tienda Test,${color},${size},${mat},${cat},${id},${extra}`).join('\n')
const feedPsi = [`id,title,link,price,availability,brand,color,size,material,product_type,item_group_id,gender,age_group`,
  row('S1', 'Sudadera azul marino', 'sudadera-marino', '59.00', 'Azul marino', [['M', 'in stock'], ['L', 'in stock']], 'Hombre > Sudaderas'),
  row('S2', 'Sudadera crudo', 'sudadera-crudo', '59.00', 'Crudo', [['M', 'in stock'], ['L', 'in stock']], 'Hombre > Sudaderas'),
  row('S3', 'Sudadera camel', 'sudadera-camel', '59.00', 'Camel', [['M', 'in stock'], ['L', 'in stock']], 'Hombre > Sudaderas'),
  row('S4', 'Sudadera gris', 'sudadera-gris', '59.00', 'Gris', [['M', 'out of stock'], ['L', 'in stock']], 'Hombre > Sudaderas'),
  row('S5', 'Sudadera camel mujer', 'sudadera-camel-w', '59.00', 'Camel', [['M', 'in stock']], 'Sudaderas', 'female,adult'),
  row('S6', 'Sudadera camel infantil', 'sudadera-camel-k', '29.00', 'Camel', [['M', 'in stock']], 'Sudaderas', 'male,kids'),
  row('P1', 'Pantalón de vestir recto gris', 'pantalon-recto-gris', '79.00', 'Gris', [['48', 'in stock'], ['50', 'in stock']], 'Hombre > Pantalones', 'male,adult', '100% lana'),
  row('P2', 'Pantalón de vestir slim gris', 'pantalon-slim-gris', '59.00', 'Gris', [['48', 'in stock'], ['50', 'in stock']], 'Hombre > Pantalones', 'male,adult', '100% lana'),
].join('\n')
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1:4700')
  const send = (code, type, body, headers = {}) => { res.writeHead(code, { 'content-type': type, ...headers }); res.end(body) }
  if (u.pathname === '/robots.txt') return send(200, 'text/plain', 'User-agent: *\nDisallow: /privado/\n')
  if (u.pathname === '/p/pantalon-lana.html') return send(200, 'text/html; charset=utf-8', ld())
  if (u.pathname === '/p/camisa-og.html') return send(200, 'text/html', og)
  if (u.pathname === '/p/sin-datos.html') return send(200, 'text/html', '<html><h1>Camisa</h1><p>39,95 €</p></html>')
  if (u.pathname === '/privado/oferta.html') return send(200, 'text/html', ld())
  if (u.pathname === '/redir') return send(302, 'text/plain', '', { location: 'http://169.254.169.254/latest/meta-data' })
  if (u.pathname === '/feed.csv') return send(200, 'text/csv', feed)
  if (u.pathname === '/feed-psi.csv') return send(200, 'text/csv', feedPsi)
  if (u.pathname === '/admin/price') { price = u.searchParams.get('v') ?? price; return send(200, 'text/plain', price) }
  if (u.pathname === '/admin/last-query') return send(200, 'text/plain', lastQuery)
  // Brave Search (falso) para Trend Intelligence: resultados SINTÉTICOS (no se guardan resultados reales de Brave).
  // Incluye ruido que el filtro debe descartar: una tienda, una nota de prensa de mercado y un artículo solo de mujer.
  if (u.pathname === '/res/v1/web/search' || u.pathname === '/res/v1/news/search') {
    if (req.headers['x-subscription-token'] !== 'test') return send(401, 'application/json', '{"error":"bad key"}')
    const q = (u.searchParams.get('q') ?? '').toLowerCase()
    const d = (days) => new Date(Date.now() - days * 864e5).toISOString().slice(0, 19)
    const R = (host, path, title, description, days, extra = []) => ({ title, url: `https://${host}/${path}`, description, page_age: d(days), meta_url: { hostname: host }, profile: { name: host }, extra_snippets: extra })
    const all = [
      R('menswear-weekly.example', 'aw-trousers', "The men's trouser shift: wide and relaxed", "Wide-leg and relaxed trousers with fluid drape replace slim fits in men's collections this autumn winter.", 12, ['Auralee and Lemaire show loose, wide trousers.']),
      R('style-journal.example', 'menswear-silhouettes', "Menswear silhouettes for autumn", "For men, baggy and wide trousers with a clean top are the key proportion of the season.", 30),
      R('gents-review.example', 'suede-season', "Men's suede jackets are back", "Suede overshirts and jackets for men add texture to neutral outfits.", 20),
      R('elmundo-moda.example', 'tendencias-hombre', 'Tendencias de moda hombre otoño invierno', 'El marrón chocolate y el pantalón amplio dominan las propuestas para hombre.', 25),
      R('shop.example', 'products/wide-trousers', "Men's wide trousers – buy now", 'Wide trousers for men, 49 EUR.', 3),
      R('openpr.com', 'news/menswear-market', 'Menswear Market to Reach USD 800 Billion', 'The men\'s apparel market will grow 6 % annually.', 2),
      R('women-style.example', 'tights', 'Novelty tights for her this winter', 'Women are wearing brown tights and suede skirts.', 5),
    ]
    const results = all.filter((r) => q.length > 3 && (q.includes('trend') || q.includes('tendencia') || q.includes('trouser') || q.includes('menswear') || q.includes('wide') || q.includes('suede') || q.includes('brown')))
    return send(200, 'application/json', JSON.stringify(u.pathname.includes('/news/') ? { type: 'news', results: results.slice(0, 3) } : { type: 'search', web: { results } }))
  }
  if (u.pathname === '/search') {
    if (req.headers['x-subscription-token'] !== 'test') return send(401, 'application/json', '{"error":"bad key"}')
    lastQuery = u.searchParams.get('q') ?? ''
    return send(200, 'application/json', JSON.stringify({ web: { results: [
      { title: 'Pantalón recto de lana gris | Tienda Test', url: 'http://127.0.0.1:4700/p/pantalon-lana.html?utm_campaign=s', description: 'Pantalón de <strong>lana</strong>' },
      { title: 'Pantalón traje gris - Zara', url: 'https://www.zara.com/es/es/pantalon-traje-gris-p0123.html', description: 'Pantalón de traje' },
      { title: 'Pantalón gris | Otra tienda', url: 'https://desconocida.example/p/1', description: '' },
      { title: 'Camisa blanca | Tienda Test', url: 'http://127.0.0.1:4700/p/camisa.html', description: '' },
    ] } }))
  }
  return send(404, 'text/plain', 'no')
}).listen(4700)
