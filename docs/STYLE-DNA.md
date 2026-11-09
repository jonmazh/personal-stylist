# Identidad estética: catálogo de estilos y Style DNA

> Documento generado desde `lib/style/catalog.ts`, `lib/style/references.ts` y `lib/style/dna.ts` con `npm run docs`. No lo edites a mano.

## Principios

- **Un solo sistema.** Amplía el estudio de identidad estética del capítulo 04 y se versiona con el Style Blueprint: cada diagnóstico guarda una instantánea del Style DNA (`assessment_findings.details` de la conclusión «Style DNA») y la siguiente versión indica qué ha cambiado.
- **Identidad híbrida.** Estilo principal, secundarios e influencias con un % orientativo y editable. Los % describen preferencias, no una clasificación objetiva, y no limitan las recomendaciones.
- **Tres cosas que nunca se mezclan:** lo **declarado** por el usuario (identidad, elementos, marcas), lo **inferido** de sus valoraciones y referencias, y las **recomendaciones** del estilista (motor de diagnóstico).
- **Una valoración no es una preferencia.** Un patrón solo aparece si se repite en al menos 2 conjuntos distintos; la propuesta de identidad necesita 4 valoraciones.
- **Admirar ≠ vestir.** «Me gusta, pero no me lo pondría» no suma a la identidad: se guarda como admiración.
- **Sin scraping ni imágenes de terceros.** Las ilustraciones son originales y se generan desde código; las referencias propias las aporta el usuario; las marcas se describen por los rasgos que se les suelen asociar.
- **Catálogo ampliable.** Es un fichero de datos con ids estables: añadir, editar o relacionar un estilo no obliga a tocar la interfaz ni la base de datos.

## Escala de valoración

| Valoración | `rating` | Peso | Cuenta como querer vestirlo |
|---|---|---|---|
| Me encanta | `love` | +2 | Sí |
| Me gusta | `like` | +1 | Sí |
| Me representa | `represents` | +2,5 | Sí |
| Me gusta, pero no me lo pondría | `admire` | 0 | No |
| No me gusta | `dislike` | -1,5 | No |
| Me gusta algún elemento, pero no el conjunto | `element` | 0 | No |

«Me gusta algún elemento, pero no el conjunto» permite marcar qué elementos concretos gustan; cada uno suma +1,5 a ese elemento, no al estilo. Una referencia propia sin valorar cuenta como «Me gusta». Las valoraciones antiguas se convierten: «Me gustaría conseguir algo parecido» → «Me representa»; «No me lo pondría» → «No me gusta».

## Cómo se infiere el Style DNA

1. Cada valoración (galería) o referencia propia analizada se convierte en una señal: estilo, ajuste, estructura, formalidad, colores y elementos visuales.
2. **Propuesta de identidad:** suma de pesos por estilo (las marcas de referencia añaden 1,5 × su afinidad con cada estilo) → hasta 4 estilos con % en múltiplos de 5; el primero es principal, los de 20 % o más secundarios y el resto influencias.
3. **Patrones:** un elemento es «prefiere» si aparece en ≥ 2 conjuntos valorados positivamente y su puntuación es ≥ 2,5; «evita» si aparece en ≥ 2 conjuntos rechazados con puntuación ≤ −2,5. Las marcas nunca crean un patrón por sí solas.
4. **Admirados:** estilos marcados «Me gusta, pero no me lo pondría» que no suman a la identidad. **Descartados:** estilos con suma negativa.
5. **Identidad vigente:** la declarada si existe; si no, la propuesta (marcada como tal). Los elementos declarados mandan sobre los inferidos; un inferido que contradiga lo declarado se ignora.

## Integración con el resto de la aplicación

Punto de acceso único: `styleProfileOf(bundle)` devuelve `{ declared, inferred, identity, elements }`. Para puntuar una prenda, conjunto o producto: `styleFit(perfil, { style, elements })` → `{ score 0–100, match, reasons[] }`. Suma si representa una influencia (más cuanto más peso tiene), si es de un estilo relacionado o si tiene elementos que gustan; resta por elementos rechazados (más si son declarados) o estilos descartados. No es un filtro: combina influencias secundarias y explica por qué.

| Módulo | Uso |
|---|---|
| Armario digital (fase 2) | `styleFit` de cada prenda: a qué influencia representa y si encaja o choca. |
| Outfit Studio | Combinar la base (principal) con piezas de los secundarios e influencias. |
| Compras inteligentes y wishlist | `styleFit` del producto; marcas de referencia como pista de búsqueda, nunca como filtro. |
| Evolución personal | `evolution()` entre instantáneas de versiones del Blueprint. |
| Chat | Recibe la identidad declarada y lo inferido por separado. |

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

### Puntuación de compra (`purchase-eval@1`, reglas, sin IA)

| Criterio | Peso | De dónde sale |
|---|---|---|
| Compatibilidad con tu estilo | 20 | Compatibilidad personal (2C): identidad estética |
| Corte y proporciones | 20 | Compatibilidad personal (2C): proporciones y cortes preferidos |
| Compatibilidad cromática | 15 | Compatibilidad personal (2C): colorimetría |
| Combinabilidad con tu armario | 20 | Outfit Engine (3B) con el producto como prenda virtual; si se parece mucho a algo tuyo, solo cuentan las combinaciones nuevas |
| Adecuación a tus necesidades | 10 | Necesidad vinculada o abierta del mismo tipo (4A) y su prioridad; sin necesidad, es un deseo |
| Calidad y materiales documentados | 10 | Composición publicada y calidad documentada; nunca el precio |
| Relación calidad-precio | 5 | Precio frente a tu límite y coste por uso estimado |

Indicadores independientes (la puntuación no los oculta): compatibilidad con tu perfil, confianza de la evaluación, tallas, precio y bajadas, riesgo de duplicidad y combinaciones. Además se listan los **límites** (composición desconocida, sin analizar, datos de IA sin confirmar, precio o tallas sin verificar) y los **riesgos**.

### Redundancia

Se compara con tus prendas de la misma categoría (similitud de la auditoría 2D: tipo, color, corte, material, formalidad y función). Duplicidad alta si hay una casi idéntica o varias del mismo tipo y color. Se calcula qué aportaría: con cuántas prendas tuyas combinaría que hoy no combinas con la parecida, y en qué se diferencia.

### Veredicto

| Veredicto | Cuándo |
|---|---|
| Comprar | Encaja contigo, cubre una necesidad y aporta al armario. |
| Considerar | Puede merecer la pena, con matices que conviene revisar. |
| Esperar | Falta algo (talla, precio, datos o una necesidad más urgente) antes de decidir. |
| No comprar | No aporta lo suficiente a tu armario o no encaja contigo. |

Reglas: **no comprar** si duplica algo y apenas abre combinaciones nuevas, si puntúa menos de 45 o si el color no te favorece; **esperar** si está agotado o no queda tu talla, si no cubre ninguna necesidad y hay otra más urgente, o si el precio supera mucho tu límite; **comprar** con 75 o más, confianza media o alta, sin duplicidad y cubriendo una necesidad; si no, **considerar**. El texto explica por qué y, si procede, en qué invertir en su lugar.

### Talla

Se comparan las medidas (cm, mismo criterio) de una prenda tuya que te queda bien con la guía de medidas de la candidata (que copias tú de la web de la tienda). Medidas: parte inferior — cintura, cadera, muslo, tiro, entrepierna, bajo; parte superior — pecho, hombros, largo, manga, cintura. Tolerancia de 1 cm (2,5 cm en contornos si el tejido tiene elastano); quedarse corto en un contorno sin elasticidad pesa más. Confianza alta solo con 3 o más medidas, diferencias pequeñas y una talla claramente mejor. Sin medidas, como último recurso, la talla que te funciona en una prenda de la misma marca (confianza baja). Nunca se garantiza.

### Comparar

De 2 a 4 candidatos lado a lado, ordenados por puntuación de compra, con veredicto, criterios, límites y la mejor opción explicada. Si ninguno convence, lo dice: esperar también es una opción.

## Datos

Se amplían las tablas existentes, sin un sistema paralelo (migración `0005_style_identity.sql`):

| Qué | Dónde |
|---|---|
| Catálogo de estilos, subestilos relacionados, elementos y marcas | `lib/style/catalog.ts` (datos versionados con el código, ids estables) |
| Referencias visuales (galería) | `lib/style/references.ts` (ilustraciones generadas) |
| Valoraciones individuales | `style_reference_ratings` (`reference_id`, `rating`, `liked_elements`, `rated_at`) |
| Referencias propias y rasgos detectados por la IA | `style_references` (`ai_tags`: estilo, ajuste, estructura, formalidad, colores, elementos, prendas, patrón) |
| Influencias seleccionadas y su peso; preferencias confirmadas | `style_preferences` (`influences`, `liked_elements`, `rejected_elements`, `brand_refs`) |
| Fecha y versión de la identidad | `style_preferences` (`identity_version`, `identity_updated_at`) y la instantánea en cada versión del Blueprint |

## Elementos visuales

- **Silueta:** Parte de arriba oversize (`top-oversize`), Parte de arriba ajustada (`top-fitted`), Pantalón slim (`leg-slim`), Pantalón recto (`leg-straight`), Pantalón amplio (wide leg) (`leg-wide`), Pantalón baggy (`leg-baggy`), Pantalón de chándal o jogger (`leg-jogger`)
- **Prendas:** Camiseta gráfica (`graphic-tee`), Camiseta básica (`basic-tee`), Sudadera (`hoodie`), Chándal o chaqueta técnica (`tracksuit`), Plumífero (`puffer`), Cazadora de cuero (`leather`), Cazadora vaquera (`denim-jacket`), Cazadora varsity (`varsity`), Americana (`blazer`), Abrigo largo (`long-coat`), Sobrecamisa (`overshirt`), Punto (`knit`), Camisa (`shirt`), Polo (`polo`), Cuello alto (`turtleneck`), Camisa de cuadros (`flannel`), Cárdigan (`cardigan`), Pantalón cargo (`cargo`), Vaquero (`denim`), Pantalón de sastrería (`tailoring`)
- **Calzado:** Zapatilla limpia (`sneaker`), Zapatilla chunky (`chunky`), Zapatilla de running (`runner`), Zapatilla de skate (`skate`), Mocasín (`loafer`), Zapato de cordones (`derby`), Bota (`boot`)
- **Complementos:** Gorra (`cap`), Gorro (`beanie`), Cadena (`chain`), Bandolera (`crossbody`), Gafas de sol (`sunglasses`)
- **Color:** Monocromo (`monochrome`), Tonos tierra o tonal (`tonal`), Contraste claro-oscuro (`contrast`), Un color de acento (`accent`)
- **Construcción:** Capas y superposiciones (`layers`), Líneas limpias (`clean-lines`), Vintage o retro (`vintage`), Tejidos técnicos (`technical`)

## Universos de marca

Inspiración, no estilos. Cada marca orienta hacia rasgos visuales y estilos afines; el usuario puede marcarlas en «Mi identidad».

| Marca | Rasgos que se le suelen asociar | Estilos afines |
|---|---|---|
| Urban Outfitters | Mezcla de vintage y contemporáneo: oversize, denim, gráficas, capas y calzado urbano de aire retro. | Urban vintage, Retro streetwear, Skate inspired, Contemporary casual |
| Zara | Tendencia rápida y muy variada: desde sastrería actual hasta streetwear limpio, según la línea. | Contemporary casual, Casual tailoring, Clean streetwear |
| Massimo Dutti | Clásico cuidado: punto, camisa, sastrería relajada y tonos tierra. | Smart casual, Quiet luxury, Italian casual |
| COS | Minimalismo arquitectónico: volúmenes amplios, líneas limpias y paleta neutra. | Minimalismo contemporáneo, Urban minimalism, Contemporary essentials |
| Weekday | Denim y streetwear escandinavo: cortes amplios, básicos con actitud y mucho negro. | Clean streetwear, Urban minimalism, Contemporary essentials |
| Bershka | Urbano juvenil y de tendencia: baggy, gráficas, chándal y zapatilla protagonista. | Streetwear contemporáneo, Modern cani, Hip-hop inspired |
| Pull&Bear | Casual urbano relajado con guiños al surf y al skate. | Urban casual, Skate inspired, Contemporary casual |

## Catálogo de estilos

### Urbanos y contemporáneos

#### Urban casual (`urban-casual`)

Ropa de calle cómoda y combinable: básicos urbanos sin estridencias.

- **Características:** Básicos con algún detalle; Comodidad ante todo; Fácil de combinar
- **Siluetas habituales:** Arriba regular u holgado; Pantalón recto
- **Prendas características:** Sudadera, Camiseta, Vaquero recto, Cazadora ligera
- **Calzado y complementos:** Zapatilla limpia, Gorra
- **Paleta frecuente:** Gris, Negro, Blanco, Azul marino
- **Elementos visuales:** Sudadera, Camiseta básica, Vaquero, Pantalón recto, Zapatilla limpia
- **Relacionados:** Contemporary casual, Clean streetwear, Modern basics
- **Galería:** Sudadera gris, vaquero recto azul, zapatillas blancas y gorra · Cazadora vaquera, camiseta blanca, chino negro recto y zapatillas blancas

#### Streetwear contemporáneo (`streetwear-contemporaneo`)

La calle como pasarela: volúmenes amplios, gráficas y zapatillas protagonistas.

- **Características:** Volumen; Gráficas y logos; Zapatilla como pieza clave
- **Siluetas habituales:** Oversize arriba; Pantalón amplio o cargo
- **Prendas características:** Sudadera oversize, Camiseta gráfica, Cargo, Bomber
- **Calzado y complementos:** Zapatilla chunky o de running, Gorra, Bandolera
- **Paleta frecuente:** Negro, Gris, Blanco, Verde bosque
- **Elementos visuales:** Parte de arriba oversize, Sudadera, Camiseta gráfica, Pantalón cargo, Pantalón amplio (wide leg), Zapatilla chunky, Zapatilla de running
- **Relacionados:** Clean streetwear, Retro streetwear, Hip-hop inspired
- **Galería:** Sudadera negra amplia, pantalón cargo gris amplio y zapatillas de running blancas · Bomber verde bosque, camiseta blanca, vaquero negro amplio y zapatillas blancas

#### Clean streetwear (`clean-streetwear`)

Streetwear depurado: volúmenes urbanos con paleta neutra y sin ruido gráfico.

- **Características:** Neutros; Pocas gráficas; Proporciones cuidadas
- **Siluetas habituales:** Arriba holgado y limpio; Pantalón recto o amplio
- **Prendas características:** Sudadera lisa, Camiseta pesada, Pantalón amplio, Sobrecamisa
- **Calzado y complementos:** Zapatilla limpia, Gorro
- **Paleta frecuente:** Blanco, Gris, Negro, Beige
- **Elementos visuales:** Parte de arriba oversize, Sudadera, Pantalón amplio (wide leg), Zapatilla limpia, Líneas limpias, Monocromo
- **Relacionados:** Streetwear contemporáneo, Urban minimalism, Clean cani
- **Galería:** Sudadera cruda amplia y lisa, pantalón amplio gris claro, zapatillas blancas y gorro · Camiseta pesada negra amplia, vaquero negro amplio y zapatillas blancas

#### Clean cani (`clean-cani`)

La estética cani de barrio pasada por un filtro limpio: chándal conjuntado, monocromo y cuidado al detalle.

- **Características:** Chándal o prenda técnica conjuntada; Monocromo; Detalle cuidado (cadena, bandolera)
- **Siluetas habituales:** Arriba ajustado o regular; Pantalón de chándal o recto
- **Prendas características:** Chaqueta de chándal, Pantalón de chándal, Plumífero corto, Camiseta ajustada
- **Calzado y complementos:** Zapatilla de running, Cadena, Bandolera, Gorra
- **Paleta frecuente:** Negro, Blanco, Gris
- **Elementos visuales:** Chándal o chaqueta técnica, Pantalón de chándal o jogger, Zapatilla de running, Cadena, Bandolera, Monocromo, Parte de arriba ajustada
- **Relacionados:** Modern cani, Sporty urban, Clean streetwear
- **Galería:** Chándal negro conjuntado, camiseta blanca, zapatillas de running blancas, cadena y bandolera · Camiseta blanca ajustada, pantalón de chándal gris con raya, zapatillas de running negras, gorra y bandolera

#### Modern cani (`modern-cani`)

El código cani actualizado con piezas técnicas, plumíferos y siluetas actuales.

- **Características:** Técnico; Plumífero; Zapatilla de running
- **Siluetas habituales:** Arriba voluminoso (plumífero); Pantalón de chándal ajustado al tobillo
- **Prendas características:** Plumífero, Chándal técnico, Cuello alto técnico
- **Calzado y complementos:** Zapatilla de running, Bandolera, Gorra, Cadena
- **Paleta frecuente:** Negro, Gris, Blanco, Azul marino
- **Elementos visuales:** Plumífero, Chándal o chaqueta técnica, Pantalón de chándal o jogger, Zapatilla de running, Tejidos técnicos, Bandolera
- **Relacionados:** Clean cani, Sporty urban, Streetwear contemporáneo
- **Galería:** Plumífero negro corto, sudadera gris, pantalón de chándal gris, zapatillas de running negras y bandolera · Chaqueta técnica azul marino, cuello alto negro, jogger negro, zapatillas de running blancas, gorra y cadena

#### Urban minimalism (`urban-minimalism`)

Ciudad y minimalismo: negros y grises, cortes amplios y nada que sobre.

- **Características:** Monocromo oscuro; Volumen controlado; Sin logos
- **Siluetas habituales:** Arriba amplio; Pantalón amplio
- **Prendas características:** Abrigo largo, Camiseta pesada, Pantalón amplio
- **Calzado y complementos:** Zapatilla limpia negra o bota
- **Paleta frecuente:** Negro, Gris, Blanco
- **Elementos visuales:** Monocromo, Líneas limpias, Pantalón amplio (wide leg), Abrigo largo, Parte de arriba oversize
- **Relacionados:** Clean streetwear, Minimalismo contemporáneo, Contemporary essentials
- **Galería:** Abrigo largo negro, camiseta negra, pantalón amplio negro y zapatillas negras · Camiseta pesada antracita amplia, pantalón amplio gris y botas negras

#### Skate inspired (`skate-inspired`)

Funcional y despreocupado: pantalón amplio, gráficas y zapatilla de skate.

- **Características:** Holgura; Gráficas; Ropa que aguanta
- **Siluetas habituales:** Arriba holgado; Pantalón baggy o amplio
- **Prendas características:** Camiseta gráfica, Camisa de cuadros, Vaquero baggy, Sudadera
- **Calzado y complementos:** Zapatilla de skate, Gorro
- **Paleta frecuente:** Azul marino, Beige, Negro, Rojo
- **Elementos visuales:** Camiseta gráfica, Pantalón baggy, Zapatilla de skate, Camisa de cuadros, Gorro, Vaquero
- **Relacionados:** Retro streetwear, Urban vintage, Streetwear contemporáneo
- **Galería:** Camisa de cuadros abierta, camiseta gráfica blanca, vaquero baggy claro, zapatillas de skate negras y gorro · Sudadera azul marino, cargo beige baggy, zapatillas de skate y gorra

#### Sporty urban (`sporty-urban`)

Prendas deportivas fuera del gimnasio, combinadas con intención.

- **Características:** Técnico; Deportivo; Cómodo
- **Siluetas habituales:** Arriba regular; Jogger o pantalón técnico
- **Prendas características:** Chaqueta técnica, Jogger, Sudadera, Camiseta técnica
- **Calzado y complementos:** Zapatilla de running, Gorra
- **Paleta frecuente:** Negro, Gris, Blanco, Azul marino
- **Elementos visuales:** Chándal o chaqueta técnica, Pantalón de chándal o jogger, Zapatilla de running, Tejidos técnicos, Gorra
- **Relacionados:** Clean cani, Modern cani, Urban casual
- **Galería:** Chaqueta técnica negra, camiseta gris, jogger negro, zapatillas de running blancas y gorra · Sudadera gris y jogger gris con raya, zapatillas de running blancas

#### Hip-hop inspired (`hip-hop-inspired`)

Volumen generoso, denim amplio y complementos con presencia.

- **Características:** Muy holgado; Denim; Complementos visibles
- **Siluetas habituales:** Oversize marcado; Vaquero baggy
- **Prendas características:** Camiseta XL, Varsity, Vaquero baggy, Sudadera
- **Calzado y complementos:** Zapatilla chunky, Cadena, Gorra
- **Paleta frecuente:** Negro, Blanco, Azul marino, Rojo
- **Elementos visuales:** Parte de arriba oversize, Pantalón baggy, Vaquero, Cadena, Gorra, Zapatilla chunky, Cazadora varsity
- **Relacionados:** Streetwear contemporáneo, Retro streetwear, Skate inspired
- **Galería:** Camiseta blanca oversize, vaquero baggy azul, zapatillas chunky blancas, cadena y gorra · Cazadora varsity burdeos, sudadera negra, vaquero baggy negro y zapatillas chunky blancas

#### Contemporary casual (`contemporary-casual`)

Casual actual: prendas del momento combinadas con sencillez.

- **Características:** Actual; Sencillo; Versátil
- **Siluetas habituales:** Arriba regular o relajado; Pantalón recto
- **Prendas características:** Sobrecamisa, Camiseta, Vaquero recto, Punto
- **Calzado y complementos:** Zapatilla limpia
- **Paleta frecuente:** Azul marino, Blanco, Beige, Gris
- **Elementos visuales:** Sobrecamisa, Camiseta básica, Vaquero, Pantalón recto, Zapatilla limpia
- **Relacionados:** Urban casual, Elevated casual, Modern basics
- **Galería:** Sobrecamisa beige, camiseta blanca, vaquero recto azul y zapatillas blancas · Jersey azul marino, vaquero recto azul y zapatillas blancas

### Minimalistas y modernos

#### Minimalismo contemporáneo (`minimalismo-contemporaneo`)

Menos prendas, mejor elegidas: líneas puras y paleta corta.

- **Características:** Líneas limpias; Paleta corta; Calidad sobre cantidad
- **Siluetas habituales:** Regular o algo amplio; Pantalón recto
- **Prendas características:** Punto fino, Pantalón de sastrería, Abrigo sin adornos
- **Calzado y complementos:** Zapato de cordones, Zapatilla limpia
- **Paleta frecuente:** Negro, Blanco, Gris, Beige
- **Elementos visuales:** Líneas limpias, Monocromo, Punto, Pantalón de sastrería, Pantalón recto
- **Relacionados:** Scandinavian minimalism, Clean aesthetic, Urban minimalism
- **Galería:** Jersey fino negro, pantalón de sastrería gris recto y zapatos negros · Abrigo gris claro, camiseta blanca, pantalón negro recto y zapatillas blancas

#### Clean aesthetic (`clean-aesthetic`)

Pulcro y luminoso: blancos, cremas y prendas impecables.

- **Características:** Pulcritud; Tonos claros; Ajuste exacto
- **Siluetas habituales:** Regular; Pantalón recto
- **Prendas características:** Camiseta blanca, Camisa, Chino claro, Punto
- **Calzado y complementos:** Zapatilla blanca, Mocasín
- **Paleta frecuente:** Blanco, Beige, Gris, Azul claro
- **Elementos visuales:** Líneas limpias, Camiseta básica, Zapatilla limpia, Pantalón recto, Tonos tierra o tonal
- **Relacionados:** Minimalismo contemporáneo, Modern basics, Quiet luxury
- **Galería:** Camiseta blanca, chino crudo recto y zapatillas blancas · Camisa azul claro, chino beige y mocasines camel

#### Modern basics (`modern-basics`)

Un armario de básicos actuales que se combinan todos entre sí.

- **Características:** Básicos; Versatilidad; Sin estridencias
- **Siluetas habituales:** Regular; Recto
- **Prendas características:** Camiseta, Sudadera lisa, Chino, Vaquero
- **Calzado y complementos:** Zapatilla limpia
- **Paleta frecuente:** Azul marino, Gris, Blanco, Negro
- **Elementos visuales:** Camiseta básica, Pantalón recto, Zapatilla limpia, Líneas limpias
- **Relacionados:** Contemporary essentials, Clean aesthetic, Urban casual
- **Galería:** Camiseta azul marino, chino beige recto y zapatillas blancas · Sudadera gris, vaquero oscuro recto y zapatillas blancas

#### Scandinavian minimalism (`scandinavian-minimalism`)

Minimalismo nórdico: funcional, sobrio y con texturas naturales.

- **Características:** Funcional; Texturas naturales; Sobriedad
- **Siluetas habituales:** Regular; Abrigo largo
- **Prendas características:** Abrigo de lana, Punto grueso, Pantalón recto, Sobrecamisa
- **Calzado y complementos:** Bota, Zapatilla limpia
- **Paleta frecuente:** Gris, Negro, Blanco, Beige
- **Elementos visuales:** Abrigo largo, Punto, Líneas limpias, Monocromo, Bota
- **Relacionados:** Minimalismo contemporáneo, Contemporary essentials, Urban minimalism
- **Galería:** Camiseta blanca, sobrecamisa gris, chino crudo y zapatillas blancas · Abrigo largo antracita, jersey negro, pantalón negro recto y botas negras

#### Elevated casual (`elevated-casual`)

Casual subido de nivel: prendas cómodas con tejido y ajuste de calidad.

- **Características:** Casual bien hecho; Tejidos con presencia; Ajuste cuidado
- **Siluetas habituales:** Regular; Pantalón recto
- **Prendas características:** Sobrecamisa, Punto, Vaquero oscuro, Camisa
- **Calzado y complementos:** Zapatilla limpia, Zapato de cordones
- **Paleta frecuente:** Azul marino, Camel, Blanco, Gris
- **Elementos visuales:** Sobrecamisa, Punto, Vaquero, Zapatilla limpia, Capas y superposiciones
- **Relacionados:** Contemporary casual, Smart casual, Quiet luxury
- **Galería:** Sobrecamisa azul marino, camiseta blanca, vaquero oscuro ajustado y zapatillas blancas · Jersey camel sobre camisa blanca, pantalón antracita y zapatos marrones

#### Contemporary essentials (`contemporary-essentials`)

Los imprescindibles de hoy en versión actual: algo más amplios y limpios.

- **Características:** Esenciales; Volumen actual; Neutros
- **Siluetas habituales:** Algo amplio arriba; Pantalón amplio
- **Prendas características:** Camiseta pesada, Pantalón amplio, Abrigo
- **Calzado y complementos:** Zapatilla limpia
- **Paleta frecuente:** Beige, Gris, Negro, Blanco
- **Elementos visuales:** Camiseta básica, Pantalón amplio (wide leg), Líneas limpias, Tonos tierra o tonal
- **Relacionados:** Modern basics, Urban minimalism, Scandinavian minimalism
- **Galería:** Camiseta pesada beige amplia, pantalón amplio crudo y zapatillas blancas · Abrigo camel, sudadera gris, pantalón amplio negro y zapatillas blancas

### Clásicos y sofisticados

#### Old money (`old-money`)

Elegancia heredada: punto, sastrería relajada y nada de logos.

- **Características:** Sin logos; Punto y sastrería; Tonos crema y marino
- **Siluetas habituales:** Regular o amplio; Pantalón de pinzas
- **Prendas características:** Jersey de punto, Camisa, Pantalón de pinzas, Americana
- **Calzado y complementos:** Mocasín
- **Paleta frecuente:** Beige, Azul marino, Blanco, Camel
- **Elementos visuales:** Punto, Camisa, Pantalón de sastrería, Mocasín, Tonos tierra o tonal
- **Relacionados:** Quiet luxury, Preppy contemporáneo, Classic contemporary
- **Galería:** Jersey crudo sobre camisa blanca, pantalón amplio azul marino y mocasines marrones · Americana azul marino, camisa azul claro, pantalón de franela gris y mocasines negros

#### Quiet luxury (`quiet-luxury`)

Lujo que no se anuncia: tejido excelente, corte perfecto y paleta silenciosa.

- **Características:** Tejido de calidad; Corte exacto; Paleta silenciosa
- **Siluetas habituales:** Regular; Pantalón recto
- **Prendas características:** Punto fino, Abrigo, Pantalón de sastrería, Polo de punto
- **Calzado y complementos:** Mocasín, Zapato de cordones
- **Paleta frecuente:** Camel, Beige, Gris, Azul marino
- **Elementos visuales:** Punto, Pantalón de sastrería, Mocasín, Tonos tierra o tonal, Líneas limpias
- **Relacionados:** Old money, Classic contemporary, Clean aesthetic
- **Galería:** Polo de punto camel, pantalón de sastrería gris recto y mocasines marrones · Abrigo camel, cuello alto crudo, pantalón beige recto y zapatos marrones

#### Classic contemporary (`classic-contemporary`)

Lo clásico con cortes de hoy: americana, camisa y pantalón bien ajustados.

- **Características:** Estructura; Clásico actualizado; Formalidad media-alta
- **Siluetas habituales:** Regular; Pantalón recto
- **Prendas características:** Americana, Camisa, Pantalón de vestir, Abrigo
- **Calzado y complementos:** Mocasín, Zapato de cordones
- **Paleta frecuente:** Azul marino, Gris, Blanco, Camel
- **Elementos visuales:** Americana, Camisa, Pantalón de sastrería, Mocasín, Zapato de cordones
- **Relacionados:** Smart casual, Old money, Casual tailoring
- **Galería:** Americana azul marino, camisa blanca, pantalón de vestir gris y mocasines marrones · Abrigo camel, jersey gris, pantalón de vestir azul marino y zapatos negros

#### Italian casual (`italian-casual`)

Sprezzatura: elegancia relajada, colores cálidos y prendas que respiran.

- **Características:** Relajado pero cuidado; Colores cálidos; Tejidos ligeros
- **Siluetas habituales:** Regular; Pantalón de pinzas amplio
- **Prendas características:** Americana desestructurada, Polo de punto, Pantalón de pinzas, Camisa
- **Calzado y complementos:** Mocasín, Gafas de sol
- **Paleta frecuente:** Beige, Azul claro, Oliva, Marrón
- **Elementos visuales:** Polo, Pantalón de sastrería, Mocasín, Tonos tierra o tonal, Gafas de sol
- **Relacionados:** Casual tailoring, Quiet luxury, Old money
- **Galería:** Americana beige desestructurada, camisa azul claro, pantalón blanco y mocasines marrones · Polo de punto oliva, pantalón amplio crudo con pinzas y mocasines marrones

#### Smart casual (`smart-casual`)

Entre la oficina y el fin de semana: arreglado sin traje.

- **Características:** Arreglado sin traje; Versátil; Formalidad media
- **Siluetas habituales:** Regular; Chino o recto
- **Prendas características:** Americana, Camisa oxford, Chino, Punto
- **Calzado y complementos:** Zapato de cordones, Zapatilla limpia
- **Paleta frecuente:** Azul marino, Blanco, Beige, Gris
- **Elementos visuales:** Americana, Camisa, Pantalón recto, Zapato de cordones, Zapatilla limpia
- **Relacionados:** Classic contemporary, Elevated casual, Casual tailoring
- **Galería:** Americana gris, camisa oxford azul claro, chino azul marino y zapatos marrones · Jersey gris sobre camisa azul claro, chino azul marino y zapatos marrones

#### Casual tailoring (`casual-tailoring`)

Sastrería sin rigidez: americana con camiseta, pantalón de pinzas y zapatilla.

- **Características:** Sastrería relajada; Mezcla formal-informal; Volumen suave
- **Siluetas habituales:** Regular o amplio; Pantalón de pinzas
- **Prendas características:** Americana desestructurada, Camiseta, Pantalón de pinzas
- **Calzado y complementos:** Zapatilla limpia, Mocasín
- **Paleta frecuente:** Gris, Beige, Azul marino, Blanco
- **Elementos visuales:** Americana, Camiseta básica, Pantalón de sastrería, Pantalón amplio (wide leg), Zapatilla limpia
- **Relacionados:** Smart casual, Italian casual, Editorial casual
- **Galería:** Americana beige desestructurada, camiseta blanca, pantalón de pinzas gris amplio y zapatillas blancas · Americana azul marino, camiseta negra, pantalón de pinzas antracita amplio y mocasines negros

#### Preppy contemporáneo (`preppy-contemporaneo`)

El universitario americano puesto al día: oxford, punto y chino.

- **Características:** Capas de punto sobre camisa; Colores de colegio; Pulcro
- **Siluetas habituales:** Regular; Chino recto
- **Prendas características:** Camisa oxford, Jersey, Chino, Polo, Varsity
- **Calzado y complementos:** Mocasín, Zapatilla blanca
- **Paleta frecuente:** Azul marino, Blanco, Beige, Burdeos
- **Elementos visuales:** Punto, Camisa, Polo, Mocasín, Capas y superposiciones
- **Relacionados:** Old money, Smart casual, Retro streetwear
- **Galería:** Jersey azul marino sobre camisa oxford blanca, chino beige y mocasines marrones · Polo burdeos, chino blanco ajustado y zapatillas blancas

### Alternativos y de inspiración editorial

#### Vintage contemporary (`vintage-contemporary`)

Prendas con aire de otra época mezcladas con básicos actuales.

- **Características:** Mezcla de épocas; Texturas gastadas; Tonos tierra
- **Siluetas habituales:** Regular o amplio; Recto o amplio
- **Prendas características:** Cazadora de cuero, Camisa de cuadros, Vaquero lavado, Punto
- **Calzado y complementos:** Bota, Zapatilla retro
- **Paleta frecuente:** Marrón, Camel, Oliva, Azul marino
- **Elementos visuales:** Vintage o retro, Cazadora de cuero, Vaquero, Tonos tierra o tonal, Bota
- **Relacionados:** Urban vintage, Retro streetwear, Indie aesthetic
- **Galería:** Cazadora de cuero marrón, camiseta blanca, vaquero lavado recto y botas marrones · Camisa de cuadros marrón, chino camel recto y botas marrones

#### Retro streetwear (`retro-streetwear`)

El streetwear de los 90 y 2000 recuperado: varsity, denim y zapatilla retro.

- **Características:** Referencias de los 90; Color; Gráficas
- **Siluetas habituales:** Holgado; Vaquero amplio
- **Prendas características:** Varsity, Camiseta gráfica, Vaquero amplio, Chaqueta de chándal retro
- **Calzado y complementos:** Zapatilla retro, Gorra
- **Paleta frecuente:** Burdeos, Blanco, Azul marino, Verde bosque
- **Elementos visuales:** Cazadora varsity, Camiseta gráfica, Vintage o retro, Pantalón amplio (wide leg), Un color de acento, Zapatilla limpia
- **Relacionados:** Streetwear contemporáneo, Vintage contemporary, Hip-hop inspired
- **Galería:** Cazadora varsity azul marino, camiseta gráfica blanca, vaquero amplio azul, zapatillas blancas y gorra · Chaqueta de chándal retro burdeos, camiseta blanca, vaquero amplio claro y zapatillas blancas

#### Indie aesthetic (`indie-aesthetic`)

Guitarras y fanzines: ajustado, capas y un punto descuidado a propósito.

- **Características:** Ajustado; Capas; Descuidado con intención
- **Siluetas habituales:** Ajustado arriba; Pantalón slim
- **Prendas características:** Camisa de cuadros, Cazadora vaquera, Camiseta, Vaquero slim
- **Calzado y complementos:** Bota, Zapatilla de lona
- **Paleta frecuente:** Negro, Burdeos, Azul marino, Gris
- **Elementos visuales:** Parte de arriba ajustada, Pantalón slim, Camisa de cuadros, Cazadora vaquera, Bota, Capas y superposiciones
- **Relacionados:** Grunge moderno, Vintage contemporary, Urban vintage
- **Galería:** Cazadora vaquera, camiseta negra ajustada, vaquero negro slim y botas negras · Camisa de cuadros burdeos ajustada, vaquero slim azul y botas negras

#### Grunge moderno (`grunge-moderno`)

El grunge actualizado: negro, cuero, cuadros y capas.

- **Características:** Negro dominante; Cuero y cuadros; Capas
- **Siluetas habituales:** Arriba holgado; Pantalón recto o amplio
- **Prendas características:** Cazadora de cuero, Camisa de cuadros, Camiseta, Vaquero negro
- **Calzado y complementos:** Bota, Cadena
- **Paleta frecuente:** Negro, Gris, Burdeos
- **Elementos visuales:** Cazadora de cuero, Camisa de cuadros, Capas y superposiciones, Bota, Monocromo, Cadena
- **Relacionados:** Indie aesthetic, Vintage contemporary, Urban minimalism
- **Galería:** Cazadora de cuero negra sobre camisa de cuadros burdeos, vaquero negro recto, botas negras y cadena · Camisa de cuadros gris abierta, camiseta negra amplia, vaquero negro amplio y botas negras

#### Workwear contemporáneo (`workwear-contemporaneo`)

Ropa de trabajo con estética actual: lona, bolsillos y botas.

- **Características:** Resistencia; Bolsillos y costuras; Tonos tierra
- **Siluetas habituales:** Regular o amplio; Pantalón recto o cargo
- **Prendas características:** Chaqueta de trabajo, Sobrecamisa, Cargo, Vaquero crudo
- **Calzado y complementos:** Bota, Gorro
- **Paleta frecuente:** Oliva, Marrón, Azul marino, Beige
- **Elementos visuales:** Sobrecamisa, Pantalón cargo, Vaquero, Bota, Tonos tierra o tonal
- **Relacionados:** Vintage contemporary, Urban vintage, Contemporary casual
- **Galería:** Chaqueta de trabajo azul marino, camiseta cruda, vaquero oscuro recto y botas marrones · Sobrecamisa oliva, camiseta blanca, pantalón cargo caqui y botas marrones

#### Urban vintage (`urban-vintage`)

Segunda mano con criterio: denim, gráficas desgastadas y capas urbanas.

- **Características:** Segunda mano; Gráficas gastadas; Capas
- **Siluetas habituales:** Holgado; Vaquero amplio
- **Prendas características:** Cazadora vaquera, Camiseta gráfica, Sudadera, Vaquero amplio
- **Calzado y complementos:** Zapatilla retro, Gorro
- **Paleta frecuente:** Azul marino, Marrón, Beige, Gris
- **Elementos visuales:** Vintage o retro, Cazadora vaquera, Camiseta gráfica, Pantalón amplio (wide leg), Capas y superposiciones
- **Relacionados:** Vintage contemporary, Skate inspired, Retro streetwear
- **Galería:** Cazadora vaquera lavada, sudadera gris, vaquero amplio azul, zapatillas blancas y gorro · Camiseta gráfica negra amplia, cargo marrón amplio y zapatillas crudas

#### Editorial casual (`editorial-casual`)

Casual con mirada de revista: proporciones estudiadas y una pieza inesperada.

- **Características:** Proporciones estudiadas; Pieza inesperada; Paleta pensada
- **Siluetas habituales:** Juego de volúmenes; Pantalón amplio
- **Prendas características:** Cuello alto, Abrigo largo, Pantalón amplio, Cárdigan
- **Calzado y complementos:** Mocasín, Bota
- **Paleta frecuente:** Camel, Negro, Gris, Burdeos
- **Elementos visuales:** Cuello alto, Abrigo largo, Pantalón amplio (wide leg), Cárdigan, Un color de acento
- **Relacionados:** Casual tailoring, Minimalismo contemporáneo, Vintage contemporary
- **Galería:** Abrigo largo camel, cuello alto negro, pantalón amplio negro y mocasines negros · Cárdigan burdeos, camiseta blanca, pantalón amplio gris y zapatos marrones

Total: 30 estilos y 60 conjuntos ilustrados.
