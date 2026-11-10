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
| Channel3 (`channel3`) | Datos de la tienda recopilados por el catálogo de Channel3 (precio y stock se vuelven a consultar antes de mostrarlos). |
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

## Personal Shopper 2.0 · Estilista estratégico

El Personal Shopper evoluciona de buscador de prendas compatibles a **estilista**: primero estudia tu armario, tu identidad y el mercado; después decide qué merece la pena incorporar y solo entonces busca productos. Fases: 2.0B diagnóstico del armario (hecho), 2.0C tendencias (Brave + Channel3), 2.0D oportunidades, 2.0E búsqueda desde oportunidades, 2.0F evaluación estratégica, 2.0G interfaz, 2.0H validación. Siempre se distingue **presencia comercial** (está en catálogos), **evidencia editorial** (fuentes con fecha) e **hipótesis estilística** (razonamiento del estilista).

### 2.0B · Diagnóstico estratégico del armario (`lib/stylist/wardrobe.ts`)

Lee el armario como conjunto, reutilizando Style DNA, la auditoría, el Outfit Engine y Color Intelligence (no duplica ninguno). Es determinista y cada hallazgo lleva diagnóstico, evidencias (prendas y datos), datos usados, lo que falta y confianza. Son diagnósticos e hipótesis, no compras ni tendencias.

- **Estética**: tus prendas traducidas a rasgos del catálogo de estilos → qué estilos transmite tu armario frente a tu identidad (coherencia en %), rasgos de tu identidad que faltan y prendas con rasgos que rechazas.
- **Siluetas**: distribución de cortes y siluetas. Una carencia no es una categoría ausente: con 10 pantalones casi todos rectos, si tu identidad usa el pantalón amplio y tu silueta corporal lo admite (sin rechazarlo), lo detecta como «silueta que falta».
- **Proporciones**: el Outfit Engine forma los conjuntos válidos de tu armario; si la mayoría repite la misma relación arriba-abajo, tus conjuntos se parecen demasiado.
- **Color**: paleta, peso de los neutros, acentos que te favorecen y encajan con tu identidad, y colores poco favorables cerca de la cara (con colorimetría).
- **Formalidad y ocasiones** (auditoría), **texturas** (con material conocido), **redundancias** (auditoría), **potencial infrautilizado** (registro de uso + combinaciones), **prendas aisladas** (sin ningún conjunto válido) y **lo que ya funciona**.
- **Grado de experimentación** (Objetivos de imagen: conservador, abierto, explorador; editable en tu perfil): orientará la prioridad de las oportunidades, sin prohibir ninguna.

Persistencia: `wardrobe_analyses` (migración 0021; versionado, RLS). Se reutiliza mientras no cambie su huella (prendas, identidad, colorimetría, medidas, ajuste, estilo de vida, objetivos, Fit Assessments y uso). Página: **Personal Shopper → Estilista** (`/compras/estilista`); API `GET/POST /api/stylist/wardrobe`.

Pruebas: `tests/stylist-wardrobe.test.ts` y `tests/e2e/stylist-wardrobe.cjs` (10 pantalones rectos → silueta que falta; proporciones repetidas; paleta neutra; aislamiento, redundancias e infrautilizadas; límites sin identidad ni colorimetría; huella; pregunta de experimentación; caché y RLS).

### 2.0C · Trend Intelligence (`lib/stylist/brave.ts`, `trends.ts`, `trend-service.ts`)

Investiga **direcciones** de la moda masculina (siluetas y proporciones, color, materiales y texturas, lavados, estampados, calzado, prendas exteriores, capas, estéticas), no qué se vende más. Cuatro pasos separados:

1. **Recuperación** (Brave Search: `/res/v1/web/search` y `/res/v1/news/search`): 12 consultas propias por dimensión y temporada, más 2 sobre tu identidad; en inglés y en español; último año (noticias: último mes).
2. **Filtrado por código**: fuera tiendas, notas de prensa de mercado, contenido solo de mujer, resultados antiguos y duplicados; reparto entre consultas (máx. 40 evidencias).
3. **Síntesis por IA** (proveedor configurado): solo sobre las evidencias, citándolas (E1, E2…); sin conocimiento propio, cifras, popularidad, crecimiento ni vigencia. No se le envían URL.
4. **Validación por código**: citas inexistentes descartadas; marcas solo si aparecen en las fuentes citadas; frases con cifras de ventas o popularidad eliminadas; **tendencia** solo con ≥ 2 medios independientes (una sola fuente = propuesta aislada); etapa (emergente, consolidada, de temporada, saturada) y confianza calculadas por código a partir de medios y fechas; «saturada» exige dos fuentes que lo digan.

**Presencia comercial** (Channel3, aparte): productos, marcas y tiendas en España para cada tendencia y para las hipótesis del armario (p. ej. «te falta un pantalón amplio»). Es un dato de mercado: estar en catálogos no es una tendencia. Tope: 6 créditos por investigación (de los ~25 de una estrategia completa).

**Dos niveles**: con Brave + Channel3, evidencia editorial y presencia comercial; solo con Channel3, presencia comercial de las hipótesis del armario y nada se presenta como tendencia. La relevancia **personal** de cada señal no se decide aquí (2.0D).

**Condiciones de Brave**: no se pueden almacenar ni cachear sus resultados salvo de forma transitoria (ni usarlos para entrenar modelos) sin un plan con derechos de almacenamiento. Por eso **no se guardan** URL, títulos ni fragmentos: se guardan las conclusiones validadas, nuestras consultas, recuentos y fechas; las fuentes se vuelven a consultar **en vivo** al abrir una señal («Ver fuentes»). Con un plan con derechos de almacenamiento, `BRAVE_STORAGE_RIGHTS=1` guarda sus metadatos. Usa un proveedor de IA que no entrene con tus datos. Ni siquiera las pruebas guardan resultados reales de Brave (usan datos sintéticos).

**Caché**: semanal (misma temporada e identidad); «Investigar de nuevo» la renueva. Consumo registrado en `ai_runs` (consultas de Brave y coste estimado, créditos de Channel3, uso de IA). Configuración: `BRAVE_SEARCH_API_KEY` (o la clave del buscador de productos si es Brave), `BRAVE_COUNTRY`, `BRAVE_SEARCH_LANG`, `BRAVE_STORAGE_RIGHTS`. Migración `0022_trend_intelligence.sql` (`trend_researches`, `trend_signals`, RLS).

Pruebas: `tests/trends.test.ts`, `tests/e2e/stylist-trends.cjs` (Brave de prueba con resultados sintéticos e IA simulada con trampas) y `tests/e2e/trends-live.cjs` (`TRENDS_LIVE=1`, Brave y Channel3 reales).

## Channel3 (catálogo multimarca)

Channel3 es un proveedor de **descubrimiento**: encuentra productos y aporta sus datos; **no decide qué te favorece** (lo decide el motor 4C) y su relevancia no se usa como puntuación. Conector: `lib/shopping/catalog/channel3.ts` (cumple `ProductSource`). Documentación oficial: https://channel3.ai/docs; esquemas comprobados con el SDK oficial `@channel3/sdk` 4.9.0 (no se usa como dependencia: el conector llama a la API directamente y valida cada respuesta con Zod).

| Operación | Uso | Coste |
| - | - | - |
| `POST /v1/search` | Buscar candidatos (modo `default`: texto + semántica) | 1 crédito |
| `GET /v1/products/{id}` | Ficha actual: precio, disponibilidad, tallas y enlace de compra | Gratis |
| `GET /v1/websites/search` | Dominio → tienda y mercados en los que está indexada (caché 24 h) | Gratis |
| `POST /v1/lookup` | URL de una tienda «solo enlace» → ficha, solo si ya está en su catálogo (`realtime_fetch: false`) | 1 crédito |

**Configuración** (solo servidor; ver `.env.example`): `CHANNEL3_API_KEY`, `CHANNEL3_COUNTRY=ES`, `CHANNEL3_LANGUAGE=es`, `CHANNEL3_CURRENCY=EUR`, `CHANNEL3_FOREIGN_MARKETS=1`, `CHANNEL3_MODE=default`. La clave va en la cabecera `x-api-key`, solo hacia la API oficial; nunca llega al navegador, a los registros ni a la base de datos. Sin clave, Channel3 queda desactivado.

**Mercados.** Channel3 indica en qué países tiene cada tienda. A 10-11-2026: Zara está indexada en España; **Bershka solo en Reino Unido y EE. UU.; Pull&Bear solo en EE. UU.** Con `CHANNEL3_FOREIGN_MARKETS=1` esas tiendas se consultan en su mercado y sus productos se marcan «precio de otro mercado, no verificado para España»: el precio (en £ o $) **no** se compara con tu presupuesto en euros (para el motor queda desconocido y neutro; no se convierten divisas).

**Consultas.** Se envían solo criterios comerciales: tipo de prenda (categoría de la taxonomía de Channel3 comprobada), un color por consulta (hex; la paleta de Channel3 es una condición AND), tiendas, género y precio en tu moneda. Nunca medidas, fotos ni tu perfil. En mercados extranjeros el texto va en inglés. Se agrupan las tiendas por mercado: 1 crédito por consulta y mercado (una búsqueda típica: 3 créditos). El modo `agentic` (un LLM planifica sub-búsquedas, más latencia) existe pero no se activa por defecto (`CHANNEL3_MODE=agentic`).

**Normalización y procedencia.** Cada producto pasa al modelo común (`external_products`): título, marca, categoría, descripción, precio y precio anterior, moneda, composición (solo con porcentajes), corte o silueta del atributo `fit`, imágenes (solo enlazadas), tallas con disponibilidad (si la ficha las trae) y fecha de consulta. Procedencia: «Channel3» para lo publicado; «Deducido» para lo sacado del texto; «Foto» para el color estimado de la imagen. Lo ausente queda desconocido. Identidad estable: `channel3:<id>`.

**Actualización.** Según sus normas de caché se guardan los ID, no los precios: la caché de 24 h reutiliza el descubrimiento y la evaluación, pero antes de mostrar resultados (o una ficha con más de 30 min) se pide la ficha actual (gratis), se reevalúa y se reordena. El enlace de compra es temporal: no se guarda y se genera en el momento del clic (`/api/shopping/channel3/offer`). La comisión de afiliación ni se guarda ni influye en nada.

**Consumo.** Cada búsqueda, verificación o clic registra en `ai_runs.meta.channel3` las llamadas por tipo, el tiempo, los errores y los créditos estimados (0,007 $ por crédito tras los 1000 gratuitos al mes). Límites de la API: 10 búsquedas/s y 10 000 llamadas/día; un 429 se respeta (`Retry-After`, un único reintento).

**Pruebas.** `tests/channel3.test.ts` (respuestas reales guardadas en `tests/fixtures/channel3-*.json`: configuración, autenticación, 429, tiempo agotado, mercados, consultas, normalización, deduplicación y evaluación 4C con dos perfiles, cambio de corte y de armario). `tests/e2e/channel3-live.cjs` (`CHANNEL3_LIVE=1`, API real: Bershka y Pull&Bear por separado, Zara, dos perfiles, interfaz, enlace de oferta, verificación, caché con refresco y que la clave no llegue al navegador).

## Tallas, moda masculina y disponibilidad por talla

Condiciones **previas** al motor 4C (no son un criterio más y no cambian sus pesos 25/20/15/20/10/10 ni el WVA). Archivos: `lib/shopping/intelligence/sizes.ts`, `gender.ts` y `eligibility.ts`.

**Moda masculina.** A Channel3 se le pide `gender: male` y `age: ["adult"]`, y después cada producto se valida con datos estructurados: el género y la edad de Channel3 o del feed (`gender`, `age_group`), la ruta de categoría y las etiquetas o colecciones de la tienda (UCP). Nunca el nombre comercial. Mujer o infantil → excluido. Unisex → solo apto en prendas de tallaje neutro (camisetas y polos, punto y sudaderas, calzado y complementos sin talla); en el resto, ambiguo. Sin datos → ambiguo: visible, nunca recomendado.

**PersonalizedSizeResolver.** Por grupo de tallaje (camisetas, camisas, punto, pantalones, vaqueros, chaquetas, sastrería, calzado) decide tu talla principal, las alternativas (solo con datos que las respalden), las descartadas, la confianza, los datos usados, el motivo y lo que falta. Fuentes: tus tallas habituales (perfil, «camisa M, pantalón 42, calzado 43», también por marca), la talla que te funciona en prendas de tu armario, Fit Assessments confirmados (≥7 respalda; <5 descarta esa talla), prendas marcadas como referencia de medidas y, por marca, lo que ya tienes de esa marca. Las medidas corporales se registran, pero no se convierten en talla: no hay guías oficiales de las marcas (Channel3 no las publica y las de Inditex no se pueden extraer). Su huella forma parte de la caché: cambiar tallas, ajuste o un Fit Assessment repite la búsqueda.

**Normalización de tallas.** Cada talla conserva la etiqueta original, su sistema (letras, numérica EU, cintura en pulgadas, calzado EU/UK/US, cuello) y la confianza de la lectura; el rango y el resto de tallas del producto distinguen 36-56 EU de 26-36 en pulgadas. **No hay conversiones entre sistemas ni se da por hecho que una M de una marca sea la M de otra**: misma marca con datos tuyos → confianza alta; otra marca, misma talla y sistema → confianza media o baja, y se indica.

**Disponibilidad por talla.** Channel3 no trae el stock por talla en la búsqueda (`variants.options[].values[].available` vacío); su ficha `GET /v1/products/{id}` (gratis) sí, por talla, para el color seleccionado (`variants.selected`) y el país pedido. Antes de evaluar se pide la ficha de cada candidato. Un producto solo se recomienda si hay una variante en tu talla con `InStock`, comprobada hace menos de 60 min (UCP 60 min; feed: última sincronización, máx. 24 h) y en el mercado español. Política: talla compatible y stock confirmado → recomendable; stock desconocido, antiguo o de otro mercado → pendiente (se evalúa, nunca «compra recomendada» ni grupos principales); sin tu talla o agotado en todas tus tallas → excluido; producto que no es de hombre → excluido. Nunca se deduce stock de que aparezca, tenga precio o exista una variante.

**En Channel3** se envían además tus tallas como prefiltro (`attributes.size` / `shoe-size`, valores canónicos sin sistema) **solo en tu mercado**; fuera de él un «42» no significa lo mismo y no se filtra. La validación es siempre local. No se envían medidas, fotos ni el perfil.

**Pruebas.** `tests/sizes.test.ts` (normalizador, tallas por categoría, equivalencias, agotado en tu talla, talla incompatible, stock desconocido/antiguo/de otro mercado, mujer/infantil/unisex, prefiltro de Channel3, invalidación de caché, pesos y WVA intactos, Outfit Engine con IDs reales), con fichas reales de Zara España; `tests/e2e/personal-shopper.cjs` (feed con una fila por talla, producto de mujer, infantil y agotado en tu talla) y `tests/e2e/channel3-live.cjs`.

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
