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
| 2B · Garment AI | Análisis de visión, prompt especializado, esquema, revisión y confirmación (`garment_analyses`) | Pendiente |
| 2C · Evaluación personal | Compatibilidad con el Blueprint, Fit Assessment, decisiones | Pendiente |
| 2D · Auditoría | Duplicados, huecos, informes | Pendiente |

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

## Datos (migración `0007_wardrobe_base.sql`)

| Tabla | Responsabilidad | Subfase |
|---|---|---|
| `garments` | Registro principal (evoluciona la tabla mínima de la fase 1: CHECK, índices por usuario/categoría/estado, `updated_at` con disparador, `field_sources`) | 2A |
| `garment_images` | Fotos, función, dimensiones y hash | 2A |
| `garment_events` | Incorporaciones, cambios campo a campo, estados, fotos | 2A |
| `garment_analyses` | Resultados de IA versionados (modelo, versión de prompt y de esquema, estado) | 2B |
| `garment_fit_reviews`, `garment_decisions` | Ajuste real y decisiones (conservar, modificar, revisar, sustituir, donar/vender) | 2C |
| `wardrobe_audits`, `wardrobe_audit_findings` | Auditorías y hallazgos | 2D |

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

Las rutas de análisis, confirmación, Fit Assessment y auditoría llegan en 2B–2D. La interfaz usa el mismo servicio (`lib/wardrobe/service.ts`) mediante acciones del servidor.
