# Armario digital (Fase 2)

> Documento generado desde `lib/wardrobe/taxonomy.ts` con `npm run docs`. No lo edites a mano.

## Principios

- **Un solo sistema.** El armario tiene sus tablas, pero consulta el expediente y el Style Blueprint; no duplica datos personales.
- **Nada se da por confirmado sin comprobarlo.** El corte de una prenda no dice cómo te queda (eso es el Fit Assessment, con fotos llevándola) y el material aparente no es la composición (que solo se confirma con etiqueta, ficha comercial o tu palabra).
- **Trazabilidad.** Cada campo guarda quién lo estableció y cuándo (`field_sources`: usuario, ia, etiqueta, ficha) y cada cambio queda en `garment_events`.
- **Nada se borra solo.** Archivar es reversible; eliminar exige confirmación explícita.
- **Imágenes privadas.** Buckets privados por usuario, URLs firmadas de vida corta, nunca públicas.

## Estado de la fase

| Subfase | Contenido | Estado |
|---|---|---|
| 2A · Base del armario | Tablas, Storage, alta con varias fotos (cámara o galería), edición, archivo, búsqueda, filtros, orden, historial | Hecha |
| 2B · Garment AI | Análisis de visión, prompt especializado, esquema con confianza por campo, revisión y confirmación (`garment_analyses`), control de costes | Hecha |
| 2C · Evaluación personal | Compatibilidad con tu perfil, valor estratégico, Fit Assessment (IA con fotos puestas o autoevaluación), decisiones | Hecha |
| 2D · Auditoría | Clasificación por estado, duplicados, huecos por categoría, ocasión y temporada, necesidades prioritarias, informes versionados con recomendaciones que apruebas o rechazas | Hecha |

## Taxonomía

| Categoría (`category`) | En la primera interfaz | Tipos (`subcategory`) |
|---|---|---|
| Parte superior (`top`) | Sí | Camiseta (`tee`), Polo (`polo`), Camisa (`shirt`), Jersey (`knit`), Cárdigan (`cardigan`), Sudadera (`sweatshirt`), Sudadera con capucha (`hoodie`), Cuello alto (`turtleneck`), Camiseta sin mangas (`tank`) |
| Prendas exteriores (`outerwear`) | Sí | Blazer / americana (`blazer`), Chaqueta o cazadora (`jacket`), Cazadora vaquera (`denim_jacket`), Cazadora de cuero (`leather_jacket`), Bomber (`bomber`), Sobrecamisa (`overshirt`), Abrigo (`coat`), Gabardina (`trench`), Parka (`parka`), Plumífero (`puffer`), Chaleco acolchado (`gilet`) |
| Parte inferior (`bottom`) | Sí | Vaqueros (`jeans`), Chinos (`chinos`), Pantalón de vestir (`trousers`), Pantalón cargo (`cargo`), Jogger o chándal (`joggers`), Shorts o bermudas (`shorts`) |
| Calzado (`footwear`) | Sí | Zapatillas (`sneakers`), Mocasines (`loafers`), Botas (`boots`), Zapatos de cordones (`derby`), Sandalias (`sandals`) |
| Complementos (`accessories`) | Sí | Cinturón (`belt`), Reloj (`watch`), Gafas (`glasses`), Bufanda (`scarf`), Bolso o mochila (`bag`), Gorra o gorro (`headwear`), Corbata (`tie`), Joyería (`jewelry`), Otro complemento (`other_accessory`) |
| Sastrería y ocasiones (`tailoring`) | Sí | Traje (`suit`), Chaleco (`waistcoat`), Esmoquin (`tuxedo`), Prenda especial (`special`) |
| Ropa deportiva (`sport`) | En «Más categorías» | Camiseta técnica (`sport_top`), Pantalón deportivo (`sport_bottom`), Chaqueta deportiva (`sport_jacket`) |
| Ropa interior (`underwear`) | En «Más categorías» | Ropa interior (`underwear`), Calcetines (`socks`) |
| Descanso y casa (`sleepwear`) | En «Más categorías» | Pijama (`pajamas`), Ropa de casa (`loungewear`) |

## Características técnicas por familia de prenda

Se guardan en `garments.attributes` (jsonb); el corte va en la columna `cut`. Solo se aceptan las de la familia del tipo de prenda.

### Pantalones y parte inferior (`bottom`)

- **Tipos:** Vaqueros, Chinos, Pantalón de vestir, Pantalón cargo, Jogger o chándal, Shorts o bermudas, Pantalón deportivo
- **Corte:** Slim · Tapered · Recto · Wide
- **Tiro** (`rise`): Bajo · Medio · Alto
- **Pernera** (`leg`): Estrecha · Regular · Amplia
- **Bajo** (`hem`): Estrecho · Recto · Amplio
- **Pinzas** (`pleats`): Sí · No
- **Raya o pliegue marcado** (`crease`): Sí · No
- **Cintura** (`waist`): Estructurada · Elástica · Ajustable
- **Largo** (`length`): Corto · Regular · Largo
- **Estructura del tejido** (`structure`): Ligera · Media · Rígida

### Chaquetas, abrigos y sastrería (`jacket`)

- **Tipos:** Blazer / americana, Chaqueta o cazadora, Cazadora vaquera, Cazadora de cuero, Bomber, Abrigo, Gabardina, Parka, Plumífero, Chaleco acolchado, Traje, Esmoquin, Chaqueta deportiva
- **Corte:** Entallado · Regular · Relajado · Oversize
- **Hombro** (`shoulder`): Natural · Construido · Caído · Raglán
- **Estructura** (`structure`): Desestructurada · Media · Estructurada
- **Largo** (`length`): Corto · A la cadera · Medio · Largo
- **Solapa** (`lapel`): De muesca · De pico · Chal · Sin solapa
- **Botones** (`buttons`): Uno · Dos · Tres · Cruzado · Sin botones
- **Cierre** (`closure`): Botones · Cremallera · Broches · Abierto
- **Anchura de manga** (`sleeve_width`): Estrecha · Regular · Amplia
- **Cuello** (`collar`): Solapa · Camisero · Alto · Capucha · Sin cuello

### Camisas y sobrecamisas (`shirt`)

- **Tipos:** Camisa, Sobrecamisa
- **Corte:** Entallado · Regular · Relajado · Oversize
- **Cuello** (`collar`): Italiano · Inglés · Button-down · Mao · Cubano · Cutaway
- **Construcción del hombro** (`shoulder`): Costura en el hombro · Costura caída
- **Manga** (`sleeve`): Corta · Larga
- **Largo** (`length`): Corto · Regular · Largo
- **Puño** (`cuff`): Simple · Doble · De botón · Sin puño
- **Textura** (`texture`): Lisa · Oxford · Popelín · Franela · Lino · Sarga · Pana

### Camisetas, polos, punto y sudaderas (`top`)

- **Tipos:** Camiseta, Polo, Jersey, Cárdigan, Sudadera, Sudadera con capucha, Cuello alto, Camiseta sin mangas, Chaleco, Camiseta técnica
- **Corte:** Ajustado · Regular · Relajado · Oversize
- **Cuello** (`neckline`): Redondo · De pico · Polo · Alto · Capucha · Henley
- **Manga** (`sleeve`): Sin mangas · Corta · Larga
- **Largo** (`length`): Corto · Regular · Largo
- **Grosor** (`weight`): Ligero · Medio · Grueso

### Calzado (`footwear`)

- **Tipos:** Zapatillas, Mocasines, Botas, Zapatos de cordones, Sandalias
- **Puntera** (`toe`): Redonda · Almendrada · Cuadrada
- **Suela** (`sole`): Fina · Media · Gruesa
- **Cierre** (`closure`): Cordones · Sin cordones · Hebilla · Velcro · Cremallera
- **Altura** (`height`): Baja · Media caña · Alta

### Complementos (`accessory`)

- **Tipos:** Cinturón, Reloj, Gafas, Bufanda, Bolso o mochila, Gorra o gorro, Corbata, Joyería, Otro complemento
- **Tamaño** (`size`): Pequeño · Mediano · Grande
- **Metales** (`hardware`): Plateado · Dorado · Negro · Sin metales

### Básicos (`basic`)

- **Tipos:** Prenda especial, Ropa interior, Calcetines, Pijama, Ropa de casa
- **Corte:** Ajustado · Regular · Relajado

## Ficha de la prenda

| Bloque | Campos |
|---|---|
| Identificación | nombre, categoría, tipo, color principal y secundarios, estampado, corte, silueta, estilo (ids del catálogo), formalidad 1–5, temporadas, ocasiones |
| Características técnicas | según la familia (arriba) |
| Materiales | material aparente (estimación) · composición confirmada + origen (etiqueta, ficha comercial, introducida por mí) |
| Comercial y personal | marca, talla de etiqueta, talla que te funciona (son distintas), precio, fecha de compra, tienda, conservación, usos estimados, ubicación, notas, favorita |
| Estado | Borrador (`draft`) · En el armario (`active`) · Archivada (`archived`): los borradores y las archivadas no cuentan en el armario activo ni en el diagnóstico |

Colores admitidos: Negro, Blanco, Gris, Azul marino, Beige, Camel, Marrón, Oliva, Burdeos, Azul claro, Verde bosque, Rojo, Rosa, Lila, Mostaza, Crudo, Denim, Denim claro, Caqui, Antracita, Gris claro, Verde, Amarillo, Naranja, Multicolor. Estampados: Liso, Rayas, Cuadros, Estampado, Gráfico, Textura, Otro. Conservación: Nuevo, Buen estado, Usado, Desgastado, Dañado, Sin indicar.

Una ficha está **completa** cuando tiene tipo de prenda, color principal (salvo complementos) y al menos una foto o un nombre; si no, aparece «por revisar».

## Fotografías

Funciones: Vista frontal · Vista posterior · Detalle del tejido · Etiqueta (composición y talla) · Llevándola puesta · Otra. En el navegador cada foto se reduce a 2048 px y se recodifica en JPEG (lo que elimina metadatos y ubicación), se genera una miniatura WebP de 480 px y se calcula su SHA-256 para detectar fotos repetidas y no analizar dos veces la misma (fase 2B).

```text
wardrobe-originals/<usuario>/<prenda>/<uuid>.jpg
wardrobe-thumbnails/<usuario>/<prenda>/<uuid>.webp
```

## Garment AI (2B)

Prompt `garment-analyst@1`, esquema `garment-analysis@1` (`lib/wardrobe/analysis.ts`). Se envían hasta 4 fotos por orden de función: Vista frontal, Vista posterior, Etiqueta (composición y talla), Detalle del tejido, Otra. Las fotos «llevándola puesta» no se usan para identificar la prenda: son para el Fit Assessment (2C).

**Flujo.** Alta asistida («Guardar y analizar con IA»: basta con las fotos, la prenda queda como borrador) o botón «Analizar con IA» en la ficha → propuesta en la pestaña «Análisis IA» → por cada campo: aceptar, corregir o descartar → «Confirmar revisión» (opcionalmente pasa el borrador al armario).

**Reglas que aplica la aplicación, no solo el prompt:**

- Cada valor se ajusta a la taxonomía; lo que no encaja se descarta y se muestra como «Descartado automáticamente», nunca se fuerza.
- Las características técnicas solo se aceptan si pertenecen a la familia del tipo de prenda; un tipo que no pertenece a la categoría se descarta.
- La composición, la marca y la talla solo se proponen si hay foto de etiqueta y la IA dice haberlas leído en ella; aceptada, la composición queda con origen «etiqueta». El material aparente se presenta siempre como estimación visual.
- Confianza por campo: alta ≥ 85 %, media ≥ 60 %, baja < 60 %. Se preselecciona «Aceptar» solo con confianza media o alta y si no pisa un dato que pusiste tú; con confianza baja, o si el dato es tuyo, por defecto se mantiene lo actual.
- Observaciones (lo que se ve) e inferencias (lo que deduce) se muestran por separado; lo que no puede determinar aparece con la foto que lo resolvería.
- La IA no valora el ajuste real.

**Trazabilidad.** La respuesta validada se guarda tal cual en `garment_analyses.analysis_result` y la propuesta ajustada en `normalized`, con modelo, versiones de prompt y de esquema, fotos usadas, confianza global y consumo. Solo lo aceptado o corregido llega a `garments`: aceptado → `field_sources` con `source: ia`, `confirmed_by: usuario` y `analysis_id`; corregido → `source: usuario`. Las decisiones quedan en `garment_analyses.decisions` y el historial registra «Analizada con IA» y «Propuesta de la IA revisada».

**Estados del análisis:** propuesto → aceptado · aceptado en parte · descartado; un análisis nuevo deja el propuesto anterior como «sustituido» (no se borra).

**Control de costes.** Mismas fotos (SHA-256) + misma versión de prompt y esquema + misma pista del usuario = mismo análisis: se reutiliza sin llamar a la IA (consta en `ai_runs` como reutilizado). Corregir la ficha a mano nunca lanza un análisis. «Repetir análisis» fuerza una llamada nueva. El consumo (llamadas, tokens, tiempo) se guarda por análisis y en `ai_runs`, y se resume en «Estado técnico» (coste 0 con proveedores gratuitos; con `AI_PRICE_IN`/`AI_PRICE_OUT` en € por millón de tokens se estima).

### Prompt del sistema

```text
Eres Garment Analyst, el especialista en identificacion, clasificacion y analisis tecnico de prendas masculinas de la aplicacion Personal Stylist.
Tu funcion es analizar fotografias de prendas y extraer caracteristicas visuales de forma estructurada.

REGLAS FUNDAMENTALES:
1. Identifica exclusivamente caracteristicas que puedan observarse razonablemente en las fotografias.
2. No inventes marcas, precios, composicion, tallas ni informacion comercial que no sea visible o aportada por el usuario.
3. Diferencia el material aparente (lo que parece) de la composicion textil confirmada (solo la que se LEE en una etiqueta: source "label").
4. Distingue el corte disenado de la prenda de como queda sobre el cuerpo del usuario.
5. No evalues el ajuste real: no tienes fotografias de la persona llevandola. No hables de como le queda.
6. Si no puedes identificar una caracteristica, devuelve value null y explica en "unknown" que fotografia permitiria resolverlo.
7. Utiliza la taxonomia masculina proporcionada: SOLO los valores de las listas, escritos exactamente igual.
8. El color puede verse afectado por la iluminacion: elige el nombre mas cercano de la lista; no des valores RGB.
9. No inventes propiedades de calidad o durabilidad que no puedan verificarse.
10. Devuelve UNICAMENTE el JSON con el esquema indicado.
11. Manten separados: "observations" (lo que se ve), "inferences" (lo que deduces) y lo que haya indicado el usuario.
12. Explica con lenguaje profesional, concreto y comprensible, en espanol.
"confidence" es tu seguridad entre 0 y 1 para cada campo; con poca informacion usa valores bajos o null.
```

## Evaluación personal (2C)

Tres valoraciones **separadas** (0–10). Una prenda puede encajar contigo y combinar mal con tu armario. **Lo que no se puede calcular aparece como «Pendiente», nunca como cero.** Compatibilidad y valor estratégico se calculan con reglas (`lib/wardrobe/compatibility.ts`) cada vez que se consultan: si cambias tu perfil o tu armario, cambian. No se guardan como verdad; solo se guarda una instantánea junto a cada decisión.

### 1. Compatibilidad personal

| Criterio | Peso | Datos del perfil que usa |
|---|---|---|
| Compatibilidad con tu estilo | 25 % | Identidad estética (influencias y pesos, declarada o propuesta), rasgos que te gustan o rechazas, estilos que has descartado; la prenda se traduce a rasgos del catálogo (tipo, corte, silueta, estampado) y a los estilos que le hayas puesto |
| Compatibilidad cromática | 25 % | Temperatura cromática (validada > declarada > estimada por IA > pistas), colores que te gustan y que evitas; cerca de la cara pesa más |
| Adecuación del corte a tus preferencias y proporciones | 25 % | Corte preferido por tipo de prenda, ajuste general preferido, «algo que nunca te pondrías» y proporciones de tus medidas (orientaciones, no prohibiciones) |
| Encaje con tus necesidades | 15 % | Reparto de tu semana frente a las ocasiones de la prenda (o las deducidas de su formalidad, marcadas como tales), formalidad del trabajo, clima y restricciones prácticas |
| Calidad de la información disponible | 10 % | Datos clave confirmados (los propuestos por la IA y no aceptados no cuentan), fotos y composición confirmada |

Cada criterio muestra su porqué, los datos usados, lo que falta y la confianza (los datos de la IA sin confirmar cuentan como hipótesis). Si falta más de la mitad del peso personal, la compatibilidad queda **pendiente**; si falta algo, es **provisional** e indica el porcentaje calculado. **Nunca incluye el ajuste real.**

### 2. Ajuste real (Fit Assessment)

Solo con fotos tuyas llevándola puesta (función «Llevándola puesta», hasta 3) o con tu autoevaluación. La IA (prompt `fit-assessor@1`) **propone**; la propuesta no cuenta hasta que la confirmas o corriges. Lo que no se ve queda «no observable» y la evaluación, **provisional**. Se tiene en cuenta la clase de prenda: corte diseñado, silueta amplia, estructura (una americana desestructurada no se evalúa como una formal), hombro caído, pinzas. Las dimensiones que solo puedes juzgar tú (talla del calzado, comodidad) nunca las puntúa la IA; hombros y talla nunca son «arreglables». La nota es la media de las dimensiones observadas de la última evaluación confirmada.

| Prenda | Dimensiones |
|---|---|
| Chaquetas, abrigos y sastrería | Ajuste de hombros · Largo de mangas · Holgura del torso · Largo general · Caída del tejido · Proporciones del conjunto |
| Camisas | Ajuste de hombros · Largo de mangas · Holgura del torso · Largo general · Caída del tejido · Proporciones del conjunto |
| Camisetas, polos y punto | Ajuste de hombros · Largo de mangas · Holgura del torso · Largo general · Caída del tejido · Proporciones del conjunto |
| Pantalones | Ajuste de cintura · Tiro y cadera · Holgura de la pernera · Largo del pantalón · Acumulación en el bajo · Caída del tejido · Proporciones del conjunto |
| Calzado | Talla (largo y ancho) (solo tú) · Comodidad (solo tú) · Proporción con el pantalón |
| Complementos | Proporción con tu figura · Comodidad (solo tú) |
| Básicos | Comodidad (solo tú) · Ajuste |

### 3. Valor estratégico (preliminar)

Se calcula con al menos 5 prendas activas: con cuántas combina (grupos complementarios, formalidad a ±1, colores que no chocan según tu paleta) 35 %, ocasiones que cubre 20 %, temporadas 15 %, si duplica otra prenda (mismo tipo, color y corte) 15 % y si cubre una actividad importante de tu semana que ninguna otra prenda de su grupo cubre 15 %. Se recalculará con la auditoría (2D) y el registro de uso.

### Decisión

| Decisión | Significado |
|---|---|
| Conservar (`keep`) | Cumple su función y encaja con tu armario. |
| Modificar (`modify`) | Un arreglo puede mejorarla. |
| Revisar (`review`) | Falta información o una valoración personal. |
| Sustituir (`replace`) | Hay razones para buscar una alternativa. |
| Donar / vender (`donate_sell`) | No tiene utilidad suficiente para mantenerla. |

El sistema **propone** (con su porqué) y tú **decides**: arreglo posible en el ajuste → modificar; sin datos → revisar; ajuste < 5 → sustituir; compatibilidad < 5 y poco valor → sustituir o donar/vender; buena compatibilidad sin prueba de ajuste → revisar; buena compatibilidad y buen ajuste → conservar. Ninguna decisión archiva ni elimina la prenda. Cada decisión guarda la propuesta, si la seguiste y las puntuaciones del momento; el historial de la ficha registra pruebas de ajuste y decisiones.

**Veredicto del estilista**: un resumen en lenguaje natural, generado por reglas a partir de las tres valoraciones (sin coste de IA). El chat recibe la compatibilidad y la decisión de cada prenda.

### Prompt del Fit Assessor

```text
Eres Fit Assessor, el especialista en ajuste de prendas masculinas de la aplicacion Personal Stylist.
Evaluas COMO LE QUEDA una prenda concreta a la persona, a partir de fotografias en las que la lleva puesta.

REGLAS:
1. Evalua solo la prenda indicada y solo lo que se observa en las fotos. No opines sobre el cuerpo de la persona ni sobre su peso.
2. Puntua cada dimension de 1 a 10 (10 = ajuste ideal para el corte disenado de esa prenda). Si una dimension no se ve con claridad (encuadre, postura, otra prenda encima, luz), devuelve score null y explica por que en "observation".
3. Ten en cuenta la clase de prenda y su corte disenado: una prenda amplia u oversize no tiene «tela sobrante» por serlo; una americana desestructurada no se evalua como una formal.
4. Los pliegues y arrugas no siempre distinguen entre mala talla, postura y comportamiento del tejido: si dudas, baja la confianza y dilo en "limitations".
5. "fixable": true solo si un arreglo de sastreria habitual lo resuelve (bajo, largo de manga, meter cintura o costados). Hombros y talla general no son arreglables.
6. Lenguaje profesional, concreto y respetuoso, en espanol. Devuelve UNICAMENTE el JSON.
```

## Auditoría del armario (2D)

Del artículo al conjunto (`lib/wardrobe/audit.ts`), bajo demanda y con al menos 5 prendas activas. Reglas deterministas sobre el inventario real, el perfil y las evaluaciones de 2C, sin coste de IA. **Ninguna auditoría elimina, archiva ni decide nada**: cada hallazgo trae su porqué y los datos usados, y tú lo apruebas o lo rechazas. Aprobar una recomendación que propone una decisión la registra como tuya (motivo «Auditoría vN»); aprobar una necesidad la añade a tus necesidades (base de las compras de la fase 4). Cada hallazgo tiene una clave estable: en la siguiente auditoría se recuerda lo que aprobaste o rechazaste y no vuelve a aparecer como nuevo.

| Sección | Qué detecta |
|---|---|
| Clasificación por estado | Prendas por decisión (conservar, modificar, revisar, sustituir, donar/vender, sin decidir) y archivadas; compatibilidad media y prendas con prueba de ajuste |
| Duplicados potenciales | Similitud 0–100 con categoría (obligatoria), tipo, color, corte, material, formalidad, función (ocasiones) y combinaciones; grupo a partir de 70. Explica en qué coinciden y en qué se diferencian, y recomienda conservar la de **más utilidad real** (compatibilidad, ajuste, combinaciones, favorita, conservación), solo si la diferencia es clara; si no, decides tú |
| Arreglos | Prendas marcadas para modificar o con una dimensión de ajuste arreglable |
| Sustituir o donar | Decididas o propuestas por la evaluación personal |
| Diagnóstico por categoría | Parte superior, inferior, calzado y prendas exteriores: bien cubierta, necesita revisión, falta variedad o sin prendas (sin contar las marcadas para sustituir o donar) |
| Ocasiones | Para cada actividad con al menos un 10 % de tu semana: ¿tienes parte superior, inferior y calzado para ella (con la formalidad de tu trabajo)? |
| Necesidades prioritarias | Hasta 6, concretas: tipo + color de tu paleta que aún no tienes + tu corte preferido u ocasión (p. ej. «Calzado versátil para smart casual»), ordenadas por el peso de la ocasión en tu semana; temporadas según tu clima |
| Conservación | Prendas desgastadas o dañadas |
| Por revisar | Borradores, fichas incompletas, propuestas de la IA sin revisar, prendas marcadas para revisar o sin datos para valorarlas |
| Temporadas y organización | Prendas por temporada, sin temporada y por ubicación. La frecuencia de uso queda pendiente: saldrá del registro de outfits y del diario de uso, no de las fotos |

## Datos (migraciones `0007_wardrobe_base.sql` a `0010_wardrobe_audit.sql`)

| Tabla | Responsabilidad | Subfase |
|---|---|---|
| `garments` | Registro principal (evoluciona la tabla mínima de la fase 1: CHECK, índices por usuario/categoría/estado, `updated_at` con disparador, `field_sources`) | 2A |
| `garment_images` | Fotos, función, dimensiones y hash | 2A |
| `garment_events` | Incorporaciones, cambios campo a campo, estados, fotos | 2A |
| `garment_analyses` | Resultados de IA versionados (modelo, versión de prompt y de esquema, estado) | 2B |
| `garment_fit_reviews` | Evaluaciones de ajuste: propuesta de la IA (con modelo, versión de prompt, fotos y consumo) o autoevaluación; dimensiones con puntuación, nota y si es arreglable; provisional; estado propuesta → vigente → anterior | 2C |
| `garment_decisions` | Decisiones del usuario con la propuesta del sistema y la instantánea de puntuaciones de ese momento; la vigente se copia en `garments.decision` | 2C |
| `wardrobe_audits` | Informes versionados: estados, cobertura por categoría y ocasión, temporadas, organización y comparación con la versión anterior | 2D |
| `wardrobe_audit_findings` | Hallazgos con clave estable, porqué, datos usados, prendas, recomendación y estado (propuesto, aprobado, rechazado; heredado de una auditoría anterior) | 2D |

Los atributos técnicos viven en `garments.attributes` (jsonb validado contra la taxonomía) en lugar de una tabla `garment_attributes`: cada prenda solo tiene los de su familia y su origen queda en `field_sources`.

## API REST

| Ruta | Función |
|---|---|
| `GET /api/wardrobe/items?q=&category=&status=&favorite=1&sort=` | Listar, buscar, filtrar y ordenar |
| `POST /api/wardrobe/items` | Crear ficha (`status`: draft o active) |
| `GET /api/wardrobe/items/:id` | Ficha con fotos (URLs firmadas) e historial |
| `PATCH /api/wardrobe/items/:id` | Editar cualquier campo |
| `DELETE /api/wardrobe/items/:id` | Archivar (por defecto) o eliminar con `?mode=permanent` |
| `POST /api/wardrobe/items/:id/images` | Asociar una foto ya subida (ruta dentro de la carpeta del usuario y la prenda) |
| `POST /api/wardrobe/items/:id/analyze[?force=1]` | Propuesta de la IA (no toca la ficha). Sin `force` reutiliza el análisis de las mismas fotos |
| `POST /api/wardrobe/items/:id/confirm` | `{analysis_id, decisions: {campo: {action: accept\|correct\|reject, value?}}, activate?}`: escribe solo lo aceptado o corregido |

| `GET /api/wardrobe/items/:id/evaluation` | Compatibilidad, ajuste real y valor estratégico con sus criterios, propuesta de decisión, veredicto e historiales |
| `POST /api/wardrobe/items/:id/fit-review` | `{mode: "ai"}` pide la propuesta de la IA; `{dimensions: [{key, score 1-10\|null, note, fixable}], proposal_id?, notes?}` registra o confirma la evaluación |
| `POST /api/wardrobe/items/:id/decision` | `{decision: keep\|modify\|review\|replace\|donate_sell, reason?, alteration?}` (nunca archiva ni borra) |

| `GET /api/wardrobe/audit[?version=N]` | Última auditoría (o una versión) con sus hallazgos |
| `POST /api/wardrobe/audit` | Generar una auditoría nueva (bajo demanda, por reglas, sin coste de IA) |
| `POST /api/wardrobe/audit/findings/:id` | `{action: accept\|reject}`: aprobar una decisión propuesta la registra como tuya |

## Criterios de aceptación de la fase 2

| Criterio | Cómo se cumple |
|---|---|
| Puedo añadir una prenda manualmente | Añadir prenda → ficha guiada por la taxonomía (2A) |
| Puedo fotografiar una prenda desde el móvil | Cámara (`capture`) o galería; reducción y miniatura en el navegador (2A) |
| Puedo asociar varias fotografías a un mismo artículo | Varias vistas con su función (frontal, posterior, detalle, etiqueta, puesta) (2A) |
| Las imágenes están protegidas y almacenadas correctamente | Buckets privados por usuario, URLs firmadas, sin metadatos; hash para duplicados (2A) |
| La IA reconoce la categoría y los atributos básicos | Garment Analyst con confianza por campo y revisión (2B) |
| La IA distingue entre material aparente y composición confirmada | Composición solo con foto de etiqueta leída; material aparente siempre como estimación (2B) |
| Puedo editar y validar todos los campos de una ficha | Características y revisión de la propuesta; origen de cada dato en `field_sources` (2A, 2B) |
| Cada análisis queda registrado y versionado | `garment_analyses` y `garment_fit_reviews` con modelo, prompt, esquema y consumo (2B, 2C) |
| Puedo buscar, ordenar y filtrar mi armario | Búsqueda, categoría, estado, decisión, favoritas; orden por fecha, nombre, precio o compatibilidad (2A, 2C) |
| Puedo consultar la compatibilidad de mis prendas con mi perfil | Pestaña Compatibilidad y tarjetas del panel (2C) |
| Puedo registrar cómo me queda una prenda mediante Fit Assessment | IA con fotos puestas o autoevaluación (2C) |
| Puedo clasificar prendas para conservar, modificar o sustituir | Decisión con propuesta justificada (2C) y desde la auditoría (2D) |
| Puedo generar una primera auditoría del armario | Auditoría del armario, versionada (2D) |
| Puedo detectar prendas potencialmente duplicadas y huecos | Similitud con siete factores y huecos por categoría, ocasión y temporada (2D) |

La interfaz usa los mismos servicios que la API. La interfaz usa el mismo servicio (`lib/wardrobe/service.ts`) mediante acciones del servidor.
