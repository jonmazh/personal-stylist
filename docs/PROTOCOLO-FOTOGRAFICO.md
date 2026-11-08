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
| Contraste | desviación de luminancia < 25 | Silueta poco distinguible |
| Nitidez | varianza del laplaciano < 40 (imagen a 256 px) | Desenfocada o movida |
| Dominante de color (solo rostro) | desviación de un canal > 16 % | No sirve para colorimetría |

**2. Por la IA, al analizar.** La IA devuelve primero `photo_quality` (utilizable o no, y por qué) para cada foto; las observaciones de fotos no utilizables se descartan y el motivo se muestra bajo la foto (`body_photos.quality.ai`). Los avisos del paso 1 se le pasan para que rebaje la confianza.

## Qué se guarda de cada análisis

- `observations`: área, título, observación, confianza (alta/media/baja), justificación y foto de origen. Son propuestas: entran en el diagnóstico como pendientes de revisión.
- `ai_runs.meta`: fotos usadas, fotos descartadas y número de observaciones descartadas.
