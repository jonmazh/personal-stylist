# Protocolo fotográfico

> Documento generado desde `lib/photos/protocol.ts` y `lib/photos/quality.ts` con `npm run docs`. No lo edites a mano.

Las fotos son **opcionales**. Antes de la primera hay que aceptar cómo se tratan (`profiles.photo_consent_at`).
Se guardan en el bucket privado `profile-private`, reducidas a 1024 px y recodificadas en JPEG (lo que elimina los metadatos, incluida la ubicación GPS).
Solo se envían al proveedor de IA cuando el usuario pulsa «Analizar».

## Reglas comunes

- Luz natural difusa: de frente a una ventana o en exterior a la sombra. Sin flash ni luz amarilla de bombilla.
- Fondo liso y claro, sin objetos ni espejos.
- Sin filtros, retoques ni modo retrato. Si puedes, desactiva el «embellecimiento» de la cámara.
- Otra persona hace la foto o usas el temporizador con el móvil apoyado: los selfies en el espejo deforman las proporciones.

## Fotografías

### Frontal, cuerpo entero (`frontal`)

- Cámara a la altura de la cintura, a 2–3 m, en vertical.
- De pie, peso repartido en las dos piernas, brazos ligeramente separados del cuerpo.
- Que se vea de la cabeza a los pies, con algo de margen.
- Ropa: Ropa ajustada y lisa (camiseta y pantalón ceñidos o ropa deportiva), descalzo o con calzado plano.

**La IA puede observar:** Proporción relativa entre hombros, cintura y cadera; Relación visual entre largo de torso y de piernas; Simetría y caída de hombros; Cómo te queda la ropa que llevas.

**La IA no puede afirmar:** Medidas en centímetros; Peso, grasa corporal o edad; Tallas.

### Lateral, cuerpo entero (`lateral`)

- Misma distancia y altura de cámara que la frontal.
- De perfil, mirando al frente, brazos relajados sin tapar la silueta.
- Ropa: La misma ropa ajustada que en la frontal.

**La IA puede observar:** Postura (hombros adelantados, curvatura de la espalda); Volumen del perfil de pecho y abdomen; Caída de prendas por delante y por detrás.

**La IA no puede afirmar:** Medidas en centímetros; Diagnósticos posturales o de salud.

### Espalda, cuerpo entero (`espalda`)

- Misma distancia y altura de cámara que la frontal.
- De espaldas, brazos ligeramente separados.
- Ropa: La misma ropa ajustada que en la frontal.

**La IA puede observar:** Anchura relativa de espalda y hombros; Inclinación de hombros; Ajuste de la ropa en la espalda.

**La IA no puede afirmar:** Medidas en centímetros.

### Rostro con luz natural (`rostro`)

- De frente a una ventana, a mediodía si puedes; sin sombras duras en la cara.
- Pelo y barba visibles tal como los llevas.
- Sostén un folio blanco bajo la barbilla: sirve de referencia de color.
- Ropa: Camiseta blanca o gris, sin estampados cerca de la cara.

**La IA puede observar:** Contraste entre piel, pelo y ojos; Hipótesis de temperatura (cálida, fría o neutra); Profundidad e intensidad aparentes.

**La IA no puede afirmar:** Subtono definitivo: la cámara del móvil altera el color; Edad o rasgos de salud de la piel.

## Validación de la calidad

**1. En el navegador, antes de subirla** (`assessPhoto`). Si hay avisos, el usuario elige entre repetirla o subirla igualmente; el resultado se guarda en `body_photos.quality.client`.

| Comprobación | Umbral | Aviso |
|---|---|---|
| Resolución | lado menor < 600 px | Resolución baja |
| Orientación | horizontal en fotos de cuerpo entero | Debe ser vertical |
| Exposición | luminancia media < 60 o > 210 (0–255) | Demasiado oscura / sobreexpuesta |
| Contraste (no en rostro) | desviación de luminancia < 25 | Silueta poco distinguible |
| Nitidez | varianza del laplaciano < 40 (imagen a 256 px) | Desenfocada o movida |
| Dominante de color (solo rostro) | en las zonas claras casi neutras (fondo, folio blanco), desviación de un canal > 8 %; sin zonas neutras no se juzga (la piel no es una dominante) | No sirve para colorimetría |
| Sombras fuertes (solo rostro) | diferencia de luminancia entre mitades de la cara > 45 | Busca luz frontal y uniforme |
| Filtro o color alterado (solo rostro) | saturación media > 0.6 o < 0.04 | Sin filtros ni retoques / foto sin color |

**2. Por la IA, al analizar.** La IA devuelve primero `photo_quality` (utilizable o no, y por qué) para cada foto; las observaciones de fotos no utilizables se descartan y el motivo se muestra bajo la foto (`body_photos.quality.ai`). Los avisos del paso 1 se le pasan para que rebaje la confianza.

## Conservación y borrado

- Por defecto las fotos se conservan hasta que el usuario las quita (una a una o «Borrar todas mis fotos»).
- Opción «Borrar mis fotos después de cada análisis» (`profiles.delete_photos_after_analysis`): tras analizar se eliminan los ficheros y sus filas y se conservan solo los resultados estructurados (README 15).
- Borrar fotos no borra las observaciones ya generadas: siguen en el diagnóstico como hipótesis revisables.

## Temperatura cromática con la foto de rostro (BIS 2)

Desde la tarjeta «Temperatura cromática» del capítulo 03: instrucciones de captura → foto de rostro (con el control de calidad de arriba) → «Analizar mi temperatura cromática» (`/api/ai/analyze-temperature`, solo se envía esa foto) → resultado → el usuario confirma o corrige. Es el **subtono** de la piel, no la temperatura física.

**Contrato de la IA** (`TemperatureSchema`, Zod): `image_quality {suitable, issues[]}`, `temperature` (calida · fria · neutra · indeterminada), `secondary_tendency` (calida · fria · null), `confidence` (alta · media · baja), `observations[]`, `explanation`, `limitations[]`. Sin porcentajes de precisión.

**Reglas de la aplicación** (`finalizeTemperature`): la IA solo propone.

- Foto no apta según la IA → no hay conclusión; se explica el motivo y se pide otra foto.
- «Indeterminada» → «Sin información suficiente»: no se fuerza una categoría.
- Avisos graves del control previo (dark, bright, blurry, cast, shadow, filter) → confianza máxima **baja**. Otros avisos, avisos de la propia IA o foto sin control previo → máxima **media**. Si la aplicación rebaja la confianza, se indica.
- La tendencia secundaria solo se guarda si difiere de la principal (por ejemplo, «Neutra con tendencia cálida»).

**Datos y trazabilidad.** Cada estimación se guarda tal cual en `color_analyses` (temperatura, tendencia, confianza, explicación, observaciones, limitaciones, calidad de la IA y del navegador, foto analizada, modelo y fecha) y nunca se modifica. El dato vigente vive en `color_profiles`: `temperature`, `temperature_source` (ia = estimación confirmada · usuario = corregida o elegida), `temperature_status` (pendiente · recopilado · validado), `temperature_analysis_id`, `temperature_updated_at` y `temperature_validated_at`. **La IA nunca escribe `color_profiles`**: una estimación nueva que no coincida con el dato validado se muestra, pero no se aplica sin una nueva confirmación. Solo cambia la temperatura; intensidad, profundidad y contraste no se tocan.

**Privacidad.** Bucket privado `profile-private`, RLS por usuario, procesamiento en el servidor, sin URLs públicas; la foto se puede quitar y, con «borrar tras el análisis», se elimina después y se conserva solo el resultado (`photo_id` queda vacío; `photo_path` registra qué foto se analizó).

## Qué se guarda de cada análisis

- `observations`: área, título, observación, confianza (alta/media/baja), justificación y foto de origen. Son propuestas: entran en el diagnóstico como pendientes de revisión.
- `ai_runs.meta`: fotos usadas, fotos descartadas y número de observaciones descartadas.
