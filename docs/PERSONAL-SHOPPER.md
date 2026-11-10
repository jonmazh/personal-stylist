# Personal Shopper (Fase 4)

> Documento generado desde `lib/shopping/` con `npm run docs`. No lo edites a mano.

## Estado de la fase

| Subfase | Contenido | Estado |
|---|---|---|
| 4A · Shopping Intelligence y base del Shopping Planner | Necesidades detectadas y propias, 4 tipos, prioridad explicable y configurable, uso esperado, ocasiones, conjuntos nuevos (motor de outfits), redundancia, coste por uso, estados con historial, listas, presupuesto, preferencias | Hecha |
| 4B · Product Discovery | Conectores (feed autorizado, buscador, URL, asistida), normalización con procedencia por campo, catálogo de candidatos, verificación de precio y tallas | Hecha |
| 4C · Product Analyzer & Evaluator | Análisis con IA (texto + imágenes permitidas) con procedencia y calidad documentada/aparente/desconocida, puntuación de compra explicable, indicadores, redundancia, veredicto, talla con confianza, comparación | Hecha |
| 4D en adelante | Simulación visual de la compra y Wardrobe Value Added, registro de compras | Pendiente |

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

Tiendas preferidas y excluidas (no ambas a la vez), calidad frente a precio, umbral para proponer compra (por defecto 45) y pesos. Tiendas disponibles: Zara, Massimo Dutti, Pull&Bear, Bershka, Stradivarius, COS, ARKET, Uniqlo, Mango Man, Selected Homme, Grimey, EME Studios. La búsqueda de productos (4B) solo consulta tus tiendas preferidas (si has elegido alguna) y nunca las excluidas.

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
| Grimey | Conectadas por UCP | grimey.com | Solo metadatos públicos |
| EME Studios | Conectadas por UCP | emestudios.com | Solo metadatos públicos |

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

### Conector UCP: Grimey

Grimey (tienda Shopify) publica su catálogo con el **Universal Commerce Protocol** sobre MCP. El conector (`lib/shopping/catalog/ucp.ts`) cumple la interfaz `ProductSource` y es genérico: sirve para cualquier tienda marcada con `connector = ucp` en `retailers` (migración `0019_ucp_connector.sql`).

**Inspección previa (9-11-2026):**

- `https://grimey.com/agents.md`: recomienda UCP/MCP o WebMCP; pide identificar el tráfico de agentes (servidor a servidor con Web Bot Auth), respetar 429/`Retry-After`, autorización del comprador para comprar y preferir las herramientas estructuradas. Permite leer HTML público con identificación. No menciona `/products.json`.
- `https://grimey.com/robots.txt`: catálogo rastreable; bloquea carrito, checkout, cuenta, pedidos y superficies AJAX («agents should use UCP/MCP instead»).
- `https://grimey.com/.well-known/ucp`: UCP `2026-08-25`; servicio `dev.ucp.shopping` por MCP en `https://grimeywear.myshopify.com/api/ucp/mcp` (el que anuncia el descubrimiento; `agents.md` cita `https://grimey.com/api/ucp/mcp`, que responde igual); capacidades `dev.ucp.shopping.catalog.search`, `dev.ucp.shopping.catalog.lookup` y la extensión `dev.shopify.catalog`, además de carrito, checkout, pedidos, etc.
- `tools/list` del servidor: 16 herramientas. Se usan **solo** `search_catalog`, `get_product`, `lookup_catalog`. Nunca `create_cart`, `*_checkout`, `get_order`, `ask_business` ni las de ubicaciones.
- Shopify (shopify.dev/docs/agents): toda llamada lleva `meta["ucp-agent"].profile` con la URL del perfil UCP del agente; la tienda lo descarga para negociar capacidades. Niveles de tráfico: Token, Firmado (RFC 9421, ECDSA P-256) y Anónimo. El catálogo está permitido en anónimo con el límite más bajo y Shopify desaconseja el anónimo para tráfico de producción.

**Cómo se llama (sin inventar nada):**

1. Descubrimiento: `GET {tienda}/.well-known/ucp` (caché 1 h) → endpoint MCP; se exige `dev.ucp.shopping.catalog.search` y la vinculación de autoridad (esquemas `dev.ucp.*` en ucp.dev, `dev.shopify.*` en shopify.dev).
2. MCP (JSON-RPC sobre HTTPS, protocolo `2025-06-18`): `initialize` y `tools/list` (caché 1 h); si la tienda no publica `search_catalog`, la fuente queda no disponible.
3. `tools/call` con `{meta: {ucp-agent: {profile}}, catalog: {...}}`: búsqueda con `query` (de la necesidad), `context` (país, idioma, moneda), `filters.price` en céntimos y `pagination.limit` = 10; detalle con `get_product` (`catalog.id` = gid de Shopify).
4. Importar por URL de grimey.com: `get_product` no admite el handle, así que se resuelve con `search_catalog` y se completa con `get_product`. No se lee la página HTML.

**Perfil UCP del agente:** la app publica el suyo en `/.well-known/ucp` (público, sin sesión ni redirecciones, `Cache-Control: public, max-age=3600`) y declara **solo** `dev.ucp.shopping.catalog.search` y `dev.ucp.shopping.catalog.lookup`. Configura `SHOPPING_UCP_PROFILE_URL=https://tu-dominio/.well-known/ucp`. Sin esa variable el conector no llama a la tienda.

**Campos obtenidos y procedencia:**

| Campo | De dónde sale | Procedencia |
|---|---|---|
| Nombre, URL, descripción, identificador (gid) | `title`, `url`, `description.html`, `id` | Tienda |
| Precio y moneda | `price_range.min` (céntimos → euros); si varía por talla se guarda el rango | Tienda |
| Precio anterior | `list_price_range.max` si es mayor que el precio (0 = no hay) | Tienda |
| Tallas y disponibilidad | `variants[].options` (Talla/Size) y `availability.available`; si el detalle trae una variante, `options[].values[]` | Tienda; sin dato, «sin comprobar» |
| Disponibilidad del producto | Alguna talla disponible | Tienda |
| Composición | Texto literal de la descripción con porcentajes («Material: 100% COTTON», «EXTERIOR: … INTERIOR: …») | Tienda; sin porcentajes, desconocida |
| Imágenes | `media[]` de tipo image | Solo enlazadas (no se copian ni se envían a la IA) |
| Tipo de prenda y color | Del nombre y de colecciones/etiquetas CAT: (las categorías de Shopify vienen vacías) | Deducido |
| Marca | UCP no la publica; si el nombre incluye «Grimey» | Deducido |
| Fecha de consulta | `raw_attributes.fetched_at` y `last_verified_at` | — |

**Límites y políticas:**

- Solo bajo demanda (cuando buscas, importas o verificas). Sin recorridos del catálogo ni copia permanente; `/products.json` no se usa.
- Por tienda: mínimo 0,4 s entre llamadas y máximo 20 por minuto en cada servidor de la app; ante 429/503 se respeta `Retry-After` sin reintentar en bucle. Caché de búsquedas con Grimey: 15 minutos (UCP pide no reutilizar respuestas entre sesiones sin revalidar); antes de decidir, «Volver a comprobar en la fuente» llama a `get_product`.
- Se respetan tus tiendas preferidas y excluidas. El buscador genérico no repite las tiendas que ya tienen conector UCP.
- Seguridad: el endpoint pasa la misma protección SSRF que la importación por URL; la respuesta se limita a 3 MB y 8 s.
- Identificación: User-Agent propio y perfil UCP. **Pendiente**: firmar las peticiones (Web Bot Auth / RFC 9421), que `agents.md` pide para tráfico de servidor y Shopify recomienda para producción; hoy el tráfico es del nivel anónimo de Shopify.
- Detrás de un proxy de salida que resuelve DNS (como en el entorno de pruebas en la nube), `SHOPPING_FETCH_VIA_PROXY=1` y `NODE_USE_ENV_PROXY=1`.

**Verificado contra el catálogo real** (`GRIMEY_LIVE=1 node tests/e2e/grimey-live.cjs`): búsqueda por necesidad, ficha guardada, verificación con `get_product`, importación por URL, URL inexistente, Product Analyzer y evaluación de compra. Para esa verificación se usó como perfil el de ejemplo que publica Shopify para pruebas, porque el entorno no tiene una URL pública; en producción debe usarse el de la app.

### Conector UCP: EME Studios

`EmeStudiosProductSource` (`lib/shopping/catalog/eme-studios.ts`) cumple `ProductSource` y reutiliza el cliente UCP (descubrimiento, MCP limitado a las herramientas de catálogo, límites y 429). El registro `lib/shopping/catalog/registry.ts` elige este conector para la tienda `eme-studios` (migración `0020_eme_studios.sql`) y el genérico para el resto.

**Descubrimiento (9-11-2026):**

- `https://emestudios.com/agents.md`: los protocolos de agentes funcionan en `https://checkout.emestudios.com`; MCP en `https://checkout.emestudios.com/api/ucp/mcp`; versiones `2026-04-08` y `2026-01-23`; pide pasar `context.address_country` y `context.currency`, respetar 429 (límite por IP) y aprobación humana para pagar. Recomienda instalar la Shop Skill: **no se instala ni se conectan cuentas** (no hace falta para consultar el catálogo).
- `https://emestudios.com/robots.txt`: solo bloquea `/location`, `/studio` y cuenta, contraseña, lista de deseos y pruebas de acceso por idioma. `sitemap.xml` enlaza sitemaps por país e idioma; no se recorre.
- `https://emestudios.com/.well-known/ucp` responde **403 de Cloudflare** a este servidor («Sorry, you have been blocked»). No se intenta eludir: el perfil se lee en `https://checkout.emestudios.com/.well-known/ucp`, el dominio que `agents.md` indica para los protocolos de agentes.
- Perfil UCP: versión `2026-08-25` (anteriores soportadas: `2026-04-08`, `2026-01-23`); endpoint MCP anunciado `https://eme-official.myshopify.com/api/ucp/mcp` (el de `agents.md` responde igual); capacidades `dev.ucp.shopping.catalog.search`, `dev.ucp.shopping.catalog.lookup`, `dev.shopify.catalog`, además de carrito, checkout, pedidos, etc.
- `tools/list`: 15 herramientas. `search_catalog`, `lookup_catalog` y `get_product` tienen **los mismos esquemas de entrada y salida** que en Grimey. La consulta de catálogo **no exige habilitar ninguna operación transaccional**: `create_cart`, `create_checkout`, `update_checkout`, `complete_checkout`, `get_order` y demás no se llaman nunca (lista blanca del cliente UCP).

**Búsqueda real (validación):** herramienta `search_catalog` con `catalog.query` de la necesidad («Vaqueros hombre»), `context = {address_country: ES, language: es, currency: EUR}`, `filters.price.max` en céntimos y `pagination.limit = 10`. Respuesta: `structuredContent` con `ucp.version = 2026-08-25`, `products[]` y `pagination.has_next_page`. Ejemplos recibidos: «Ledger Raw Denim Pants», 65 € (antes 89 €), tallas 34-46 disponibles, `tags` con «hombre»; «Rough Denim Pants», 89 €. Después: `get_product` (verificación) y resolución de un enlace `emestudios.com/es/es/products/{handle}` con `search_catalog` + `get_product`.

**Campos obtenidos:** los mismos que en Grimey (nombre, URL de `checkout.emestudios.com`, identificador gid, precio y moneda, precio anterior, tallas con disponibilidad, imágenes de `cdn.shopify.com` solo enlazadas, colecciones, fecha de consulta) y además **público** (`raw_attributes.audience`: hombre, mujer o unisex) según las etiquetas que publica la tienda, con procedencia «Tienda».

**Lo que la tienda no publica y queda desconocido:** composición (las descripciones solo indican la altura y la talla del modelo; esa información sí llega al Product Analyzer), marca (los nombres no la incluyen), color en la mayoría de nombres. Las categorías de Shopify vienen como identificadores de taxonomía; el tipo de prenda se deduce del nombre.

**Límites y políticas:** consultas bajo demanda; ritmo por tienda y `Retry-After` en 429 (límite por IP según `agents.md`); caché de búsquedas de 15 minutos; nunca se lee la web de emestudios.com; las prendas etiquetadas solo «mujer» no se proponen (el armario es masculino), las «FOR EVERYONE» sí; los productos externos nunca entran en `garments`.

**Pruebas:** `tests/eme-studios.test.ts` (respuestas reales como datos: descubrimiento, búsqueda por necesidad, normalización, público, consulta por enlace localizado, 429, sin perfil, tienda excluida, registro de conectores, ausencia de herramientas transaccionales) y `EME_LIVE=1 node tests/e2e/eme-live.cjs` contra el catálogo real (con el perfil de prueba de Shopify, por la misma razón que Grimey).

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

## Personal Shopper Intelligence

El Personal Shopper ya no es un buscador por palabras: **perfil → diagnóstico → necesidad → búsqueda → evaluación → recomendación**. Tres motores separados: Product Discovery (encuentra productos reales), Personal Style Evaluator (los evalúa con tu perfil) y Wardrobe Compatibility (simula la compra con tu armario). La IA solo interpreta productos (Product Analyzer); el código calcula puntuaciones, aplica restricciones y valida que productos y prendas existan.

**Diagnóstico previo (10-11-2026):** la búsqueda solo usaba el texto de la necesidad y descartaba cualquier producto de otro color; la evaluación personal existía (4C) pero solo al abrir un producto; el color ignoraba qué colores faltan o sobran en tu armario; no había Wardrobe Value Added. Los datos del perfil existían: faltaba conectarlos.

### Contexto de compra (`lib/shopping/intelligence/context.ts`)

Se construye una vez por búsqueda con lo que ya existe: colorimetría (temperatura con su origen y confianza, contraste, profundidad, intensidad, colores que te gustan y evitas, paleta), ajuste (preferencias por tipo de prenda, ajuste general, proporciones de tus medidas, lo que nunca te pondrías), identidad estética (influencias, rasgos preferidos y rechazados, marcas), armario (prendas activas, distribución cromática por categoría, tonos claros y oscuros, uso real si hay registro suficiente), aprendizaje de Outfit Studio y necesidades. Su huella (hash) forma parte de la caché: si cambian tu perfil o tu armario, la búsqueda se repite.

### Color Intelligence (`lib/shopping/intelligence/color.ts`)

Separa tres preguntas: **¿te favorece?** (colorimetría, con la confianza de su origen; un color que evitas no se compensa con nada), **¿lo necesita tu armario?** (ausente, escaso, presente o saturado en esa categoría; dominante en el armario; equilibrio claro/oscuro) y **¿combina con lo que tienes?** (prendas complementarias reales). Etiquetas: te favorece y te falta, equilibra el armario, redundante, poco favorable, correcto o sin datos. Sin colorimetría la parte personal queda neutra y se dice que no se puede afirmar que un color favorezca.

### Búsqueda inteligente (`lib/shopping/intelligence/discovery.ts`)

Se busca el **tipo de prenda** sin exigir el color escrito, además el color pedido (si lo hay) y los **colores que te favorecen y faltan** en tu armario (hasta 3 consultas, en serie para respetar los límites de cada tienda). Los candidatos se normalizan (con corte y silueta deducidos del texto de la tienda cuando lo dice), se quitan duplicados, se evalúan uno a uno con tu perfil y tu armario (Outfit Engine incluido) y se ordenan por esa evaluación: nunca por precio, popularidad ni coincidencia textual.

### Wardrobe Value Added

¿Qué aporta que hoy no tienes? Conjuntos nuevos generados y validados por el Outfit Engine con IDs reales (si es casi un duplicado, solo cuentan los que la prenda parecida no permite), ocasiones hoy sin cubrir, huecos y necesidades que resuelve, diferenciación frente a lo que tienes, sustitución, versatilidad y coste por uso estimado. Se guarda con ejemplos de conjuntos y las prendas con las que combina.

### Resultados

Recomendados para ti (mayor compatibilidad personal), mejor aportación al armario, mejor opción para tu necesidad, alternativas interesantes y no recomendados con sus motivos (los descartados nunca aparecen como recomendación principal). Cada producto muestra puntuación, confianza, completitud, por qué encaja, qué aporta, con qué prendas combina, un conjunto de ejemplo, inconvenientes e información que falta.

### Pruebas

- `tests/personal-shopper.test.ts`: el mismo producto puntúa distinto para perfiles distintos; un color favorable pero saturado no gana; el corte que no prefieres resta; los outfits nuevos (con IDs reales) suman; la redundancia penaliza; la falta de datos queda neutra y baja la confianza; cambian las recomendaciones al cambiar el perfil o el armario; los descartados no se recomiendan; búsqueda ampliada y Color Intelligence.
- `tests/e2e/personal-shopper.cjs` (tienda de prueba): dos perfiles con los mismos productos; el color saturado no gana y queda como no recomendado con motivo; entre dos pantalones parecidos gana el de corte adecuado aunque sea más caro; al cambiar el armario cambia la recomendación y la caché.
- `tests/e2e/psi-live.cjs` (`PSI_LIVE=1`): dos perfiles opuestos con productos reales de Grimey y EME Studios.

## Product Analyzer y Purchase Evaluator (4C)

### Product Analyzer (`product-analyst@1`, esquema `product-analysis@1`)

Reutiliza el contrato y la normalización del Garment Analyst (2B). Entrada: el texto de la tienda (nombre, descripción, composición publicada) y hasta 4 imágenes. **Qué imágenes se envían a la IA:** tus capturas y fotos, y las imágenes de un feed autorizado. Las imágenes de una página de tienda solo se enlazan y nunca se envían (y las de Inditex nunca se descargan). Sin imágenes, se analiza solo el texto.

- Cada atributo indica si lo dice la tienda, se ve en una foto o es una inferencia; en la ficha queda como «Foto» o «IA» con su confianza.
- La IA nunca rellena composición, tallas, medidas, precio ni disponibilidad. Su análisis no sustituye lo publicado por la tienda o el feed ni lo que pusiste tú.
- Calidad en tres partes: **documentada** (composición publicada y afirmaciones de la descripción citadas literalmente; sin cita, se descarta), **aparente** (lo que se ve en las fotos; no demuestra la calidad real) y **desconocida**. Un precio alto no implica más calidad.
- Estilo: hasta 3 estilos del catálogo de Style DNA. Fotos con modelo: se avisa de que su ajuste no es el tuyo.
- Mismo texto e imágenes → mismo análisis (caché); cada análisis queda versionado con modelo, prompt e imágenes usadas.

Prompt base:

```
Eres Product Analyst, el especialista de Personal Stylist que analiza productos de tiendas que el usuario está pensando comprar.
Conviertes la ficha comercial (texto) y las fotografías disponibles en una ficha técnica comparable con las prendas de su armario.

REGLAS FUNDAMENTALES:
1. Usa solo lo que dice el TEXTO DE LA TIENDA o lo que se ve en las FOTOGRAFÍAS. Indica en "field_origins" el origen de cada campo: "text" (lo dice la tienda), "photo" (se ve) o "inference" (lo deduces).
2. No inventes composición, tallas, medidas, precio, disponibilidad ni información comercial. "composition" debe ser null y "label" null: la composición solo la aporta la tienda o el usuario.
3. Calidad: separa en "quality.documented" lo que la descripción de la tienda AFIRMA (cítalo), en "quality.apparent" lo que se aprecia en las fotos (tejido, acabados, costuras) y en "quality.unknown" lo que no se puede saber. Una foto no demuestra calidad real y un precio alto no implica más calidad.
4. Si hay fotos con modelo, "model_photos": true. El ajuste en el modelo NO es el ajuste del usuario: no lo deduzcas.
5. Diferencia el corte diseñado (cut, silhouette) de cómo le queda al modelo.
6. Estilo: hasta 3 "style_tags" del catálogo indicado, solo si el producto encaja claramente.
7. Usa la taxonomía masculina proporcionada: SOLO los valores de las listas, escritos exactamente igual. Lo que no puedas determinar: value null y explícalo en "unknown".
8. No valores si conviene comprarlo: eso lo decide el evaluador con el perfil y el armario del usuario.
9. Devuelve ÚNICAMENTE el JSON con el esquema indicado.
```

### Puntuación de compra (`personal-shopper@1`, reglas, sin IA)

| Criterio | Peso | De dónde sale |
|---|---|---|
| Compatibilidad cromática | 25 | Te favorece (colorimetría y contraste), aporta colores que faltan y combina con tus prendas. |
| Corte y proporciones | 20 | Corte, silueta, largo y volumen frente a tus preferencias de ajuste y tus proporciones. |
| Identidad estética | 15 | Encaje con tus estilos validados, referencias, rasgos que prefieres o rechazas y marcas. |
| Compatibilidad con tu armario | 20 | Wardrobe Value Added: outfits nuevos validados, ocasiones, huecos, diferenciación y versatilidad. |
| Necesidad y utilidad | 10 | Si resuelve un hueco, es una mejora, una sustitución necesaria o un deseo. |
| Calidad y precio | 10 | Materiales documentados y precio frente a utilidad y calidad conocida (nunca el precio como prueba de calidad). |

Lo desconocido **no** cuenta como negativo: el criterio queda neutro (50 % de su peso) y baja la confianza. Indicadores independientes (la puntuación no los oculta): confianza (0-100, según qué criterios se conocen y la fiabilidad de su fuente), completitud de los datos del producto, redundancia (0-100), Wardrobe Value Added, outfits nuevos, compatibilidad con tu perfil, tallas, precio y bajadas. Además se listan los **límites**, los **riesgos**, la **información que falta** y, si se descarta, los **motivos**.

### Redundancia

Se compara con tus prendas de la misma categoría (similitud de la auditoría 2D: tipo, color, corte, material, formalidad y función). Duplicidad alta si hay una casi idéntica o varias del mismo tipo y color. Se calcula qué aportaría: con cuántas prendas tuyas combinaría que hoy no combinas con la parecida, y en qué se diferencia.

### Veredicto

| Veredicto | Cuándo |
|---|---|
| Comprar | Encaja contigo, cubre una necesidad y aporta al armario. |
| Considerar | Puede merecer la pena, con matices que conviene revisar. |
| Esperar | Falta algo (talla, precio, datos o una necesidad más urgente) antes de decidir. |
| No comprar | No aporta lo suficiente a tu armario o no encaja contigo. |

Reglas: **no comprar** si duplica algo y apenas abre combinaciones nuevas, si el color es uno que evitas o no te favorece (con colorimetría fiable), si el corte choca con tus preferencias o lo que nunca te pondrías, o si puntúa menos de 50; **esperar** si está agotado o no queda tu talla, si no cubre ninguna necesidad y hay otra más urgente, o si el precio supera mucho tu límite; **comprar** con 75 o más, confianza de 55/100 o más, sin duplicidad, cubriendo una necesidad y con color y corte (si se conocen) favorables; si no, **considerar**. El texto explica por qué y, si procede, en qué invertir en su lugar.

### Talla

Se comparan las medidas (cm, mismo criterio) de una prenda tuya que te queda bien con la guía de medidas de la candidata (que copias tú de la web de la tienda). Medidas: parte inferior — cintura, cadera, muslo, tiro, entrepierna, bajo; parte superior — pecho, hombros, largo, manga, cintura. Tolerancia de 1 cm (2,5 cm en contornos si el tejido tiene elastano); quedarse corto en un contorno sin elasticidad pesa más. Confianza alta solo con 3 o más medidas, diferencias pequeñas y una talla claramente mejor. Sin medidas, como último recurso, la talla que te funciona en una prenda de la misma marca (confianza baja). Nunca se garantiza.

### Comparar

De 2 a 4 candidatos lado a lado, ordenados por puntuación de compra, con veredicto, criterios, límites y la mejor opción explicada. Si ninguno convence, lo dice: esperar también es una opción.

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

Migración `0018_product_analyzer.sql` (4C):

| Tabla o columna | Contenido |
|---|---|
| `external_products` + `formality_level`, `seasons`, `style_tags`, `attributes` | Atributos que completa el análisis, con su procedencia |
| `external_product_variants` + `measurements`, `measurements_source` | Guía de medidas por talla |
| `product_analyses` | Análisis versionados: modelo, prompt, imágenes usadas, respuesta, normalización, calidad, consumo |
| `purchase_evaluations` | Evaluaciones de compra: pesos, criterios, indicadores, redundancia, talla, veredicto, límites y riesgos |
| `garment_measurements` | Medidas de tus prendas de referencia (una por prenda) |

RLS por usuario; un análisis o una evaluación solo sobre productos propios, y las medidas solo de prendas propias.

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
| `POST /api/shopping/products/:id/analyze` | Product Analyzer (IA; `force` repite) |
| `GET/POST /api/shopping/products/:id/evaluate` | Última evaluación, análisis y referencias; evaluar (`reference_id` para la talla) |
| `PUT /api/shopping/products/:id/size-chart` | Guía de medidas por talla |
| `PUT /api/shopping/references/:garmentId` | Medidas de una prenda tuya de referencia |
| `POST /api/shopping/compare` | Comparar 2-4 productos |

## Interfaz

- `/compras` — Shopping Intelligence: analizar, veredicto («merece la pena comprar» o «no necesitas comprar nada»), necesidades por prioridad, alta de necesidades y deseos.
- `/compras/necesidades/:id` — desglose de la prioridad, conjuntos nuevos, uso, coste por uso, redundancia, ocasiones, estados, prioridad manual, listas, edición e historial.
- `/compras/plan` — Shopping Planner: qué merece la pena y qué puede esperar, presupuesto, listas y preferencias.
- `/compras/buscar` — búsqueda en fuentes autorizadas, estado de cada fuente y resultados por coincidencia.
- `/compras/importar` — por URL o asistida.
- `/compras/productos` y `/compras/productos/:id` — candidatos con procedencia de cada dato, tallas, verificación, historial de precios, capturas, correcciones y descarte.
- `/compras/fuentes` — tiendas con su política, feeds autorizados y estado del buscador.
- En la ficha del producto: «Análisis del producto», «¿Merece la pena?» (veredicto, puntuación, indicadores, redundancia, riesgos y límites) y «Talla». En la lista de candidatos, su veredicto y puntuación, y `/compras/comparar`.

## Pruebas

- `tests/shopping.test.ts`: pesos y niveles, explicabilidad, deseo redundante, sustitución, coste por uso, urgencia, detección, presupuesto, migración y RLS.
- `tests/e2e/shopping.cjs`: recorrido completo en móvil, integración con la auditoría, estados, listas, presupuesto, preferencias y aislamiento entre dos usuarios (app y RLS directa).
- `tests/product-discovery.test.ts`: tipo y color en español e inglés, precio, composición, URL canónica, procedencia, extracción schema.org/OpenGraph, robots.txt, SSRF, feeds, búsqueda y gestor de fuentes, política de Inditex, migración.
- `tests/purchase.test.ts`: pesos, explicación, veredictos (comprar, no comprar por redundancia, esperar), límites visibles, calidad sin precio, análisis (sin composición inventada, cita literal, procedencia, no pisa datos de la tienda), tallas, migración.
- `tests/e2e/purchase-evaluator.cjs` (con IA simulada y la tienda de prueba): análisis y qué imágenes se envían, evaluación, talla con medidas, redundancia, comparación y aislamiento.
- `tests/ucp.test.ts` (con respuestas reales de Grimey como datos de prueba): descubrimiento, búsqueda por necesidad, normalización, agotados, sin precio, composición desconocida, consulta por URL, errores (JSON-RPC, 424, 429, SSE, timeout), límites y políticas, perfil del agente.
- `tests/e2e/grimey-live.cjs`: verificación contra el catálogo real (solo con `GRIMEY_LIVE=1`).
- `tests/e2e/product-discovery.cjs` con `tests/e2e/fake-store.mjs` (tienda y buscador de prueba locales): feed, búsqueda desde una necesidad, importación por URL y sus bloqueos, asistida con capturas, verificación con historial, descarte y aislamiento (app, RLS y Storage).
