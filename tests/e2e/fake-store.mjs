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
const feed = `id,title,link,price,availability,brand,color,size,material,product_type,item_group_id
F1,"Pantalón recto de lana gris",http://127.0.0.1:4700/p/pantalon-lana.html,89.00 EUR,in stock,Tienda Test,Gris,48,100% lana,Hombre > Pantalones,G1
F2,"Pantalón recto de lana gris",http://127.0.0.1:4700/p/pantalon-lana.html,89.00 EUR,out of stock,Tienda Test,Gris,50,100% lana,Hombre > Pantalones,G1
F3,"Chino beige",http://127.0.0.1:4700/p/chino.html,49.00 EUR,in stock,Tienda Test,Beige,48,98% algodón 2% elastano,Hombre > Pantalones,
F4,"Pantalón de vestir gris marengo",http://127.0.0.1:4700/p/marengo.html,140.00 EUR,in stock,Tienda Test,Gris,48,,Hombre > Pantalones,`
// Feed para Personal Shopper Intelligence: mismos productos para perfiles distintos y pares parecidos
const feedPsi = `id,title,link,price,availability,brand,color,size,material,product_type
S1,"Sudadera azul marino",http://127.0.0.1:4700/p/sudadera-marino.html,59.00 EUR,in stock,Tienda Test,Azul marino,M,100% algodón,Hombre > Sudaderas
S2,"Sudadera crudo",http://127.0.0.1:4700/p/sudadera-crudo.html,59.00 EUR,in stock,Tienda Test,Crudo,M,100% algodón,Hombre > Sudaderas
S3,"Sudadera camel",http://127.0.0.1:4700/p/sudadera-camel.html,59.00 EUR,in stock,Tienda Test,Camel,M,100% algodón,Hombre > Sudaderas
P1,"Pantalón de vestir recto gris",http://127.0.0.1:4700/p/pantalon-recto-gris.html,79.00 EUR,in stock,Tienda Test,Gris,48,100% lana,Hombre > Pantalones
P2,"Pantalón de vestir slim gris",http://127.0.0.1:4700/p/pantalon-slim-gris.html,59.00 EUR,in stock,Tienda Test,Gris,48,100% lana,Hombre > Pantalones`
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
