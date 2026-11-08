# Motor de diagnóstico y Style Blueprint

> Documento generado desde `lib/profile/blueprint.ts`, `lib/diagnosis/rules.ts` y `lib/ai/prompts.ts` con `npm run docs`. No lo edites a mano.

## Principios

- **Las reglas calculan; la IA no concluye.** El diagnóstico es determinista: mismos datos, mismo resultado. La IA solo aporta observaciones visuales de las fotos (como propuestas) y conversa en el chat.
- **Nunca se inventa un dato.** Si falta, la conclusión lo dice, baja la confianza y lo lista en «Falta».
- **Separar hechos, preferencias y recomendaciones.** Cada conclusión indica su origen (medido, declarado, deducido, calculado o IA).
- **El usuario manda.** Toda conclusión se puede confirmar o corregir; al regenerar se conserva su revisión mientras sus datos no cambien.
- **Validar datos ≠ confirmar conclusiones.** Validar un capítulo dice «estos datos son correctos» y sube la confianza de lo que se calcula con ellos; confirmar una conclusión dice «este diagnóstico me describe».

## Formato de cada conclusión

| Campo | Contenido |
|---|---|
| `title` | Nombre de la conclusión |
| `body` | La conclusión, en una o dos frases |
| `why` | **Por qué**: los datos concretos y las reglas profesionales que la justifican |
| `action` | **Qué haría un estilista**: la acción concreta que recomendaría |
| `data_used` | Datos del expediente que se han usado |
| `missing` | Lo que falta para concluir o afinar |
| `origin` | Medición manual · Declarado por ti · Deducido de tus respuestas · Calculado · IA · foto X |
| `confidence` | `alta` · `media` · `baja` · `sin_datos` |
| `status` | `pending` · `confirmed` · `corrected` (+ `corrected_body`) |

## Criterios de confianza

| Nivel | Etiqueta | Cuándo |
|---|---|---|
| `alta` | Confianza alta | Datos medidos o declarados que tú has validado (o una conclusión que has confirmado). |
| `media` | Confianza media | Datos declarados o medidos por ti, todavía sin validar; o una observación visual fiable. |
| `baja` | Hipótesis | Hipótesis: deducida de pistas indirectas, contradictoria con otros datos o procedente de una foto. |
| `sin_datos` | Sin datos | Falta la información mínima para concluir; se indica qué falta. |

Las observaciones de la IA nunca superan `media`: una foto es una hipótesis visual.

## Reglas profesionales

| Regla | Área | Criterio |
|---|---|---|
| `mezcla` | Estilo | Un estilo personal suele ser una base (70–80 % del armario) con una influencia que aparece en una o dos piezas por conjunto. |
| `objetivo` | Estilo | El objetivo de imagen manda sobre las tendencias: cada prenda nueva tiene que acercarte a las palabras que elegiste. |
| `dna` | Estilo | Lo que eliges al ver conjuntos dice más de tu gusto que lo que declaras; lo que admiras pero no te pondrías marca un límite, no un objetivo. |
| `limites` | Estilo | Lo que nunca te pondrías es un límite, no un reto: un buen estilista trabaja dentro de él. |
| `drop` | Proporciones | La diferencia entre contorno de pecho y de cintura define la silueta: 20 cm o más es una V marcada; 10–19, equilibrada; 0–9, recta; negativa, más volumen en la cintura. |
| `cadera` | Proporciones | Si la cadera supera al pecho en 4 cm o más, el volumen visual está abajo y conviene equilibrarlo arriba. |
| `pierna` | Proporciones | Entrepierna / altura ≥ 0,47 indica piernas largas; ≤ 0,43, piernas cortas respecto al torso. |
| `hombro` | Cortes | El hombro es lo único que un sastre no arregla bien: una prenda que no encaja de hombro no es tu talla. |
| `volumen` | Cortes | Un volumen se equilibra con una línea limpia: amplio arriba y amplio abajo a la vez borra la silueta. |
| `luz` | Color | La colorimetría es una hipótesis: la luz y el procesado del móvil alteran el color; se valida con luz natural. |
| `subtono` | Color | Venas verdosas, preferencia por el oro y facilidad para broncearse apuntan a subtono cálido; venas azuladas, plata y quemarse con facilidad, a frío. |
| `contraste` | Color | El contraste natural (diferencia de claridad entre pelo y piel) marca cuánto contraste admiten tus combinaciones. |
| `cara` | Color | El color importa sobre todo cerca de la cara; lejos de ella (pantalones, calzado) casi cualquier neutro funciona. |
| `reparto` | Vida | El armario debe repartirse como tu semana: lo que ocupa más tiempo merece más prendas y más inversión. |
| `rotacion` | Vida | La frecuencia de lavado fija cuántas unidades de lo básico necesitas para no repetir prendas sucias. |

## Estructura del Style Blueprint

Portada (versión, fecha, estado preliminar o completo, cita con la dirección de estilo) y, en este orden:

- **Dirección**
- **Silueta y cortes**
- **Color**
- **Tu vida real**
- **Plan**

Cierra con **Lo que sé, lo que supongo y lo que falta** (conclusiones confirmadas o de confianza alta; hipótesis pendientes; datos que faltan).

## Ejemplo completo

Resultado del motor para un perfil ficticio: 34 años, 180 cm, medidas y estilo validados, colorimetría declarada sin validar, sin armario registrado.

### Dirección

#### Dirección de estilo · Confianza alta

Elevated casual (50 %) como base, con Scandinavian minimalism (30 %) e influencia de Quiet luxury (20 %). Tendencia a lo contemporáneo y minimalista. Imagen limpia, segura y elegante.

- **Por qué:** Es la identidad que construiste (versión 2). Tus ejes: contemporáneo 70/100, minimalista 25/100. Los porcentajes son orientativos: describen preferencias, no una clasificación objetiva. Un estilo personal suele ser una base (70–80 % del armario) con una influencia que aparece en una o dos piezas por conjunto.
- **Qué haría un estilista:** Construiría la base del armario en elevated casual y usaría scandinavian minimalism y quiet luxury en una o dos piezas por conjunto, sin que ninguna mande sobre la base. Cortes actuales y alguna textura técnica. Pocas prendas, lisas y sin logos. Mantendría lo que te gusta: líneas limpias, pantalón recto y pantalón de sastrería. Y respetaría tus límites: nada de pantalón pitillo y pantalón slim.
- **Origen:** Declarado por ti · **Datos usados:** Identidad declarada, Ejes de estilo, Palabras de imagen, Lo que nunca te pondrías, Elementos preferidos

#### Style DNA · Confianza media

Tus valoraciones apuntan a elevated casual 40 %, quiet luxury 25 %, minimalismo contemporáneo 20 % y classic contemporary 15 %. Prefieres: pantalón recto, pantalón de sastrería, capas y superposiciones y camisa. Evitas: parte de arriba oversize.

- **Por qué:** De 10 valoraciones y tus marcas de referencia, que orientan pero no son estilos. Solo cuento un patrón cuando aparece en al menos 2 conjuntos distintos. Admiras sin querer llevarlo: italian casual. Lo que eliges al ver conjuntos dice más de tu gusto que lo que declaras; lo que admiras pero no te pondrías marca un límite, no un objetivo.
- **Qué haría un estilista:** Usaría estos patrones al elegir prendas: pantalón recto, pantalón de sastrería y capas y superposiciones. Dejaría fuera hip-hop inspired y streetwear contemporáneo: lo has descartado.
- **Origen:** Inferido de tus valoraciones · **Datos usados:** Valoraciones de la galería, Marcas de referencia

#### Objetivo visual · Confianza media

Que al verte piensen: limpia, segura y elegante.

- **Por qué:** Son las palabras que elegiste y lo que escribiste («Una imagen cuidada sin parecer disfrazado»). El objetivo de imagen manda sobre las tendencias: cada prenda nueva tiene que acercarte a las palabras que elegiste.
- **Qué haría un estilista:** Para conseguirlo: prendas lisas, a tu talla y bien cuidadas; ajuste exacto de hombro y de largo de pantalón; paleta corta y calzado de piel cuidado.
- **Origen:** Declarado por ti · **Datos usados:** Palabras de imagen, Respuestas abiertas

### Silueta y cortes

#### Silueta y proporciones · Confianza alta

Silueta en V marcada (pecho − cintura = 20 cm) y piernas largas respecto a tu altura.

- **Por qué:** Pecho 104 cm y cintura 84 cm, cadera 98 cm; entrepierna / altura = 0.48. La diferencia entre contorno de pecho y de cintura define la silueta: 20 cm o más es una V marcada; 10–19, equilibrada; 0–9, recta; negativa, más volumen en la cintura. Entrepierna / altura ≥ 0,47 indica piernas largas; ≤ 0,43, piernas cortas respecto al torso.
- **Qué haría un estilista:** Pantalón recto o con algo de volumen para equilibrar los hombros; camisetas a tu talla de hombro sin ceñir la cintura; evitaría hombreras. Puedes permitirte vuelta en el bajo y chaquetas algo más largas.
- **Origen:** Medición manual · calculado · **Datos usados:** Pecho, Cintura, Cadera, Entrepierna, Altura

#### Cortes que funcionan · Confianza media

Tus preferencias: pantalones: recto; camisas: regular; chaquetas: desestructurada. Ajuste general regular. Por tu silueta: pantalón recto o amplio, camisetas regular de hombro exacto.

- **Por qué:** Las preferencias son tuyas (no una conclusión objetiva); las contrasto con tu silueta calculada. El hombro es lo único que un sastre no arregla bien: una prenda que no encaja de hombro no es tu talla.
- **Qué haría un estilista:** Probaría primero pantalón recto o amplio, camisetas regular de hombro exacto. Registra una prenda que te quede bien (capítulo 06): es la mejor guía de talla.
- **Origen:** Declarado por ti · calculado · **Datos usados:** Cortes preferidos, Ajuste general, Silueta calculada

#### Cortes con precaución · Confianza media

Con tus datos no veo cortes problemáticos.

- **Por qué:** Ninguna de tus preferencias choca con tu silueta.
- **Qué haría un estilista:** Mantendría tu límite: nada de pantalón pitillo.
- **Origen:** Calculado a partir de tus datos · **Datos usados:** Cortes preferidos, Silueta calculada

### Color

#### Colorimetría · Confianza media

Subtono cálido, contraste alto.

- **Por qué:** Lo declaraste tú y tus pistas (venas verdosas (cálido), te favorece el oro (cálido)) lo respaldan. El contraste lo calculo con tu color de pelo y de piel. Venas verdosas, preferencia por el oro y facilidad para broncearse apuntan a subtono cálido; venas azuladas, plata y quemarse con facilidad, a frío. La colorimetría es una hipótesis: la luz y el procesado del móvil alteran el color; se valida con luz natural.
- **Qué haría un estilista:** Cerca de la cara, colores con base amarilla: camel, oliva, crudo en vez de blanco óptico; metal dorado. Combinaría claro con oscuro (blanco y marino) para estar a la altura de tu contraste.
- **Origen:** Declarado por ti · **Datos usados:** Temperatura declarada, Pistas de subtono, Color de pelo y piel

#### Paleta · Confianza media

Neutros: camel, beige, marrón, azul marino y gris. Cerca de la cara: camel, oliva, beige y burdeos. Acentos: burdeos, oliva y rojo.

- **Por qué:** Sale de tu subtono cálido y tu contraste alto. El color importa sobre todo cerca de la cara; lejos de ella (pantalones, calzado) casi cualquier neutro funciona. He quitado lo que evitas (mostaza).
- **Qué haría un estilista:** Empezaría por los neutros: son el 70 % del armario. Los acentos, en prendas pequeñas o cerca de la cara. Combinaciones para empezar: camel + azul marino + burdeos; camel + marrón + oliva. Azul claro te gusta: llévalo lejos de la cara (pantalón, calzado).
- **Origen:** Calculado a partir de tu colorimetría · **Datos usados:** Colorimetría, Colores que te gustan, Colores que evitas

### Tu vida real

#### Necesidades de vida · Confianza alta

Trabajo 50 %, Ocio 30 %; trabajo smart casual; clima cuatro estaciones marcadas.

- **Por qué:** Es tu reparto declarado y la formalidad de tu trabajo. El armario debe repartirse como tu semana: lo que ocupa más tiempo merece más prendas y más inversión. La frecuencia de lavado fija cuántas unidades de lo básico necesitas para no repetir prendas sucias.
- **Qué haría un estilista:** Chinos y pantalón de lana, camisas oxford, punto fino y una americana desestructurada. Por tu clima: capas: punto fino, sobrecamisa y un buen abrigo. Por tu ritmo de lavado, necesitas unas 7–8 camisetas y 5 camisas. Caminas mucho: calzado con suela de goma que no parezca deportivo.
- **Origen:** Declarado por ti · **Datos usados:** Reparto del armario, Formalidad del trabajo, Clima, Lavado, Restricciones

### Plan

#### Prioridades de armario · Confianza media

1. Inventariar lo que ya tienes antes de comprar nada: evita duplicados (armario digital, fase 2). 2. Cubrir el trabajo, que es lo que más usas: chinos y pantalón de lana, camisas oxford, punto fino y una americana desestructurada. 3. Básicos en tus neutros (camel, beige y marrón) antes que acentos.

- **Por qué:** Ordeno por impacto: primero evitar compras inútiles, después lo que más usas, después la base de color. El armario debe repartirse como tu semana: lo que ocupa más tiempo merece más prendas y más inversión.
- **Qué haría un estilista:** Haría las compras en este orden y ninguna fuera de la lista hasta tener la base.
- **Origen:** Calculado a partir de tus datos · **Datos usados:** Necesidades de vida, Paleta, Armario registrado

#### Próximos pasos · Confianza alta

1. Revisar y validar el capítulo estudio cromático. 2. Revisar y validar el capítulo preferencias de vestuario. 3. Revisar y validar el capítulo objetivos de imagen.

- **Por qué:** Son los datos que faltan o están sin validar y que más suben la confianza de este diagnóstico.
- **Qué haría un estilista:** Haría primero el paso 1: en diez minutos el diagnóstico gana precisión.
- **Origen:** Calculado a partir de tu expediente · **Datos usados:** Estado del expediente

## Instrucciones que recibe la IA

### Análisis de fotos (`PHOTO_ANALYSIS`)

```text
Eres un estilista masculino profesional, experto y prudente.
Recibes fotos de un usuario (se indica el tipo de cada una y los avisos de calidad detectados al subirlas).

Paso 1 · Calidad. Para CADA foto decide si es utilizable segun el protocolo: persona completa y visible (cuerpo entero en frontal, lateral y espalda),
luz suficiente sin dominantes fuertes, enfocada, sin filtros, ropa que deje ver la silueta. Si no lo es, "usable": false y explica por que en "issues".

Paso 2 · Observaciones. Devuelve de 4 a 8 observaciones sobre lo VISIBLE, solo de fotos utilizables.
Que puede analizar cada foto:
- frontal: puedes observar proporción relativa entre hombros, cintura y cadera; relación visual entre largo de torso y de piernas; simetría y caída de hombros; cómo te queda la ropa que llevas. NO puedes afirmar: medidas en centímetros; peso, grasa corporal o edad; tallas.
- lateral: puedes observar postura (hombros adelantados, curvatura de la espalda); volumen del perfil de pecho y abdomen; caída de prendas por delante y por detrás. NO puedes afirmar: medidas en centímetros; diagnósticos posturales o de salud.
- espalda: puedes observar anchura relativa de espalda y hombros; inclinación de hombros; ajuste de la ropa en la espalda. NO puedes afirmar: medidas en centímetros.
- rostro: puedes observar contraste entre piel, pelo y ojos; hipótesis de temperatura (cálida, fría o neutra); profundidad e intensidad aparentes. NO puedes afirmar: subtono definitivo: la cámara del móvil altera el color; edad o rasgos de salud de la piel.
Reglas estrictas:
- No midas en centimetros, no estimes peso, grasa corporal ni edad, no inventes lo que no se ve.
- La colorimetria es una hipotesis: la luz y el procesado del movil alteran el color. Si la foto de rostro tiene dominante de color, confianza "baja".
- Si una foto no basta para afirmar algo, usa confianza "baja" o no lo incluyas.
- "source_photo" es el tipo de foto que justifica la observacion.
- Responde en espanol.

Devuelve UNICAMENTE un objeto JSON con esta forma exacta (sin texto fuera del JSON):
{"photo_quality":[{"source_photo":"frontal","usable":true,"issues":[]}],"observations":[{"area":"antropometria|colorimetria|estilo","title":"texto corto","body":"observacion","confidence":"alta|media|baja","justification":"por que lo afirmas","source_photo":"tipo de foto"}]}
```

La salida se valida con `ObservationsSchema` (Zod) y se reintenta una vez si no cumple el formato.

### Estilista del chat (`STYLIST_PERSONA`)

```text
Eres "Mi estilista": asesor de imagen masculina, experto, directo y exigente con la calidad.
Reglas de comportamiento:
- No des la razon por sistema. Si algo que le gusta al usuario no funciona, dilo y justificalo; propon el patron concreto alternativo.
- Prioriza el PERFIL VALIDADO y las CONCLUSIONES CONFIRMADAS O CORREGIDAS: son la verdad del usuario; si corrigio una conclusion, manda su correccion.
- Los DATOS DECLARADOS SIN VALIDAR y las CONCLUSIONES PROVISIONALES son hipotesis: presentalos como tales y sugiere validarlos si afectan a tu respuesta.
- Si una area esta en AREAS SIN DATOS y la necesitas, di que dato falta y por que importa.
- La identidad estetica puede ser HIBRIDA (principal, secundarios, influencias con %): combina influencias secundarias cuando tenga sentido; los % son orientativos, no una restriccion.
- Distingue lo DECLARADO por el usuario de lo INFERIDO de sus valoraciones y de tus recomendaciones; si chocan, dilo.
- Al proponer outfits usa solo prendas del ARMARIO REAL. No inventes prendas ni medidas.
- Si no tienes datos suficientes para afirmar algo, dilo y explica que falta.
- Cada recomendacion lleva dos partes breves: «Por qué» (que dato o regla la justifica) y «Qué haría un estilista» (la accion concreta).
- Respuestas breves y accionables, en espanol.
```

Después de estas instrucciones el chat recibe el contexto de `lib/ai/context.ts`: perfil validado, conclusiones confirmadas o corregidas (con su «Qué haría un estilista»), datos sin validar, hipótesis con lo que les falta, capítulos sin datos y armario real.
