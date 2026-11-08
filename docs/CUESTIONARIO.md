# Cuestionario de incorporación

> Documento generado desde `lib/profile/questionnaire.ts` con `npm run docs`. No lo edites a mano: cambia el código y regenéralo.

Cada pregunta indica sus respuestas posibles, qué información pretende extraer, dónde se guarda y qué conclusión del Style Blueprint (o del chat) alimenta.
El servidor solo acepta opciones de la lista, descarta medidas fuera de rango y avisa si el reparto del estilo de vida no suma 100 %.
Un capítulo pasa a **En curso** cuando tiene alguna respuesta con información (un deslizador en 50 o un 0 % no cuentan) y a **Validado** cuando el usuario lo confirma.

## 01 · Identidad y datos

_Lo básico para empezar: quién eres, tus tallas habituales y cuánto sueles invertir en una prenda._

| Pregunta | Tipo | Respuestas | Qué extrae | Se guarda en | Alimenta |
|---|---|---|---|---|---|
| Edad | Número | Libre | Etapa vital; matiza la formalidad y las referencias adecuadas. | `profiles.age` | Contexto del chat |
| Altura | Número | Número (cm) | Escala corporal: largos de prenda y proporción con el resto de medidas. | `profiles.height_cm` | Proporciones |
| Peso (opcional) | Número | Número (kg) | Dato opcional de contexto; nunca se estima desde fotos. | `profiles.weight_kg` | Contexto del chat |
| Ciudad y país | Texto | Libre | Clima y mercado (tiendas disponibles). | `profiles.city` | Necesidades de vida; compras (fase 4) |
| Tallas habituales | Texto | Libre | Punto de partida de tallaje por marca. | `profiles.sizes` | Contexto del chat; compras (fase 4) |
| Marcas habituales | Texto | Libre | Nivel de precio y patrones de las marcas que ya le funcionan. | `profiles.brands` | Contexto del chat; compras (fase 4) |
| Presupuesto máximo por prenda | Número | Número (€) | Techo de gasto por prenda. | `profiles.budget_max` | Compras (fase 4) |
| Ajuste general preferido | Una opción | Ajustado · Regular · Relajado · Amplio | Preferencia global de holgura (preferencia, no conclusión objetiva). | `profiles.fit_pref` | Cortes que funcionan |

## 02 · Estudio antropométrico

_Tus medidas y tus fotografías. Las medidas las tomas tú; las fotos solo sirven para observar proporciones, nunca para medir._

| Pregunta | Tipo | Respuestas | Qué extrae | Se guarda en | Alimenta |
|---|---|---|---|---|---|
| Pecho | Medida (cm) | 1–299 cm | Contorno o largo real (pecho), medido con cinta; se guarda con fecha y no se sobrescribe. | `body_measurements` (key=`pecho`, value_cm; histórico con fecha) | Proporciones |
| Hombros | Medida (cm) | 1–299 cm | Contorno o largo real (hombros), medido con cinta; se guarda con fecha y no se sobrescribe. | `body_measurements` (key=`hombros`, value_cm; histórico con fecha) | Proporciones |
| Cintura | Medida (cm) | 1–299 cm | Contorno o largo real (cintura), medido con cinta; se guarda con fecha y no se sobrescribe. | `body_measurements` (key=`cintura`, value_cm; histórico con fecha) | Proporciones |
| Cadera | Medida (cm) | 1–299 cm | Contorno o largo real (cadera), medido con cinta; se guarda con fecha y no se sobrescribe. | `body_measurements` (key=`cadera`, value_cm; histórico con fecha) | Proporciones |
| Largo de torso | Medida (cm) | 1–299 cm | Contorno o largo real (largo de torso), medido con cinta; se guarda con fecha y no se sobrescribe. | `body_measurements` (key=`torso`, value_cm; histórico con fecha) | Proporciones |
| Entrepierna | Medida (cm) | 1–299 cm | Contorno o largo real (entrepierna), medido con cinta; se guarda con fecha y no se sobrescribe. | `body_measurements` (key=`entrepierna`, value_cm; histórico con fecha) | Proporciones |
| Pierna exterior | Medida (cm) | 1–299 cm | Contorno o largo real (pierna exterior), medido con cinta; se guarda con fecha y no se sobrescribe. | `body_measurements` (key=`pierna`, value_cm; histórico con fecha) | Proporciones |
| Muslo | Medida (cm) | 1–299 cm | Contorno o largo real (muslo), medido con cinta; se guarda con fecha y no se sobrescribe. | `body_measurements` (key=`muslo`, value_cm; histórico con fecha) | Proporciones |
| Cuello | Medida (cm) | 1–299 cm | Contorno o largo real (cuello), medido con cinta; se guarda con fecha y no se sobrescribe. | `body_measurements` (key=`cuello`, value_cm; histórico con fecha) | Proporciones |
| Largo de brazo | Medida (cm) | 1–299 cm | Contorno o largo real (largo de brazo), medido con cinta; se guarda con fecha y no se sobrescribe. | `body_measurements` (key=`brazo`, value_cm; histórico con fecha) | Proporciones |

Las fotografías de este capítulo siguen el [protocolo fotográfico](PROTOCOLO-FOTOGRAFICO.md).

## 03 · Estudio cromático

_Cómo se comporta el color contigo. Es una hipótesis que se valida con luz natural, no una clasificación cerrada._

| Pregunta | Tipo | Respuestas | Qué extrae | Se guarda en | Alimenta |
|---|---|---|---|---|---|
| Color de ojos | Una opción | Azul · Verde · Gris · Avellana · Marrón claro · Marrón oscuro · Negro | Profundidad y contraste natural. | `color_profiles.eye_color` | Colorimetría |
| Color de pelo (o barba) | Una opción | Rubio claro · Rubio oscuro · Castaño claro · Castaño oscuro · Negro · Pelirrojo · Canoso · Sin pelo | Profundidad y contraste con la piel. | `color_profiles.hair_color` | Colorimetría |
| Tono de piel | Una opción | Muy clara · Clara · Media · Morena · Oscura | Profundidad de la piel; base del contraste. | `color_profiles.skin_tone` | Colorimetría |
| Las venas de tu muñeca, con luz natural, parecen… | Una opción | Azuladas o violetas · Verdosas · Una mezcla / no lo sé | Indicio de subtono frío (azuladas) o cálido (verdosas). | `color_profiles.vein_color` | Colorimetría |
| Con el sol… | Una opción | Me quemo y apenas me bronceo · Me quemo y luego me bronceo · Me bronceo con facilidad · Casi nunca me quemo | Indicio de subtono y profundidad. | `color_profiles.sun_reaction` | Colorimetría |
| ¿Qué metal te favorece más (reloj, anillo)? | Una opción | Plata · Oro · Los dos por igual · No lo sé | Indicio de subtono frío (plata) o cálido (oro). | `color_profiles.metal` | Colorimetría |
| Temperatura | Una opción | Cálida · Neutra · Fría | Subtono de la piel validado por el usuario (con origen IA o usuario, estado y fechas). | `color_profiles.temperature` — Tarjeta «Temperatura cromática»: estimación por IA con la foto de rostro, que el usuario confirma o corrige (BIS 2). | Colorimetría; Paleta; encaje de color |
| Profundidad | Una opción | Clara · Media · Oscura | Claridad general de tus colores. | `color_profiles.depth` | Colorimetría |
| Intensidad | Una opción | Suave · Media · Brillante | Si te favorecen colores apagados o saturados. | `color_profiles.intensity` | Colorimetría |
| Contraste | Una opción | Bajo · Medio · Alto | Diferencia entre piel, pelo y ojos: cuánto contraste admiten tus combinaciones. | `color_profiles.contrast` | Colorimetría |
| Colores que te gusta llevar | Varias opciones | Negro · Blanco · Gris · Azul marino · Beige · Camel · Marrón · Oliva · Burdeos · Azul claro · Verde bosque · Rojo · Rosa · Lila · Mostaza | Preferencia cromática (gusto, no conclusión objetiva). | `color_profiles.likes` | Paleta |
| Colores que evitas | Varias opciones | Negro · Blanco · Gris · Azul marino · Beige · Camel · Marrón · Oliva · Burdeos · Azul claro · Verde bosque · Rojo · Rosa · Lila · Mostaza | Rechazos cromáticos que la paleta debe respetar o justificar. | `color_profiles.avoids` | Paleta |

## 04 · Identidad estética

_Qué quieres transmitir. No hace falta elegir una sola etiqueta: tu estilo puede ser una mezcla._

| Pregunta | Tipo | Respuestas | Qué extrae | Se guarda en | Alimenta |
|---|---|---|---|---|---|
| Clásico ↔ Contemporáneo | Deslizador 0–100 | Clásico (0) ↔ Contemporáneo (100); 50 = sin preferencia | Posición entre clásico y contemporáneo (50 = sin preferencia). | `style_preferences.dims.clasico` (jsonb) | Identidad estética |
| Minimalista ↔ Expresivo | Deslizador 0–100 | Minimalista (0) ↔ Expresivo (100); 50 = sin preferencia | Posición entre minimalista y expresivo (50 = sin preferencia). | `style_preferences.dims.minimalista` (jsonb) | Identidad estética |
| Estructurado ↔ Relajado | Deslizador 0–100 | Estructurado (0) ↔ Relajado (100); 50 = sin preferencia | Posición entre estructurado y relajado (50 = sin preferencia). | `style_preferences.dims.estructurado` (jsonb) | Identidad estética |
| Ajustado ↔ Amplio | Deslizador 0–100 | Ajustado (0) ↔ Amplio (100); 50 = sin preferencia | Posición entre ajustado y amplio (50 = sin preferencia). | `style_preferences.dims.ajustado` (jsonb) | Identidad estética |
| Formal ↔ Casual | Deslizador 0–100 | Formal (0) ↔ Casual (100); 50 = sin preferencia | Posición entre formal y casual (50 = sin preferencia). | `style_preferences.dims.formal` (jsonb) | Identidad estética |
| Discreto ↔ Llamativo | Deslizador 0–100 | Discreto (0) ↔ Llamativo (100); 50 = sin preferencia | Posición entre discreto y llamativo (50 = sin preferencia). | `style_preferences.dims.discreto` (jsonb) | Identidad estética |
| Algo que nunca te pondrías | Texto | Libre | Límites del estilo: tan informativos como los gustos. | `style_preferences.never_wear` | Identidad estética; Cortes con precaución |

### Identidad estética, catálogo de estilos y Style DNA

Además de los ejes y los límites, el capítulo 04 incluye el catálogo de 30 estilos con su galería valorable, la identidad híbrida declarada (influencias con rol y %, elementos que quiere o rechaza, marcas de referencia), referencias propias analizadas por la IA y el Style DNA inferido. Todo está documentado en [STYLE-DNA.md](STYLE-DNA.md).


## 05 · Estilo de vida

_Para qué te vistes de verdad. Un armario bonito que no sirve a tu semana no es un buen armario._

| Pregunta | Tipo | Respuestas | Qué extrae | Se guarda en | Alimenta |
|---|---|---|---|---|---|
| Trabajo | Porcentaje | 0–100 en pasos de 5; el grupo debe sumar 100 % | Peso de «trabajo» en tu semana (el reparto debe sumar 100 %). | `lifestyle_profiles.life.trabajo` (jsonb) | Necesidades de vida |
| Estudios | Porcentaje | 0–100 en pasos de 5; el grupo debe sumar 100 % | Peso de «estudios» en tu semana (el reparto debe sumar 100 %). | `lifestyle_profiles.life.universidad` (jsonb) | Necesidades de vida |
| Ocio | Porcentaje | 0–100 en pasos de 5; el grupo debe sumar 100 % | Peso de «ocio» en tu semana (el reparto debe sumar 100 %). | `lifestyle_profiles.life.ocio` (jsonb) | Necesidades de vida |
| Deporte | Porcentaje | 0–100 en pasos de 5; el grupo debe sumar 100 % | Peso de «deporte» en tu semana (el reparto debe sumar 100 %). | `lifestyle_profiles.life.deporte` (jsonb) | Necesidades de vida |
| Citas y cenas | Porcentaje | 0–100 en pasos de 5; el grupo debe sumar 100 % | Peso de «citas y cenas» en tu semana (el reparto debe sumar 100 %). | `lifestyle_profiles.life.citas` (jsonb) | Necesidades de vida |
| Eventos y ocasiones especiales | Porcentaje | 0–100 en pasos de 5; el grupo debe sumar 100 % | Peso de «eventos y ocasiones especiales» en tu semana (el reparto debe sumar 100 %). | `lifestyle_profiles.life.eventos` (jsonb) | Necesidades de vida |
| Formalidad de tu trabajo | Una opción | Uniforme · Muy formal (traje) · Smart casual · Casual · Teletrabajo · No trabajo ahora | Nivel de formalidad exigido el día a día. | `lifestyle_profiles.work_formality` | Necesidades de vida |
| Clima habitual | Una opción | Cálido todo el año · Templado, inviernos suaves · Cuatro estaciones marcadas · Frío y húmedo · Varía: viajo mucho | Pesos de tejido y capas necesarias. | `lifestyle_profiles.climate` | Necesidades de vida |
| ¿Cuánto viajas? | Una opción | Casi nunca · Algunas veces al año · Una vez al mes o más | Necesidad de prendas versátiles y que no se arruguen. | `lifestyle_profiles.travel` | Necesidades de vida |
| ¿Cada cuánto pones lavadoras? | Una opción | A diario o casi · Una o dos veces por semana · Cada dos semanas o más | Rotación necesaria: cuántas unidades de lo básico hacen falta. | `lifestyle_profiles.laundry` | Necesidades de vida |
| Restricciones prácticas | Varias opciones | Camino mucho · Necesito prendas que no se arruguen · Uso transporte público · Llevo uniforme · Visto formal a diario · Paso calor con facilidad · Priorizo la comodidad sobre todo | Condiciones que descartan tejidos o prendas. | `lifestyle_profiles.constraints` | Necesidades de vida |

## 06 · Preferencias de vestuario

_Los cortes con los que te sientes bien, prenda a prenda._

| Pregunta | Tipo | Respuestas | Qué extrae | Se guarda en | Alimenta |
|---|---|---|---|---|---|
| Camisetas | Una opción | Regular · Relaxed · Ajustada | Corte preferido en camisetas (preferencia; se contrasta con las medidas). | `fit_preferences.prefs.camisetas` (jsonb) | Cortes que funcionan; Cortes con precaución |
| Camisas | Una opción | Regular · Oversize · Entallada | Corte preferido en camisas (preferencia; se contrasta con las medidas). | `fit_preferences.prefs.camisas` (jsonb) | Cortes que funcionan; Cortes con precaución |
| Pantalones | Una opción | Recto · Amplio · Tapered | Corte preferido en pantalones (preferencia; se contrasta con las medidas). | `fit_preferences.prefs.pantalones` (jsonb) | Cortes que funcionan; Cortes con precaución |
| Chaquetas | Una opción | Estructurada · Desestructurada | Corte preferido en chaquetas (preferencia; se contrasta con las medidas). | `fit_preferences.prefs.chaquetas` (jsonb) | Cortes que funcionan; Cortes con precaución |
| Abrigos | Una opción | Corto · Medio · Largo | Corte preferido en abrigos (preferencia; se contrasta con las medidas). | `fit_preferences.prefs.abrigos` (jsonb) | Cortes que funcionan; Cortes con precaución |
| Calzado | Una opción | Minimalista · Clásico · Deportivo | Corte preferido en calzado (preferencia; se contrasta con las medidas). | `fit_preferences.prefs.calzado` (jsonb) | Cortes que funcionan; Cortes con precaución |

### Prendas de referencia

Prendas que ya le quedan bien, medidas en plano (medidas de prenda, no corporales). Tabla `reference_garments` (`category`, `name`, `measurements` jsonb, `notes`).

| Tipo | Medidas que se piden (cm) |
|---|---|
| Pantalón | Cintura, Tiro, Largo, Bajo |
| Camiseta | Hombros, Pecho, Largo |
| Camisa | Hombros, Pecho, Largo, Manga |
| Chaqueta | Hombros, Pecho, Largo, Manga |
| Abrigo | Hombros, Pecho, Largo, Manga |

Alimentan: Cortes que funcionan; comparación de tallas en compras (fase 4).

## 07 · Objetivos de imagen

_Hacia dónde quieres ir. Lo revisaremos en cada actualización de tu perfil._

| Pregunta | Tipo | Respuestas | Qué extrae | Se guarda en | Alimenta |
|---|---|---|---|---|---|
| Hasta tres palabras que quieres que piensen al verte | Varias opciones | Limpia · Estructurada · Relajada · Profesional · Creativa · Elegante · Cercana · Segura · Versátil · Discreta (máx. 3) | Objetivo visual en términos que el motor puede usar. | `style_goals.image_words` | Objetivos; Identidad estética |
| ¿Qué te gustaría cambiar de tu forma de vestir? | Texto libre | Libre | Motivación y contexto en tus palabras. | `style_goals.answers.g0` (jsonb) | Objetivos |
| ¿En qué situaciones nunca encuentras la ropa adecuada? | Texto libre | Libre | Motivación y contexto en tus palabras. | `style_goals.answers.g1` (jsonb) | Objetivos |
| ¿Qué imagen quieres proyectar? | Texto libre | Libre | Motivación y contexto en tus palabras. | `style_goals.answers.g2` (jsonb) | Objetivos |
| ¿Qué prendas usas y cuáles evitas? | Texto libre | Libre | Motivación y contexto en tus palabras. | `style_goals.answers.g3` (jsonb) | Objetivos |
| ¿Qué te gustaría llevar dentro de seis meses y hoy no te atreves? | Texto libre | Libre | Motivación y contexto en tus palabras. | `style_goals.answers.g4` (jsonb) | Objetivos |
