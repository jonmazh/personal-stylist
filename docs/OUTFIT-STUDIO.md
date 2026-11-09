# Outfit Studio (Fase 3)

> Documento generado desde `lib/outfits/taxonomy.ts` con `npm run docs`. No lo edites a mano.

## Estado de la fase

| Subfase | Contenido | Estado |
|---|---|---|
| 3A · Fundamentos | Tablas `outfits` y `outfit_items`, conjuntos manuales con prendas reales, roles, sustitución, filtros, estados, ficha | Hecha |
| 3B · Motor de combinaciones | Plantillas, generación de candidatos con poda, filtros obligatorios, scoring de 100 puntos explicable, variedad por intenciones, historial auditable | Hecha |
| 3C · IA estilista y ocasiones | Peticiones en lenguaje natural, Outfit Stylist AI que elige y explica entre candidatas del motor, conversación con cambios validados y repuntuados, sesiones | Hecha |
| 3D · Evaluación y aprendizaje | Outfit Evaluator (teórico y con foto), valoraciones con motivos, registro de uso, fórmulas de estilo, aprendizaje por patrones confirmables | Hecha |

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

| `stylist_sessions` (0013) | Conversación: petición vigente, interpretación de la IA (supuestos, descartes, versión), generación y versión vigente de cada propuesta (P1, P2…) |
| `stylist_messages` (0013) | Mensajes con su acción y los ids de las propuestas mostradas o modificadas, errores de validación |

`outfit_generation_results` gana `origin` (motor o cambio en la conversación), `parent_result_id` (versión anterior) y `stylist` (nombre y explicación de la IA, modelo y versión del prompt) (0013).

| `outfit_feedback` (0014) | Valoración de un conjunto o una propuesta: me encanta / me gusta / no me convence, experiencia (puesto, cómodo, bien vestido, repetiría), motivos, prenda que no gusta, nota y prendas del momento |
| `outfit_wear_events` (0014) | Uso real: fecha, ocasión, prendas, comodidad, confianza, nota |
| `outfit_evaluations` (0014) | Evaluaciones teóricas (puntuación y desglose del motor, crítica de la IA) y visuales (análisis de la foto; la ruta de la foto solo si la conservas) |
| `style_formulas`, `style_formula_slots` (0014) | Fórmulas: nombre, origen, estado, conjunto de origen, firma; huecos por función con tipos, colores, cortes y formalidad admitidos |
| `style_learning` (0014) | Patrones que confirmaste o descartaste (los detectados se calculan en cada consulta) |

`outfits` gana `formula_id` (0014).

No se ha creado `outfit_contexts`: el contexto vive en la petición de cada generación o conversación y en la ocasión, formalidad y temporadas del conjunto, sin duplicarlo.

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

## Evaluación y aprendizaje (3D)

### Outfit Evaluator

- **Modo A · teórico:** eliges prendas (o un conjunto guardado) y el contexto. El motor puntúa con los 6 criterios. La IA, con el prompt de Outfit Stylist, opina (veredicto, a favor, riesgos) y sugiere cambios; las sugerencias que citan prendas inexistentes o funciones imposibles se descartan y se dice.
- **Modo B · visual:** una foto tuya con el conjunto puesto. Se reduce y se le quitan los metadatos en el navegador, se sube al bucket privado `outfits-private` y, salvo que pidas conservarla, se borra tras el análisis. Aspectos: cómo se integran las prendas, proporciones reales, largo de las prendas, caída, superposición de capas, armonía general, y si corresponde al conjunto previsto. Lo que no se ve queda «no observable», sin puntuación, y se lista en «lo que la foto no permite verificar».

### Valoraciones y uso real

- **Valoración:** me encanta / me gusta / no me convence.
- **Experiencia:** me lo he puesto, me sentí cómodo, me sentí bien vestido, lo repetiría.
- **Motivos** (solo si no convence): el corte no es el que busco; los colores no me gustan juntos; es demasiado formal; es demasiado informal; no me representa; no me siento cómodo; no me gusta una de las prendas; prefiero otra alternativa.
- Se valoran conjuntos guardados y propuestas del motor o del estilista. «Me lo he puesto» registra el uso (y, si es una propuesta, la guarda como conjunto).
- El **registro de uso** es la fuente de la frecuencia de uso de cada prenda: la ficha de la prenda muestra cuántas veces te la has puesto, nunca deducido de una foto.

### Aprendizaje

Una valoración suelta no cambia nada. Un patrón observado en al menos 2 valoraciones se te **propone**; desde 3 el motor lo tiene en cuenta de forma **suave** aunque no lo hayas confirmado. Si lo **confirmas**, se aplica del todo; si lo **descartas**, nunca. Puedes deshacerlo. **Tu Style Blueprint no se modifica.**

| Patrón | Efecto en el motor |
|---|---|
| Una prenda que señalas como la que no te gusta | Penalización suave; confirmado, el motor y el estilista dejan de proponerla |
| Una prenda presente en conjuntos que te gustan, repetirías o te pones | Bonificación (sin repetirla siempre: la variedad sigue mandando) |
| «Demasiado formal» o «demasiado informal» para una ocasión | La formalidad objetivo de esa ocasión baja o sube un punto |
| Una pareja de colores que no te convence | Penalización en armonía cromática, con el motivo visible |

Métricas: cuántos conjuntos te gustan, cuántos te pones, cuántos repetirías y cuántas propuestas del estilista te has puesto.

### Fórmulas de estilo

- Una fórmula es una **estructura por tipo de prenda** (función, tipo, corte, colores y formalidad admitidos), no una prenda concreta: si cambias tu polo por otro, la fórmula sigue funcionando.
- **Origen:** las creas tú (a mano o desde un conjunto) o las detecta el estilista cuando la misma estructura aparece en 2 o más conjuntos que te gustaron, repetirías o te pusiste.
- **Estados:** pendiente de probar, probada, validada, ya no representa mi estilo. Pasa sola de pendiente a probada cuando te pones un conjunto creado desde ella.
- **Probar:** muestra las mejores combinaciones de tu armario que la cumplen, puntuadas por el motor y distintas entre sí, y cuántas variaciones permite. Cualquiera se puede guardar como conjunto enlazado a la fórmula.

### Prompt de evaluación teórica (añadido al de Outfit Stylist)

```text
EVALUACION DE UN CONJUNTO elegido por el usuario. Recibes las prendas, el contexto y la puntuacion interna del motor (orientativa).
- "verdict": tu opinion honesta en 2-3 frases (compatibilidad de estilos, armonia cromatica, volumenes, adecuacion a la ocasion, coherencia con su identidad).
- "strengths" y "risks": breves y concretos.
- "suggestions": cambios opcionales usando SOLO ids de PRENDAS DISPONIBLES (role + garment_id + motivo). Si no hace falta cambiar nada, lista vacia.
- No valores como le queda (no hay foto): eso es otra evaluacion.
```

### Prompt de evaluación visual

```text
Eres Personal Stylist evaluando una FOTOGRAFIA del usuario con un conjunto puesto.
REGLAS:
1. Evalua solo lo que se ve en la foto. Si un aspecto no se aprecia (encuadre, postura, luz, una prenda tapa otra), "visible": false, "score": null, y explica por que.
2. La foto ayuda a ver el resultado, pero no permite verificar con precision todos los detalles de ajuste y construccion: dilo cuando aplique y listalo en "not_visible".
3. No opines sobre el cuerpo, el peso ni el fisico de la persona: solo sobre como funciona el conjunto.
4. Si te dan el conjunto previsto, indica si la foto corresponde ("si", "parcial", "no" o "desconocido") y que difiere.
5. Puntuaciones de 1 a 10 orientativas. Espanol, tono profesional y constructivo. Devuelve UNICAMENTE el JSON.
```

## Estilista con IA (3C)

Regla: **el motor genera y valida; la IA interpreta, elige y explica**. Nada de lo que devuelve la IA se usa sin comprobarlo, y si la IA no está configurada o falla, Outfit Studio sigue funcionando con el motor.

1. **Intérprete de contexto** (`context-parser@1`): convierte la petición («cena con compañeros, restaurante elegante, frío, sin americana») en la petición estructurada del motor. Cada valor se comprueba contra las listas cerradas y cada prenda mencionada contra el inventario disponible; lo que no encaja se descarta y se muestra en «Cómo he interpretado tu petición» junto a los supuestos. Sin IA se usan palabras clave evidentes.
2. **Motor (3B)**: genera hasta 5 candidatas variadas, ya filtradas y puntuadas.
3. **Outfit Stylist AI** (`outfit-stylist@1`, prompt de la especificación): recibe el contexto, un resumen del perfil (sin medidas exactas ni fotos) y las candidatas con sus ids, y **elige** las que recomienda, en orden, con nombre, por qué funciona, cuándo usarlo y sus límites. No puede cambiar ni añadir prendas: las claves citadas se validan (una candidata inexistente se descarta) y, si elige menos de las pedidas, se completan con el orden del motor.
4. **Conversación** sobre las propuestas (P1, P2…). La IA responde con una acción:
   - *modificar* una propuesta con funciones e ids de prendas disponibles. Cada cambio se valida (prenda existente y activa, función posible, composición, filtros de la petición). El **motor vuelve a puntuar** el resultado («compatibilidad 86 → 84») y se guarda como **nueva versión**, sin perder la anterior.
   - *responder* una pregunta.
   - *regenerar* con otras condiciones (nuevo contexto validado).
   - *guardar* la versión vigente como conjunto.

   Un cambio con una prenda que no existe se rechaza y se explica. El historial reciente y los ids de las propuestas se envían en cada turno, así que el contexto no se pierde.
5. **Consumo:** cada llamada (interpretar, elegir, conversar) queda en `ai_runs` con sus tokens y se resume en «Estado técnico». El motor no consume IA.

### Prompt del intérprete

```text
Eres el interprete de peticiones de Personal Stylist. Conviertes lo que el usuario escribe sobre una ocasion en criterios estructurados.
REGLAS:
1. Usa SOLO los valores de las listas, escritos exactamente (el id, no la etiqueta).
2. Si algo no se dice ni se deduce con claridad, devuelve null (o lista vacia). No inventes.
3. Las prendas solo pueden referirse por los ids del INVENTARIO; si el usuario menciona una prenda que no aparece, no la incluyas y dilo en "assumptions".
4. "assumptions": lo que has deducido (p. ej. "restaurante elegante → smart casual"), en espanol y breve.
5. Devuelve UNICAMENTE el JSON.
```

### Prompt de Outfit Stylist AI

```text
Eres Personal Stylist, un estilista masculino profesional especializado en direccion creativa, construccion de outfits y asesoramiento personalizado de imagen.

Dispones de:
- El Style Blueprint validado del usuario.
- Su inventario de prendas.
- Los analisis de cada prenda.
- Las evaluaciones de ajuste confirmadas.
- Sus preferencias y valoraciones anteriores.
- El contexto de la ocasion solicitada.

MISION:
Construir conjuntos coherentes, atractivos, funcionales y alineados con la identidad del usuario.

PRINCIPIOS:
1. Utiliza exclusivamente prendas cuyos identificadores esten presentes en el inventario facilitado.
2. Nunca inventes ropa ni atribuyas al usuario prendas que no tenga registradas.
3. Respeta los filtros obligatorios de ocasion, formalidad, disponibilidad y restricciones.
4. Considera la armonia cromatica, las proporciones, las siluetas, las capas y la coherencia estetica.
5. Prioriza prendas que tengan evidencias favorables de ajuste y aceptacion por parte del usuario.
6. Diferencia entre compatibilidad estimada y ajuste real confirmado.
7. No fuerces la incorporacion de accesorios si no aportan valor al conjunto.
8. Busca variedad entre las propuestas.
9. No recomiendes una compra cuando exista una alternativa adecuada en el armario.
10. Se un experto constructivo. Discrepa cuando exista una razon de estilismo justificada.
11. Explica por que cada conjunto funciona y cuando seria apropiado utilizarlo.
12. No presentes puntuaciones como verdades objetivas.

Responde en espanol, con lenguaje profesional y cercano. La respuesta debe cumplir estrictamente el esquema JSON proporcionado por la aplicacion.
```

### Instrucciones añadidas para la conversación

```text
AHORA ESTAS EN CONVERSACION sobre unas propuestas ya mostradas al usuario (numeradas P1, P2...).
- Si pide cambiar algo de una propuesta, devuelve action "modify", el numero en "target" y en "changes" la funcion y el id de la prenda NUEVA (garment_id null para quitar esa funcion). Usa SOLO ids de PRENDAS DISPONIBLES y funciones validas para esa prenda.
- Si pregunta, opina o pide tu criterio, action "answer".
- Si cambia las condiciones (otra ocasion, clima, restricciones), action "regenerate" con "new_context" (mismos campos y valores que el interprete).
- Si quiere guardar una propuesta, action "save" con su "target".
- "reply": tu respuesta en espanol, 1-4 frases, como un estilista; explica el efecto del cambio (caracter, formalidad, color). Si una peticion no es buena idea, dilo y propon una alternativa de su armario.
- Mantén las demas prendas de la propuesta salvo que el usuario pida lo contrario.
```

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
| `POST /api/stylist/sessions` | `{message, filters?}`: petición en lenguaje natural (los filtros estructurados mandan sobre lo interpretado) → sesión con propuestas |
| `GET /api/stylist/sessions` · `GET /api/stylist/sessions/:id` | Conversaciones y su detalle (mensajes y todas las versiones de las propuestas) |
| `POST /api/stylist/sessions/:id/messages` | `{message}`: conversar (cambiar prendas, preguntar, regenerar con otras condiciones, guardar) |
| `POST /api/outfits/:id/feedback` · `POST /api/outfits/feedback` | Valorar un conjunto o una propuesta (`result_id`); «puesto» registra el uso |
| `POST /api/outfits/:id/wear` | Registrar uso real |
| `POST /api/outfits/:id/evaluate` · `POST /api/outfits/evaluate` | Evaluación teórica o visual (`mode: visual`, `photo_path`, `keep_photo`) |
| `GET` · `DELETE /api/outfits/evaluations/:id` | Consultar una evaluación · borrar su foto |
| `GET` · `POST /api/style-formulas` · `POST /api/style-formulas/from-outfit` | Fórmulas (con variaciones posibles y detectadas) · crear · crear desde un conjunto |
| `PATCH` · `DELETE /api/style-formulas/:id` · `POST /api/style-formulas/:id/try` | Estado · eliminar · probar con tu armario o guardar una combinación |
| `GET` · `POST /api/outfits/learning` | Patrones y métricas · confirmar, descartar o deshacer un patrón |
| `POST /api/outfits/generations/results/:id` | `{action: save\|dismiss, name?}`: guardar la propuesta como conjunto o descartarla |

## Criterios de aceptación de la fase 3

| Criterio | Estado |
|---|---|
| Puedo crear y guardar outfits manualmente | Hecho (3A) |
| Cada outfit está vinculado a prendas reales de mi armario | Hecho (3A): aplicación + RLS |
| Puedo sustituir prendas sin perder el contexto del outfit | Hecho: constructor y API (3A) y conversación con versiones (3C) |
| El motor genera outfits sin inventar prendas | Hecho (3B): solo inventario elegible + validación de salida |
| Las combinaciones respetan las restricciones del usuario | Hecho (3B): filtros obligatorios no compensables |
| El motor consulta mi Style Blueprint | Hecho (3B): identidad estética, temperatura, colores, contraste, cortes, proporciones, compatibilidad y ajuste |
| Las puntuaciones son explicables y se pueden auditar | Hecho (3B): desglose por criterio guardado con pesos y versión del motor |
| Las propuestas son variadas y no repiten sistemáticamente las mismas prendas | Hecho (3B) |
| Puedo solicitar outfits para distintas ocasiones | Hecho: en lenguaje natural (3C) o con filtros (3B) |
| Puedo conversar con el estilista sobre una propuesta | Hecho (3C) |
| Puedo evaluar outfits mediante selección manual de prendas | Hecho (3D): motor + estilista |
| Puedo subir fotografías para una evaluación visual | Hecho (3D): foto privada, borrada tras el análisis salvo que la conserves; lo no visible se indica |
| Puedo valorar las propuestas y explicar mis rechazos | Hecho (3D): conjuntos y propuestas, con motivos |
| Puedo crear y guardar fórmulas de estilo | Hecho (3D): manuales, desde un conjunto o detectadas |
| Puedo registrar outfits que realmente he utilizado | Hecho (3D): diario de uso; frecuencia por prenda |
| Las valoraciones quedan disponibles para mejorar futuras recomendaciones | Hecho (3D): patrones con evidencia que el motor y el estilista aplican |