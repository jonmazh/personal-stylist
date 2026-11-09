# Outfit Studio (Fase 3)

> Documento generado desde `lib/outfits/taxonomy.ts` con `npm run docs`. No lo edites a mano.

## Estado de la fase

| Subfase | Contenido | Estado |
|---|---|---|
| 3A · Fundamentos | Tablas `outfits` y `outfit_items`, conjuntos manuales con prendas reales, roles, sustitución, filtros, estados, ficha | Hecha |
| 3B · Motor de combinaciones | Plantillas, generación de candidatos con poda, filtros obligatorios, scoring de 100 puntos explicable, variedad por intenciones, historial auditable | Hecha |
| 3C · IA estilista y ocasiones | Outfit Stylist AI, peticiones en lenguaje natural, conversación sobre una propuesta, validación de IDs | Pendiente |
| 3D · Evaluación y aprendizaje | Evaluación teórica y visual, feedback, fórmulas, registro de uso | Pendiente |

## Punto de partida (análisis del proyecto antes de la 3A)

- **Perfil (fase 1):** tablas `profiles`, `body_measurements`, `color_profiles`, `style_preferences`, `lifestyle_profiles`, `fit_preferences`, `style_goals`, `blueprints`; se leen juntas con `loadBundle` (`lib/profile/data.ts`). El Style Blueprint no se toca en esta fase.
- **Armario (fase 2):** `garments` (con `wardrobe_status`, `decision` y `field_sources`), `garment_images` (fotos en los buckets privados `wardrobe-originals` y `wardrobe-thumbnails`, servidas con URLs firmadas), `garment_events`, `garment_analyses`, `garment_fit_reviews`, `garment_decisions`, auditorías. Servicio en `lib/wardrobe/service.ts`; errores legibles con `WardrobeError` y `handle` (`lib/wardrobe/http.ts`).
- **Convenciones:** migraciones idempotentes numeradas, RLS «own rows» por `user_id = auth.uid()`, disparador `touch_updated_at`, listas cerradas como datos en TypeScript verificadas contra los CHECK por pruebas, documentación generada, acciones del servidor para la interfaz y rutas REST con el mismo servicio.
- **Ya existía y se reutiliza:** el bucket privado `outfits-private` (creado en 0001, sin uso) queda reservado para las fotos del conjunto puesto (evaluación visual, 3D). Las fotos de las prendas no se copian: los conjuntos firman las de `garment_images`.

## Decisiones de arquitectura

- **Un conjunto enlaza prendas reales** (`outfit_items.garment_id → garments`). Nunca se inventan: la aplicación comprueba que cada prenda existe en tu armario y, al añadirla, que está activa; la RLS de `outfit_items` exige además que el conjunto y la prenda sean del usuario.
- **Instantánea por prenda** (`attribute_snapshot`): name, category, subcategory, primary_color, secondary_colors, cut, silhouette, pattern, formality_level, seasons, occasions, style_tags, apparent_material, confirmed_composition, brand, wardrobe_status, decision, más el título y la fecha. Si cambias la ficha, el conjunto sigue explicándose; si eliminas la prenda del armario, `garment_id` pasa a null y el conjunto se conserva con su instantánea. Al sustituir una prenda se guarda a cuál sustituye.
- **Roles flexibles, no una plantilla fija:** cada prenda tiene una función; las capas y los complementos son opcionales y algunas funciones admiten varias prendas (capas intermedias, complementos).
- **Reglas estructurales, no puntuación:** errores que impiden guardar (función imposible para esa prenda, más prendas de las que admite una función, prenda repetida, traje junto a parte inferior, prenda que no existe) y avisos que no lo impiden (falta calzado o parte inferior, prenda archivada, borrador o marcada para sustituir o donar). El scoring llega en 3B.
- **Sin columnas de puntuación todavía:** `compatibility_score` y `confidence_level` se añadirán con el motor (3B) para no guardar datos que nadie calcula.
- **Separación con Personal Shopper:** Outfit Studio solo usa tu ropa; las necesidades de compra salen de la auditoría del armario (2D) y las resolverá el Personal Shopper.

## Funciones de cada prenda

| Función (`item_role`) | Para qué | Máximo |
|---|---|---|
| Base superior (`top_base`) | Camiseta, camisa, polo, jersey… | 1 |
| Capa intermedia (`mid_layer`) | Jersey o chaleco sobre la base | 2 |
| Tercera pieza (`third_layer`) | Chaqueta, blazer, sobrecamisa… | 1 |
| Abrigo (`outer_layer`) | Abrigo, gabardina, parka… | 1 |
| Parte inferior (`bottom`) | Pantalón, vaquero, chino… | 1 |
| Pieza completa (`full_body`) | Traje o conjunto de dos piezas que ocupa arriba y abajo | 1 |
| Calzado (`footwear`) | Zapatillas, mocasines, botas… | 1 |
| Complemento (`accessory`) | Cinturón, reloj, gafas, bufanda, bolso… | 6 |
| Otro (`other`) | Cualquier otra prenda | 4 |

Qué funciones puede ocupar cada tipo de prenda (ejemplos; la primera es la que se propone por defecto):

- **Camisa:** base superior, tercera pieza, capa intermedia
- **Jersey:** base superior, capa intermedia, tercera pieza
- **Pantalón:** parte inferior
- **Blazer:** tercera pieza
- **Abrigo:** abrigo
- **Traje:** pieza completa, tercera pieza
- **Mocasines:** calzado
- **Cinturón:** complemento

Un conjunto admite hasta 12 prendas y 8 etiquetas.

## Datos del conjunto

- **Ocasión:** Día a día (`dia_a_dia`), Jornada de oficina (`oficina`), Reunión de trabajo (`reunion_trabajo`), Entrevista (`entrevista`), Cita (`cita`), Primera cita (`primera_cita`), Cena con amigos (`cena_amigos`), Comida familiar (`comida_familiar`), Boda (`boda`), Evento formal (`evento_formal`), Fiesta (`fiesta`), Evento nocturno (`evento_nocturno`), Escapada de fin de semana (`escapada`), Viaje (`viaje`), Día de turismo (`turismo`), Deporte (`deporte`).
- **Formalidad** 1–5, **temporadas**, **etiquetas** libres, **notas**, **favorito**.
- **Estado:** Borrador (`draft`) · Guardado (`saved`) · Archivado (`archived`). Archivar es reversible; eliminar exige confirmación y nunca toca las prendas.
- **Origen** (`source`): manual, generator, stylist, evaluation (hoy solo manual).

## Datos (migración `0011_outfits.sql`)

| Tabla | Responsabilidad |
|---|---|
| `outfits` | Conjunto: nombre, notas, ocasión, formalidad, temporadas, etiquetas, estado, favorito, origen, fechas (`updated_at` con disparador). Índices por usuario + estado y usuario + ocasión |
| `outfit_items` | Prenda del conjunto: `garment_id` (null si se eliminó del armario), función, orden, instantánea. Única por conjunto y prenda. RLS: solo conjuntos y prendas propios |

| `outfit_generations` (0012) | Petición estructurada, contexto resuelto, pesos, versión del motor, estadísticas (prendas excluidas y por qué, combinaciones evaluadas y descartadas) |
| `outfit_generation_results` (0012) | Cada propuesta: intención, prendas con instantánea, puntuación, confianza, desglose por criterio, por qué funciona, matices, avisos, alternativas, estado (propuesta, guardada, descartada) |

`outfits` gana `compatibility_score`, `confidence_level` y `generation_result_id` (0012) para los conjuntos guardados desde el motor.

Las tablas de las subfases siguientes (`outfit_contexts`, `outfit_feedback`, `outfit_wear_events`, `style_formulas`, `style_formula_slots`, `outfit_evaluations`) se crearán cuando se implementen.

## Motor de combinaciones (3B)

Versión `outfit-engine@1` (`lib/outfits/engine`). **Genera y valida sin IA**; la IA (3C) recibirá solo el conjunto reducido resultante para dirigirlo creativamente. Así se podrá cambiar de modelo sin reescribir el motor.

1. **Contexto:** ocasión, código de vestimenta, momento, entorno, clima, formalidad deseada, comodidad, intención estética y restricciones. La formalidad objetivo sale de la formalidad deseada, el código de vestimenta y la ocasión (en ese orden de prioridad); la temporada, del clima o de la fecha.
   - Códigos de vestimenta: Casual (1–3/5), Smart casual (3–4/5), Business / oficina formal (4–5/5), Formal (4–5/5).
   - Restricciones: sin traje, sin zapatos formales, sin chaqueta ni americana, sin abrigo, sin zapatillas; también excluir categorías o prendas, y exigir o preferir prendas concretas.
2. **Perfil:** identidad estética (influencias y rasgos que te gustan o rechazas), temperatura, colores preferidos y evitados, contraste, ajuste preferido, proporciones, y la compatibilidad, el ajuste real y el valor estratégico de cada prenda (fase 2C).
3. **Armario — filtros obligatorios** (una puntuación alta no los compensa): solo prendas activas; nunca las marcadas para sustituir o donar; respeta exclusiones y restricciones; nada por debajo del código de vestimenta; con calor, nada de abrigo ni punto.
4. **Candidatos:** plantillas de anatomía flexible (base + parte inferior + calzado; con tercera pieza; con capa intermedia; con abrigo; tercera pieza y abrigo; capa intermedia y abrigo; traje; traje con abrigo). Con frío o lluvia, siempre con abrigo si tienes alguno. Poda: las 6 mejores prendas por función, como máximo 20.000 combinaciones.
5. **Puntuación (100 puntos, pesos configurables):**

| Criterio | Peso | Qué mira |
|---|---|---|
| Adecuación a la ocasión | 20 | Formalidad de cada prenda frente al objetivo, mezcla de formalidades, prendas que usas para esa actividad, traje o americana si el código es formal |
| Armonía cromática | 20 | Base neutra y número de acentos, estampados juntos, colores que evitas, color cerca de la cara frente a tu temperatura, contraste natural |
| Equilibrio de siluetas y proporciones | 20 | Equilibrio de volúmenes arriba/abajo (o tu gusto por el volumen), proporciones de tus medidas, ajuste preferido |
| Coherencia estética | 15 | Encaje con tu identidad híbrida y penalizaciones de criterio experto (deportivo con sastrería, zapato de vestir con pantalón informal…) |
| Ajuste y preferencias personales | 15 | Ajuste real confirmado y compatibilidad de cada prenda, arreglos pendientes, favoritas, prendas que pediste |
| Versatilidad y utilidad | 10 | Valor estratégico de las prendas, neutralidad, comodidad si la priorizas |

   Cada criterio guarda sus razones, sus matices (lo que resta) y los datos usados. La confianza (alta, media, baja) depende de lo completas que estén las fichas y el perfil, de las pruebas de ajuste y de los datos de la IA sin confirmar. La puntuación ordena alternativas y explica el criterio; no es una medida científica.
6. **Criterio experto:** se descartan combinaciones con coherencia estética o adecuación muy bajas, una camisa abierta como tercera pieza que no va sobre una camiseta, o una capa intermedia que no va sobre una camisa, camiseta o polo.
7. **Selección variada:** una propuesta por intención (más elegante, más minimalista, más relajada, con más personalidad, especialmente versátil), con la que pidas primero. Se descartan las que comparten más de la mitad de las prendas con otra ya elegida, y se penaliza repetir una prenda más de 2 veces si hay alternativas. Validación final: solo identificadores del inventario elegible y composición sin errores.

Cada propuesta incluye: composición con la función de cada prenda, «por qué funciona», matices, avisos (temporada, arreglos) y hasta dos **alternativas** (cambiar una prenda por otra con una puntuación parecida).

## API REST

| Ruta | Función |
|---|---|
| `GET /api/outfits?status=&occasion=&formality=&season=&tag=&favorite=1&q=` | Listar y filtrar (`status`: active = borradores y guardados, draft, saved, archived, all) |
| `POST /api/outfits` | Crear: datos + `items: [{garment_id, role}]` |
| `GET /api/outfits/:id` | Conjunto con prendas, fotos firmadas, instantáneas y avisos |
| `PATCH /api/outfits/:id` | Editar datos, `status` y/o la lista completa de `items` (`[{id?, garment_id, role}]`) |
| `DELETE /api/outfits/:id` | Archivar; con `?mode=permanent`, eliminar |
| `POST /api/outfits/:id/items` | Añadir una prenda (`{garment_id, role?}`) |
| `POST /api/outfits/:id/replace-item` | Sustituir la prenda de una posición conservando su función (`{item_id, garment_id}`) |
| `POST /api/outfits/generate` | Generar propuestas con criterios estructurados (ver arriba); `weights` opcional |
| `GET /api/outfits/generations` · `GET /api/outfits/generations/:id` | Historial de peticiones y propuestas con su desglose |
| `POST /api/outfits/generations/results/:id` | `{action: save\|dismiss, name?}`: guardar la propuesta como conjunto o descartarla |

## Criterios de aceptación de la fase 3

| Criterio | Estado |
|---|---|
| Puedo crear y guardar outfits manualmente | Hecho (3A) |
| Cada outfit está vinculado a prendas reales de mi armario | Hecho (3A): aplicación + RLS |
| Puedo sustituir prendas sin perder el contexto del outfit | Hecho en el constructor y la API (3A); la sustitución conversacional llega en 3C |
| El motor genera outfits sin inventar prendas | Hecho (3B): solo inventario elegible + validación de salida |
| Las combinaciones respetan las restricciones del usuario | Hecho (3B): filtros obligatorios no compensables |
| El motor consulta mi Style Blueprint | Hecho (3B): identidad estética, temperatura, colores, contraste, cortes, proporciones, compatibilidad y ajuste |
| Las puntuaciones son explicables y se pueden auditar | Hecho (3B): desglose por criterio guardado con pesos y versión del motor |
| Las propuestas son variadas y no repiten sistemáticamente las mismas prendas | Hecho (3B) |
| Puedo solicitar outfits para distintas ocasiones | Hecho con petición estructurada (3B); en lenguaje natural, 3C |
| Puedo conversar con el estilista sobre una propuesta | Pendiente (3C) |
| Evaluar outfits (selección y foto) · valorar y explicar rechazos · fórmulas · registro de uso · aprendizaje | Pendiente (3D) |