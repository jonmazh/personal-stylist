# Outfit Studio (Fase 3)

> Documento generado desde `lib/outfits/taxonomy.ts` con `npm run docs`. No lo edites a mano.

## Estado de la fase

| Subfase | Contenido | Estado |
|---|---|---|
| 3A · Fundamentos | Tablas `outfits` y `outfit_items`, conjuntos manuales con prendas reales, roles, sustitución, filtros, estados, ficha | Hecha |
| 3B · Motor de combinaciones | Plantillas, generación de candidatos, reglas, scoring de 100 puntos, variedad | Pendiente |
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
- **Blazer:** tercera pieza, pieza completa, parte inferior, capa intermedia
- **Abrigo:** abrigo, tercera pieza
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

Las tablas de las subfases siguientes (`outfit_generations`, `outfit_generation_results`, `outfit_contexts`, `outfit_feedback`, `outfit_wear_events`, `style_formulas`, `style_formula_slots`, `outfit_evaluations`) se crearán cuando se implementen.

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

## Criterios de aceptación de la fase 3

| Criterio | Estado |
|---|---|
| Puedo crear y guardar outfits manualmente | Hecho (3A) |
| Cada outfit está vinculado a prendas reales de mi armario | Hecho (3A): aplicación + RLS |
| Puedo sustituir prendas sin perder el contexto del outfit | Hecho en el constructor y la API (3A); la sustitución conversacional llega en 3C |
| El motor genera outfits sin inventar prendas · respeta restricciones · consulta el Style Blueprint · puntuaciones explicables · variedad | Pendiente (3B) |
| Outfits para distintas ocasiones · conversar con el estilista sobre una propuesta | Pendiente (3C) |
| Evaluar outfits (selección y foto) · valorar y explicar rechazos · fórmulas · registro de uso · aprendizaje | Pendiente (3D) |