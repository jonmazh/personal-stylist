# Personal Shopper (Fase 4)

> Documento generado desde `lib/shopping/` con `npm run docs`. No lo edites a mano.

## Estado de la fase

| Subfase | Contenido | Estado |
|---|---|---|
| 4A · Shopping Intelligence y base del Shopping Planner | Necesidades detectadas y propias, 4 tipos, prioridad explicable y configurable, uso esperado, ocasiones, conjuntos nuevos (motor de outfits), redundancia, coste por uso, estados con historial, listas, presupuesto, preferencias | Hecha |
| 4B · Product Discovery | Conectores (feed autorizado, buscador, URL, asistida), normalización con procedencia por campo, catálogo de candidatos, verificación de precio y tallas | Hecha |
| 4C en adelante | Análisis de producto, compatibilidad, simulación, compras | Pendiente |

## Principios

- **Primero la necesidad, después el producto.** Las necesidades (4A) funcionan sin ningún producto; la búsqueda (4B) parte de una necesidad o de una petición tuya.
- **Sin scraping.** No se rastrean tiendas. Ningún conector se salta controles de acceso, autenticación, límites ni condiciones de uso.
- **El estilista puede decir «no compres».** Si ninguna necesidad abierta supera tu umbral, la interfaz lo dice. Tener presupuesto no obliga a gastarlo.
- **Los deseos son legítimos**, pero se marcan como deseo, puntúan bajo en «necesidad real» y no compiten con las necesidades. El detector nunca crea deseos: solo tú.
- **Sin segundo armario ni segundo motor de outfits.** La prenda buscada se simula como «prenda virtual» con el motor de la fase 3 (`buildCandidates`) y con la similitud de la auditoría (2D); nunca se guarda en `garments`.
- **Memoria.** Una necesidad descartada (con motivo obligatorio) o rechazada en la auditoría no se vuelve a proponer: cada una tiene una clave de detección estable (`occ:`, `cat:`, `season:`, `repl:`, `impr:`), la misma que usa la auditoría.

## Tipos de necesidad

| Tipo | Significado |
|---|---|
| Necesidad (`need`) | Falta una categoría o una función en tu armario. |
| Mejora (`improvement`) | Ya tienes algo parecido, pero una alternativa mejoraría claramente tu vestuario. |
| Sustitución (`replacement`) | Una prenda actual necesita reemplazo. |
| Deseo (`desire`) | Te gustaría tenerla, aunque no sea necesaria. Es legítimo: solo hay que saber que es un deseo. |

## Origen

- `detected`: Detectada por el estilista.
- `audit`: Aprobada en la auditoría.
- `user`: Añadida por ti.

## Estados

| Estado | Significado |
|---|---|
| Detectada (`detected`) | Necesidad identificada. |
| Buscando (`searching`) | Se están buscando alternativas. |
| En lista (`listed`) | Producto candidato guardado. |
| Comparando (`comparing`) | Evaluando alternativas. |
| Aprobada (`approved`) | Has decidido comprar. |
| Comprada (`purchased`) | Adquisición realizada. |
| Descartada (`discarded`) | Has decidido no comprar. |
| En seguimiento (`watching`) | Pendiente de talla, stock o precio. |

Abiertos (cuentan en el diagnóstico): `detected`, `searching`, `listed`, `comparing`, `approved`, `watching`. Cada cambio queda en `shopping_need_events` (creada, estado con motivo, prioridad, edición, lista).

## Prioridad (`shopping-priority@1`)

Es una **prioridad de compra**, no una recomendación de producto. Cada criterio vale de 0 a 1, se multiplica por su peso y la suma da 0-100. Alta ≥ 70, media ≥ 45, baja < 45. Si fijas tú la prioridad, manda la tuya (la calculada se sigue viendo).

| Criterio | Peso por defecto |
|---|---|
| Necesidad real del armario | 30 |
| Frecuencia de uso esperada | 20 |
| Potencial de nuevos outfits | 20 |
| Adecuación al perfil | 15 |
| Urgencia estacional o funcional | 10 |
| Confianza de la información | 5 |

- **Necesidad real:** cobertura de la categoría y de las ocasiones (auditoría 2D); sustituciones según el estado de la prenda; deseos 0,15; redundancia alta resta 0,3 (salvo sustituciones).
- **Frecuencia de uso esperada:** usos al mes en su temporada según el peso de sus ocasiones en tu semana, repartidos con las prendas parecidas que ya rotas; con registro de uso suficiente, se cita.
- **Potencial de nuevos outfits:** conjuntos válidos (≥ 60/100) que el motor de la fase 3 forma con la prenda virtual y tus prendas, simulando su temporada.
- **Adecuación al perfil:** compatibilidad personal (2C) de la prenda virtual y peso de sus ocasiones.
- **Urgencia:** temporada actual > siguiente > lejana; prenda a sustituir dañada; fecha objetivo en 30 días.
- **Confianza:** lo definida que está la prenda buscada y lo completo que está tu perfil.

Los pesos se configuran en el planificador y se normalizan a 100 (si todos son 0, vuelven al defecto). Cada evaluación se guarda en `shopping_need_assessments` con su versión, sus pesos, los criterios con razones y datos usados, y se puede reevaluar.

## Coste por uso (estimado)

Precio objetivo (máximo, si no mínimo; si no hay, tu presupuesto máximo por prenda del perfil) ÷ usos esperados en su vida útil (usos al mes × meses de vida por categoría × fracción del año en temporada). Sin precio, no se estima.

## Presupuesto

- Mensual (`monthly`): ventanas de 1 mes desde la fecha de inicio.
- Trimestral (`quarterly`): ventanas de 3 meses desde la fecha de inicio.
- Por temporada (`season`): ventanas de 6 meses desde la fecha de inicio.

- Un solo presupuesto activo; el anterior queda en el historial.
- Comprometido = precio de las necesidades aprobadas o compradas en la ventana. Avisos si lo aprobado supera el presupuesto, si lo prioritario supera lo disponible o si falta precio.
- Sin compras prioritarias: «No hay ninguna compra prioritaria: no hace falta gastar este presupuesto.»

## Preferencias

Tiendas preferidas y excluidas (no ambas a la vez), calidad frente a precio, umbral para proponer compra (por defecto 45) y pesos. Tiendas disponibles: Zara, Massimo Dutti, Pull&Bear, Bershka, Stradivarius, COS, ARKET, Uniqlo, Mango Man, Selected Homme. La búsqueda de productos (4B) solo consulta tus tiendas preferidas (si has elegido alguna) y nunca las excluidas.

## Product Discovery (4B)

### Fuentes

| Fuente | Qué hace |
|---|---|
| API autorizada (`api`) | Integración estructurada concedida por la tienda o un proveedor autorizado. |
| Feed autorizado (`feed`) | Catálogo en CSV, JSON o XML que te da un programa de afiliación o la propia marca. |
| Buscador de productos (`search`) | Encuentra páginas de producto y las enlaza; no descarga su contenido. |
| Importación por URL (`url`) | Lees tú una página concreta: solo sus metadatos públicos, si la tienda y robots.txt lo permiten. |
| Importación asistida (`manual`) | Los datos y capturas que aportas tú. |

Todas cumplen la interfaz `ProductSource` (`lib/shopping/catalog/sources.ts`); el Product Source Manager (`searchAll`) las ejecuta, quita duplicados por URL canónica (gana la fuente con más datos: API > feed > URL > tus datos > buscador) y ordena por **coincidencia con lo que buscas** (tipo, color, precio, corte, material), nunca por precio, popularidad o tendencia. La coincidencia no es una recomendación de compra.

### Tiendas y política de acceso

| Tienda | Grupo | Dominios | Lectura de páginas |
|---|---|---|---|
| Zara | Inditex | zara.com | Solo enlace y tus datos |
| Massimo Dutti | Inditex | massimodutti.com | Solo enlace y tus datos |
| Pull&Bear | Inditex | pullandbear.com | Solo enlace y tus datos |
| Bershka | Inditex | bershka.com | Solo enlace y tus datos |
| Stradivarius | Inditex | stradivarius.com | Solo enlace y tus datos |
| COS | Complementarias | cos.com | Solo metadatos públicos |
| ARKET | Complementarias | arket.com | Solo metadatos públicos |
| Uniqlo | Complementarias | uniqlo.com | Solo metadatos públicos |
| Mango Man | Complementarias | mango.com | Solo metadatos públicos |
| Selected Homme | Complementarias | selected.com | Solo metadatos públicos |

- **Solo metadatos públicos** (`metadata`): Una página, a petición tuya, si robots.txt lo permite.
- **Solo enlace y tus datos** (`manual_only`): Sus condiciones no permiten la extracción automatizada.
- Inditex: sus condiciones prohíben bots, crawlers, scrapers y la extracción automatizada sin autorización escrita, así que sus páginas no se descargan nunca. Se pueden **enlazar** (el buscador devuelve el enlace) e importar con tus datos y capturas.
- Las demás tiendas del catálogo tienen las condiciones **sin revisar**: solo se lee una página a petición tuya, sus metadatos públicos y si robots.txt lo permite. Puedes añadir tus propias tiendas (por defecto «solo enlace y tus datos»).

### Importación por URL

1. Política de la tienda (solo manual → no se descarga nada). 2. Validación de la URL: solo http(s), puertos 80/443, nunca direcciones internas, locales o de metadatos (SSRF), también tras cada redirección (máx. 3). 3. robots.txt (RFC 9309; si no se puede consultar, no se lee la página). 4. Una sola página, máx. 2 MB y 8 s, con el agente «PersonalStylistBot/1.0 (importación de una página a petición del usuario; respeta robots.txt)». 5. Solo metadatos de producto publicados para máquinas: schema.org (Product/ProductGroup con variantes) u OpenGraph. El HTML visible no se lee.

Si algo de esto no se cumple, se explica el motivo y se ofrece la importación asistida con el enlace ya puesto.

### Feeds autorizados

CSV/TSV, JSON o XML (Google Merchant/RSS) desde una URL o subido (máx. 4 MB y 5000 productos). Hay que indicar quién autoriza su uso. Se reconocen las columnas habituales (Google Merchant, Awin, Clickwise…) y las filas con el mismo `item_group_id` se agrupan como variantes.

### Buscador de productos

Opcional, con clave: `SHOPPING_SEARCH_PROVIDER=brave`, `SHOPPING_SEARCH_KEY` (y `SHOPPING_SEARCH_URL`, `SHOPPING_MARKET`). Consulta solo los dominios de tus tiendas permitidas y devuelve **enlaces** a páginas de producto de tiendas conocidas; no descarga las páginas. Sin clave, se busca solo en tus feeds. Las búsquedas iguales se reutilizan durante 24 h (caché en `shopping_searches`).

### Procedencia de cada dato

| Procedencia | Significado |
|---|---|
| Tienda (`store`) | Publicado por la tienda en la página del producto. |
| Feed (`feed`) | Viene del feed autorizado. |
| Buscador (`search`) | Resumen del buscador: hay que confirmarlo en la tienda. |
| Deducido (`derived`) | Deducido por reglas del nombre o la descripción de la tienda (p. ej. el tipo de prenda). |
| Foto (`photo`) | Extraído de fotografías. |
| IA (`ai`) | Inferencia de la IA, sin confirmar. |
| Tú (`user`) | Introducido o confirmado por ti. |

Nunca se inventan atributos: sin composición publicada con porcentajes, «composición desconocida»; sin precio, «sin comprobar». Lo que corriges tú queda como «tú» y no se sobrescribe al volver a importar.

### Precios, tallas y verificación

Disponibilidad: disponible, pocas unidades, agotado, reserva, sin comprobar. Cada precio y talla tiene fecha; pasados 3 días (o si nunca se ha verificado) la ficha avisa de que hay que volver a comprobarlos. La verificación vuelve a consultar la misma fuente si lo permite (página con metadatos o feed) o la haces tú con lo que ves en la tienda. Cada cambio queda en `product_price_history`.

### Imágenes

Las de la tienda solo se enlazan (no se copian). Tus capturas y fotos se recodifican en el navegador (sin metadatos ni GPS) y se guardan en el bucket privado `shopping-private`, servidas con URLs firmadas.

## Datos

Migración `0016_shopping_intelligence.sql` (4A):

| Tabla | Contenido |
|---|---|
| `shopping_needs` | Necesidad: título, tipo, origen, clave de detección, estado, especificación (jsonb), razón, prenda a sustituir, prendas relacionadas, precios, tiendas, fecha objetivo, prioridad calculada y la tuya, motivo de descarte |
| `shopping_need_assessments` | Evaluaciones versionadas: pesos, criterios, puntuación, confianza, uso esperado, conjuntos nuevos, redundancia, coste por uso, ocasiones |
| `shopping_need_events` | Historial de cambios |
| `shopping_lists` / `shopping_list_items` | Listas de compra y sus necesidades (sin duplicados) |
| `shopping_budgets` | Presupuestos (uno activo) |
| `shopping_preferences` | Preferencias de compra |

RLS «own rows» en las 7 tablas; además, una evaluación, un evento o un elemento de lista solo pueden apuntar a necesidades y listas propias, y la prenda a sustituir debe ser tuya.

Migración `0017_product_discovery.sql` (4B). Los productos candidatos nunca se mezclan con `garments` (lo que posees):

| Tabla | Contenido |
|---|---|
| `retailers` | Tiendas: catálogo común (solo lectura) y las tuyas; dominios, mercado y política de acceso |
| `product_sources` | Tus feeds o APIs autorizados, con quién lo autoriza y el estado de la última sincronización |
| `product_feed_items` | Productos normalizados de cada feed |
| `shopping_searches` | Historial y caché de búsquedas: consulta, estado de cada fuente y resultados |
| `external_products` | Candidatos: fuente, tienda, necesidad, datos normalizados, procedencia por campo, imágenes, estado, motivo de descarte, fecha de verificación |
| `external_product_variants` | Tallas y colores con disponibilidad y fecha |
| `product_price_history` | Precios y disponibilidad observados |

RLS: todas por usuario, y cada relación (necesidad, búsqueda, fuente, tienda, producto) solo con filas propias o tiendas del catálogo común. Bucket privado `shopping-private` por carpeta de usuario.

## API

| Método y ruta | Uso |
|---|---|
| `POST /api/shopping/needs/analyze` | Detecta necesidades y reevalúa las abiertas |
| `GET /api/shopping/needs?status=open\|all\|<estado>` | Lista por prioridad |
| `POST /api/shopping/needs` | Crea una necesidad o un deseo |
| `GET /api/shopping/needs/:id` | Ficha con evaluaciones, historial, listas y prendas |
| `PATCH /api/shopping/needs/:id` | Edita, fija prioridad o cambia de estado (descartar exige motivo) |
| `POST /api/shopping/needs/:id/assess` | Reevalúa |
| `GET/POST /api/shopping/lists`, `DELETE /api/shopping/lists/:id` | Listas |
| `POST/DELETE /api/shopping/lists/:id/items` | Añadir o quitar una necesidad |
| `GET/PUT /api/shopping/budgets` | Presupuesto activo |
| `GET/PUT /api/shopping/preferences` | Preferencias |
| `GET /api/shopping/planner` | Vista del planificador |
| `POST /api/shopping/search` | Busca productos para una necesidad o un texto (caché 24 h; `force` la ignora) |
| `GET /api/shopping/search/:id`, `POST /api/shopping/search/:id/save` | Ver una búsqueda; guardar un resultado como candidato |
| `POST /api/shopping/import` | Importación por URL o asistida (`{manual: {...}}`) |
| `GET /api/shopping/products`, `GET/PATCH/DELETE /api/shopping/products/:id` | Candidatos; corregir datos, vincular, guardar o descartar (con motivo) |
| `POST /api/shopping/products/:id/verify` | Volver a comprobar precio, disponibilidad y tallas (o confirmarlos tú) |
| `POST/DELETE /api/shopping/products/:id/images` | Tus capturas |
| `GET/POST /api/shopping/retailers`, `DELETE /api/shopping/retailers/:id` | Tiendas |
| `GET/POST /api/shopping/sources`, `POST /api/shopping/sources/:id/sync`, `DELETE /api/shopping/sources/:id` | Feeds autorizados |

## Interfaz

- `/compras` — Shopping Intelligence: analizar, veredicto («merece la pena comprar» o «no necesitas comprar nada»), necesidades por prioridad, alta de necesidades y deseos.
- `/compras/necesidades/:id` — desglose de la prioridad, conjuntos nuevos, uso, coste por uso, redundancia, ocasiones, estados, prioridad manual, listas, edición e historial.
- `/compras/plan` — Shopping Planner: qué merece la pena y qué puede esperar, presupuesto, listas y preferencias.
- `/compras/buscar` — búsqueda en fuentes autorizadas, estado de cada fuente y resultados por coincidencia.
- `/compras/importar` — por URL o asistida.
- `/compras/productos` y `/compras/productos/:id` — candidatos con procedencia de cada dato, tallas, verificación, historial de precios, capturas, correcciones y descarte.
- `/compras/fuentes` — tiendas con su política, feeds autorizados y estado del buscador.

## Pruebas

- `tests/shopping.test.ts`: pesos y niveles, explicabilidad, deseo redundante, sustitución, coste por uso, urgencia, detección, presupuesto, migración y RLS.
- `tests/e2e/shopping.cjs`: recorrido completo en móvil, integración con la auditoría, estados, listas, presupuesto, preferencias y aislamiento entre dos usuarios (app y RLS directa).
- `tests/product-discovery.test.ts`: tipo y color en español e inglés, precio, composición, URL canónica, procedencia, extracción schema.org/OpenGraph, robots.txt, SSRF, feeds, búsqueda y gestor de fuentes, política de Inditex, migración.
- `tests/e2e/product-discovery.cjs` con `tests/e2e/fake-store.mjs` (tienda y buscador de prueba locales): feed, búsqueda desde una necesidad, importación por URL y sus bloqueos, asistida con capturas, verificación con historial, descarte y aislamiento (app, RLS y Storage).
