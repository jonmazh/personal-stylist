/**
 * Genera docs/CUESTIONARIO.md y docs/PROTOCOLO-FOTOGRAFICO.md desde el codigo (npm run docs).
 * La prueba tests/docs.test.ts falla si los documentos no estan al dia.
 */
import { writeFileSync } from 'node:fs'
import { AREAS } from '@/lib/profile/areas'
import { QUESTIONS, type Question } from '@/lib/profile/questionnaire'
import { GARMENT_FIELDS, GARMENT_LABEL } from '@/lib/profile/summary'
import { COMMON_RULES, PHOTO_PROTOCOL } from '@/lib/photos/protocol'
import { THRESHOLDS } from '@/lib/photos/quality'
import { RULES } from '@/lib/diagnosis/rules'
import { OUTFITS, RATINGS, outfitsOf } from '@/lib/style/references'
import { MIN_EVIDENCE, MIN_RATED } from '@/lib/style/dna'
import { BRAND_UNIVERSES, ELEMENTS, ELEMENT_GROUPS, STYLE_CATALOG, STYLE_GROUPS, elementLabel, styleName } from '@/lib/style/catalog'
import { CONFIDENCE_LABEL, CONFIDENCE_RULE, SECTIONS, buildFindings, type Confidence } from '@/lib/profile/blueprint'
import { PHOTO_ANALYSIS, STYLIST_PERSONA, TEMPERATURE_ANALYSIS } from '@/lib/ai/prompts'
import { SERIOUS_ISSUES } from '@/lib/color/temperature'
import { ATTRIBUTES, COMPOSITION_SOURCES, CONDITIONS, CUTS, GARMENT_COLORS, GROUPS, IMAGE_ROLES, PATTERNS, STATUSES, SUBS } from '@/lib/wardrobe/taxonomy'
import type { Bundle } from '@/lib/profile/data'
import { DECISIONS, MIN_WARDROBE, WEIGHTS } from '@/lib/wardrobe/compatibility'
import { FIT_ASSESSOR, FIT_DIMENSIONS, FIT_PROMPT_VERSION, MAX_WORN } from '@/lib/wardrobe/fit'
import { ANALYSIS_ROLES, GARMENT_ANALYST, MAX_IMAGES, PROMPT_VERSION, SCHEMA_VERSION } from '@/lib/wardrobe/analysis'

const KIND: Record<Question['kind'], string> = {
  number: 'Número', text: 'Texto', textarea: 'Texto libre', single: 'Una opción', multi: 'Varias opciones', slider: 'Deslizador 0–100', percent: 'Porcentaje', measure: 'Medida (cm)',
}
const cell = (s: string) => s.replace(/\|/g, '\\|')
const answers = (q: Question) =>
  q.options ? q.options.join(' · ') + (q.max ? ` (máx. ${q.max})` : '')
  : q.kind === 'slider' ? `${q.ends![0]} (0) ↔ ${q.ends![1]} (100); 50 = sin preferencia`
  : q.kind === 'percent' ? '0–100 en pasos de 5; el grupo debe sumar 100 %'
  : q.kind === 'measure' ? '1–299 cm' : q.unit ? `Número (${q.unit})` : 'Libre'
const storage = (q: Question) => storageBase(q) + (q.external ? ` — ${q.external}` : '')
const storageBase = (q: Question) =>
  q.kind === 'measure' ? `\`body_measurements\` (key=\`${q.store.key}\`, value_cm; histórico con fecha)`
  : `\`${q.store.table}.${q.store.column}${q.store.key ? `.${q.store.key}` : ''}\`${q.store.key ? ' (jsonb)' : ''}`

export function questionnaireDoc() {
  const out = [
    '# Cuestionario de incorporación',
    '',
    '> Documento generado desde `lib/profile/questionnaire.ts` con `npm run docs`. No lo edites a mano: cambia el código y regenéralo.',
    '',
    'Cada pregunta indica sus respuestas posibles, qué información pretende extraer, dónde se guarda y qué conclusión del Style Blueprint (o del chat) alimenta.',
    'El servidor solo acepta opciones de la lista, descarta medidas fuera de rango y avisa si el reparto del estilo de vida no suma 100 %.',
    'Un capítulo pasa a **En curso** cuando tiene alguna respuesta con información (un deslizador en 50 o un 0 % no cuentan) y a **Validado** cuando el usuario lo confirma.',
    '',
  ]
  AREAS.forEach((a, i) => {
    out.push(`## ${String(i + 1).padStart(2, '0')} · ${a.name}`, '', `_${a.intro}_`, '')
    out.push('| Pregunta | Tipo | Respuestas | Qué extrae | Se guarda en | Alimenta |', '|---|---|---|---|---|---|')
    for (const q of QUESTIONS.filter((x) => x.area === a.id))
      out.push(`| ${cell(q.label)} | ${KIND[q.kind]} | ${cell(answers(q))} | ${cell(q.extracts)} | ${storage(q)} | ${cell(q.feeds)} |`)
    if (a.id === 'a2') out.push('', 'Las fotografías de este capítulo siguen el [protocolo fotográfico](PROTOCOLO-FOTOGRAFICO.md).')
    if (a.id === 'a4') {
      out.push('', '### Identidad estética, catálogo de estilos y Style DNA', '',
        `Además de los ejes y los límites, el capítulo 04 incluye el catálogo de ${STYLE_CATALOG.length} estilos con su galería valorable, la identidad híbrida declarada (influencias con rol y %, elementos que quiere o rechaza, marcas de referencia), referencias propias analizadas por la IA y el Style DNA inferido. Todo está documentado en [STYLE-DNA.md](STYLE-DNA.md).`, '')
    }
    if (a.id === 'a6') {
      out.push('', '### Prendas de referencia', '', 'Prendas que ya le quedan bien, medidas en plano (medidas de prenda, no corporales). Tabla `reference_garments` (`category`, `name`, `measurements` jsonb, `notes`).', '')
      out.push('| Tipo | Medidas que se piden (cm) |', '|---|---|')
      for (const [k, f] of Object.entries(GARMENT_FIELDS)) out.push(`| ${GARMENT_LABEL[k]} | ${f.map(([, l]) => l).join(', ')} |`)
      out.push('', 'Alimentan: Cortes que funcionan; comparación de tallas en compras (fase 4).')
    }
    out.push('')
  })
  return out.join('\n')
}

export function protocolDoc() {
  const T = THRESHOLDS
  const out = [
    '# Protocolo fotográfico',
    '',
    '> Documento generado desde `lib/photos/protocol.ts` y `lib/photos/quality.ts` con `npm run docs`. No lo edites a mano.',
    '',
    'Las fotos son **opcionales**. Antes de la primera hay que aceptar cómo se tratan (`profiles.photo_consent_at`).',
    'Se guardan en el bucket privado `profile-private`, reducidas a 1024 px y recodificadas en JPEG (lo que elimina los metadatos, incluida la ubicación GPS).',
    'Solo se envían al proveedor de IA cuando el usuario pulsa «Analizar».',
    '',
    '## Reglas comunes',
    '',
    ...COMMON_RULES.map((r) => `- ${r}`),
    '',
    '## Fotografías',
    '',
  ]
  for (const p of PHOTO_PROTOCOL) {
    out.push(`### ${p.title} (\`${p.kind}\`)`, '', ...p.how.map((h) => `- ${h}`), `- Ropa: ${p.clothing}`, '',
      `**La IA puede observar:** ${p.canAnalyze.join('; ')}.`, '', `**La IA no puede afirmar:** ${p.cannotAnalyze.join('; ')}.`, '')
  }
  out.push(
    '## Validación de la calidad',
    '',
    '**1. En el navegador, antes de subirla** (`assessPhoto`). Si hay avisos, el usuario elige entre repetirla o subirla igualmente; el resultado se guarda en `body_photos.quality.client`.',
    '',
    '| Comprobación | Umbral | Aviso |', '|---|---|---|',
    `| Resolución | lado menor < ${T.minSide} px | Resolución baja |`,
    '| Orientación | horizontal en fotos de cuerpo entero | Debe ser vertical |',
    `| Exposición | luminancia media < ${T.dark} o > ${T.bright} (0–255) | Demasiado oscura / sobreexpuesta |`,
    `| Contraste (no en rostro) | desviación de luminancia < ${T.flat} | Silueta poco distinguible |`,
    `| Nitidez | varianza del laplaciano < ${T.blurry} (imagen a 256 px) | Desenfocada o movida |`,
    `| Dominante de color (solo rostro) | en las zonas claras casi neutras (fondo, folio blanco), desviación de un canal > ${Math.round(T.cast * 100)} %; sin zonas neutras no se juzga (la piel no es una dominante) | No sirve para colorimetría |`,
    `| Sombras fuertes (solo rostro) | diferencia de luminancia entre mitades de la cara > ${T.shadow} | Busca luz frontal y uniforme |`,
    `| Filtro o color alterado (solo rostro) | saturación media > ${T.saturationHigh} o < ${T.saturationLow} | Sin filtros ni retoques / foto sin color |`,
    '',
    '**2. Por la IA, al analizar.** La IA devuelve primero `photo_quality` (utilizable o no, y por qué) para cada foto; las observaciones de fotos no utilizables se descartan y el motivo se muestra bajo la foto (`body_photos.quality.ai`). Los avisos del paso 1 se le pasan para que rebaje la confianza.',
    '',
    '## Conservación y borrado',
    '',
    '- Por defecto las fotos se conservan hasta que el usuario las quita (una a una o «Borrar todas mis fotos»).',
    '- Opción «Borrar mis fotos después de cada análisis» (`profiles.delete_photos_after_analysis`): tras analizar se eliminan los ficheros y sus filas y se conservan solo los resultados estructurados (README 15).',
    '- Borrar fotos no borra las observaciones ya generadas: siguen en el diagnóstico como hipótesis revisables.',
    '',
    '## Temperatura cromática con la foto de rostro (BIS 2)',
    '',
    'Desde la tarjeta «Temperatura cromática» del capítulo 03: instrucciones de captura → foto de rostro (con el control de calidad de arriba) → «Analizar mi temperatura cromática» (`/api/ai/analyze-temperature`, solo se envía esa foto) → resultado → el usuario confirma o corrige. Es el **subtono** de la piel, no la temperatura física.',
    '',
    '**Contrato de la IA** (`TemperatureSchema`, Zod): `image_quality {suitable, issues[]}`, `temperature` (calida · fria · neutra · indeterminada), `secondary_tendency` (calida · fria · null), `confidence` (alta · media · baja), `observations[]`, `explanation`, `limitations[]`. Sin porcentajes de precisión.',
    '',
    '**Reglas de la aplicación** (`finalizeTemperature`): la IA solo propone.',
    '',
    '- Foto no apta según la IA → no hay conclusión; se explica el motivo y se pide otra foto.',
    '- «Indeterminada» → «Sin información suficiente»: no se fuerza una categoría.',
    `- Avisos graves del control previo (${SERIOUS_ISSUES.join(', ')}) → confianza máxima **baja**. Otros avisos, avisos de la propia IA o foto sin control previo → máxima **media**. Si la aplicación rebaja la confianza, se indica.`,
    '- La tendencia secundaria solo se guarda si difiere de la principal (por ejemplo, «Neutra con tendencia cálida»).',
    '',
    '**Datos y trazabilidad.** Cada estimación se guarda tal cual en `color_analyses` (temperatura, tendencia, confianza, explicación, observaciones, limitaciones, calidad de la IA y del navegador, foto analizada, modelo y fecha) y nunca se modifica. El dato vigente vive en `color_profiles`: `temperature`, `temperature_source` (ia = estimación confirmada · usuario = corregida o elegida), `temperature_status` (pendiente · recopilado · validado), `temperature_analysis_id`, `temperature_updated_at` y `temperature_validated_at`. **La IA nunca escribe `color_profiles`**: una estimación nueva que no coincida con el dato validado se muestra, pero no se aplica sin una nueva confirmación. Solo cambia la temperatura; intensidad, profundidad y contraste no se tocan.',
    '',
    '**Privacidad.** Bucket privado `profile-private`, RLS por usuario, procesamiento en el servidor, sin URLs públicas; la foto se puede quitar y, con «borrar tras el análisis», se elimina después y se conserva solo el resultado (`photo_id` queda vacío; `photo_path` registra qué foto se analizó).',
    '',
    '## Qué se guarda de cada análisis',
    '',
    '- `observations`: área, título, observación, confianza (alta/media/baja), justificación y foto de origen. Son propuestas: entran en el diagnóstico como pendientes de revisión.',
    '- `ai_runs.meta`: fotos usadas, fotos descartadas y número de observaciones descartadas.',
    '',
  )
  return out.join('\n')
}

/** Perfil de ejemplo (ficticio) para mostrar un Blueprint completo en la documentacion. */
export const EXAMPLE: Bundle = {
  profile: { age: 34, height_cm: 180, city: 'Madrid', fit_pref: 'Regular' },
  measures: Object.fromEntries([['pecho', 104], ['hombros', 47], ['cintura', 84], ['cadera', 98], ['entrepierna', 86]].map(([k, v]) => [k, { value: v as number, at: '2026-11-01T10:00:00Z', source: 'manual' }])),
  photos: [], color: { hair_color: 'Castaño oscuro', skin_tone: 'Clara', vein_color: 'Verdosas', metal: 'Oro', temperature: 'Cálida', likes: ['Camel', 'Azul claro'], avoids: ['Mostaza'] },
  style: { dims: { clasico: 70, minimalista: 25, estructurado: 50 }, never_wear: 'Pantalón pitillo', identity_version: 2,
    influences: [{ style: 'elevated-casual', role: 'principal', weight: 50 }, { style: 'scandinavian-minimalism', role: 'secundario', weight: 30 }, { style: 'quiet-luxury', role: 'influencia', weight: 20 }],
    liked_elements: ['clean-lines', 'leg-straight'], rejected_elements: ['leg-slim'], brand_refs: ['cos', 'massimo-dutti'] },
  life: { life: { trabajo: 50, ocio: 30, deporte: 10, citas: 10 }, work_formality: 'Smart casual', climate: 'Cuatro estaciones marcadas', laundry: 'Una o dos veces por semana', constraints: ['Camino mucho'] },
  fit: { prefs: { pantalones: 'Recto', camisas: 'Regular', chaquetas: 'Desestructurada' } },
  goals: { image_words: ['Limpia', 'Segura', 'Elegante'], answers: { g2: 'Una imagen cuidada sin parecer disfrazado' } },
  validated: { a1: true, a2: true, a3: false, a4: true, a5: true, a6: false, a7: false },
  observations: [], blueprints: [], garments: [], references: [], chatValidated: false,
  refRatings: [['clasico-1', 'love'], ['sofisticado-1', 'love'], ['minimal-1', 'like'], ['sofisticado-2', 'represents'], ['oldmoney-2', 'like'], ['quiet-1', 'love'], ['mincont-1', 'like'], ['street-1', 'dislike'], ['hiphop-1', 'dislike'], ['italiana-2', 'admire']].map(([reference_id, rating]) => ({ reference_id, rating })),
  styleRefs: [], colorAnalyses: [],
}

export function diagnosisDoc() {
  const out = [
    '# Motor de diagnóstico y Style Blueprint',
    '',
    '> Documento generado desde `lib/profile/blueprint.ts`, `lib/diagnosis/rules.ts` y `lib/ai/prompts.ts` con `npm run docs`. No lo edites a mano.',
    '',
    '## Principios',
    '',
    '- **Las reglas calculan; la IA no concluye.** El diagnóstico es determinista: mismos datos, mismo resultado. La IA solo aporta observaciones visuales de las fotos (como propuestas) y conversa en el chat.',
    '- **Nunca se inventa un dato.** Si falta, la conclusión lo dice, baja la confianza y lo lista en «Falta».',
    '- **Separar hechos, preferencias y recomendaciones.** Cada conclusión indica su origen (medido, declarado, deducido, calculado o IA).',
    '- **El usuario manda.** Toda conclusión se puede confirmar o corregir; al regenerar se conserva su revisión mientras sus datos no cambien.',
    '- **Validar datos ≠ confirmar conclusiones.** Validar un capítulo dice «estos datos son correctos» y sube la confianza de lo que se calcula con ellos; confirmar una conclusión dice «este diagnóstico me describe».',
    '',
    '## Formato de cada conclusión',
    '',
    '| Campo | Contenido |', '|---|---|',
    '| `title` | Nombre de la conclusión |',
    '| `body` | La conclusión, en una o dos frases |',
    '| `why` | **Por qué**: los datos concretos y las reglas profesionales que la justifican |',
    '| `action` | **Qué haría un estilista**: la acción concreta que recomendaría |',
    '| `data_used` | Datos del expediente que se han usado |',
    '| `missing` | Lo que falta para concluir o afinar |',
    '| `origin` | Medición manual · Declarado por ti · Deducido de tus respuestas · Calculado · IA · foto X |',
    '| `confidence` | `alta` · `media` · `baja` · `sin_datos` |',
    '| `status` | `pending` · `confirmed` · `corrected` (+ `corrected_body`) |',
    '',
    '## Criterios de confianza',
    '',
    '| Nivel | Etiqueta | Cuándo |', '|---|---|---|',
    ...(Object.keys(CONFIDENCE_LABEL) as Confidence[]).map((c) => `| \`${c}\` | ${CONFIDENCE_LABEL[c]} | ${CONFIDENCE_RULE[c]} |`),
    '',
    'Las observaciones de la IA nunca superan `media`: una foto es una hipótesis visual.',
    '',
    '## Reglas profesionales',
    '',
    '| Regla | Área | Criterio |', '|---|---|---|',
    ...Object.values(RULES).map((r) => `| \`${r.id}\` | ${r.area} | ${cell(r.text)} |`),
    '',
    '## Estructura del Style Blueprint',
    '',
    'Portada (versión, fecha, estado preliminar o completo, cita con la dirección de estilo) y, en este orden:',
    '',
    ...SECTIONS.map((sec) => `- **${sec.title}**`),
    '',
    'Cierra con **Lo que sé, lo que supongo y lo que falta** (conclusiones confirmadas o de confianza alta; hipótesis pendientes; datos que faltan).',
    '',
    '## Ejemplo completo',
    '',
    'Resultado del motor para un perfil ficticio: 34 años, 180 cm, medidas y estilo validados, colorimetría declarada sin validar, sin armario registrado.',
    '',
  ]
  for (const sec of SECTIONS) {
    const fs = buildFindings(EXAMPLE).filter((f) => f.section === sec.id)
    if (!fs.length) continue
    out.push(`### ${sec.title}`, '')
    for (const f of fs) {
      out.push(`#### ${f.title} · ${CONFIDENCE_LABEL[f.confidence]}`, '', f.body, '', `- **Por qué:** ${f.why}`, `- **Qué haría un estilista:** ${f.action}`,
        `- **Origen:** ${f.origin}${f.data_used.length ? ` · **Datos usados:** ${f.data_used.join(', ')}` : ''}`, ...(f.missing.length ? [`- **Falta:** ${f.missing.join(', ')}`] : []), '')
    }
  }
  out.push('## Instrucciones que recibe la IA', '', '### Análisis de fotos (`PHOTO_ANALYSIS`)', '', '```text', PHOTO_ANALYSIS, '```', '',
    'La salida se valida con `ObservationsSchema` (Zod) y se reintenta una vez si no cumple el formato.', '',
    '### Temperatura cromática (`TEMPERATURE_ANALYSIS`)', '', '```text', TEMPERATURE_ANALYSIS, '```', '',
    'La salida se valida con `TemperatureSchema` (Zod) y la aplicación la ajusta con `finalizeTemperature` antes de guardarla en `color_analyses`.', '',
    '### Estilista del chat (`STYLIST_PERSONA`)', '', '```text', STYLIST_PERSONA, '```', '',
    'Después de estas instrucciones el chat recibe el contexto de `lib/ai/context.ts`: perfil validado, conclusiones confirmadas o corregidas (con su «Qué haría un estilista»), datos sin validar, hipótesis con lo que les falta, capítulos sin datos y armario real.', '')
  return out.join('\n')
}

export function styleDnaDoc() {
  const out = [
    '# Identidad estética: catálogo de estilos y Style DNA',
    '',
    '> Documento generado desde `lib/style/catalog.ts`, `lib/style/references.ts` y `lib/style/dna.ts` con `npm run docs`. No lo edites a mano.',
    '',
    '## Principios',
    '',
    '- **Un solo sistema.** Amplía el estudio de identidad estética del capítulo 04 y se versiona con el Style Blueprint: cada diagnóstico guarda una instantánea del Style DNA (`assessment_findings.details` de la conclusión «Style DNA») y la siguiente versión indica qué ha cambiado.',
    '- **Identidad híbrida.** Estilo principal, secundarios e influencias con un % orientativo y editable. Los % describen preferencias, no una clasificación objetiva, y no limitan las recomendaciones.',
    '- **Tres cosas que nunca se mezclan:** lo **declarado** por el usuario (identidad, elementos, marcas), lo **inferido** de sus valoraciones y referencias, y las **recomendaciones** del estilista (motor de diagnóstico).',
    `- **Una valoración no es una preferencia.** Un patrón solo aparece si se repite en al menos ${MIN_EVIDENCE} conjuntos distintos; la propuesta de identidad necesita ${MIN_RATED} valoraciones.`,
    '- **Admirar ≠ vestir.** «Me gusta, pero no me lo pondría» no suma a la identidad: se guarda como admiración.',
    '- **Sin scraping ni imágenes de terceros.** Las ilustraciones son originales y se generan desde código; las referencias propias las aporta el usuario; las marcas se describen por los rasgos que se les suelen asociar.',
    '- **Catálogo ampliable.** Es un fichero de datos con ids estables: añadir, editar o relacionar un estilo no obliga a tocar la interfaz ni la base de datos.',
    '',
    '## Escala de valoración',
    '',
    '| Valoración | `rating` | Peso | Cuenta como querer vestirlo |', '|---|---|---|---|',
    ...RATINGS.map((r) => `| ${r.label} | \`${r.id}\` | ${r.weight > 0 ? '+' : ''}${String(r.weight).replace('.', ',')} | ${r.wear ? 'Sí' : 'No'} |`),
    '',
    '«Me gusta algún elemento, pero no el conjunto» permite marcar qué elementos concretos gustan; cada uno suma +1,5 a ese elemento, no al estilo. Una referencia propia sin valorar cuenta como «Me gusta». Las valoraciones antiguas se convierten: «Me gustaría conseguir algo parecido» → «Me representa»; «No me lo pondría» → «No me gusta».',
    '',
    '## Cómo se infiere el Style DNA',
    '',
    '1. Cada valoración (galería) o referencia propia analizada se convierte en una señal: estilo, ajuste, estructura, formalidad, colores y elementos visuales.',
    '2. **Propuesta de identidad:** suma de pesos por estilo (las marcas de referencia añaden 1,5 × su afinidad con cada estilo) → hasta 4 estilos con % en múltiplos de 5; el primero es principal, los de 20 % o más secundarios y el resto influencias.',
    `3. **Patrones:** un elemento es «prefiere» si aparece en ≥ ${MIN_EVIDENCE} conjuntos valorados positivamente y su puntuación es ≥ 2,5; «evita» si aparece en ≥ ${MIN_EVIDENCE} conjuntos rechazados con puntuación ≤ −2,5. Las marcas nunca crean un patrón por sí solas.`,
    '4. **Admirados:** estilos marcados «Me gusta, pero no me lo pondría» que no suman a la identidad. **Descartados:** estilos con suma negativa.',
    '5. **Identidad vigente:** la declarada si existe; si no, la propuesta (marcada como tal). Los elementos declarados mandan sobre los inferidos; un inferido que contradiga lo declarado se ignora.',
    '',
    '## Integración con el resto de la aplicación',
    '',
    'Punto de acceso único: `styleProfileOf(bundle)` devuelve `{ declared, inferred, identity, elements }`. Para puntuar una prenda, conjunto o producto: `styleFit(perfil, { style, elements })` → `{ score 0–100, match, reasons[] }`. Suma si representa una influencia (más cuanto más peso tiene), si es de un estilo relacionado o si tiene elementos que gustan; resta por elementos rechazados (más si son declarados) o estilos descartados. No es un filtro: combina influencias secundarias y explica por qué.',
    '',
    '| Módulo | Uso |', '|---|---|',
    '| Armario digital (fase 2) | `styleFit` de cada prenda: a qué influencia representa y si encaja o choca. |',
    '| Outfit Studio | Combinar la base (principal) con piezas de los secundarios e influencias. |',
    '| Compras inteligentes y wishlist | `styleFit` del producto; marcas de referencia como pista de búsqueda, nunca como filtro. |',
    '| Evolución personal | `evolution()` entre instantáneas de versiones del Blueprint. |',
    '| Chat | Recibe la identidad declarada y lo inferido por separado. |',
    '',
    '## Datos',
    '',
    'Se amplían las tablas existentes, sin un sistema paralelo (migración `0005_style_identity.sql`):',
    '',
    '| Qué | Dónde |', '|---|---|',
    '| Catálogo de estilos, subestilos relacionados, elementos y marcas | `lib/style/catalog.ts` (datos versionados con el código, ids estables) |',
    '| Referencias visuales (galería) | `lib/style/references.ts` (ilustraciones generadas) |',
    '| Valoraciones individuales | `style_reference_ratings` (`reference_id`, `rating`, `liked_elements`, `rated_at`) |',
    '| Referencias propias y rasgos detectados por la IA | `style_references` (`ai_tags`: estilo, ajuste, estructura, formalidad, colores, elementos, prendas, patrón) |',
    '| Influencias seleccionadas y su peso; preferencias confirmadas | `style_preferences` (`influences`, `liked_elements`, `rejected_elements`, `brand_refs`) |',
    '| Fecha y versión de la identidad | `style_preferences` (`identity_version`, `identity_updated_at`) y la instantánea en cada versión del Blueprint |',
    '',
    '## Elementos visuales',
    '',
    ...ELEMENT_GROUPS.map((g) => `- **${g}:** ${ELEMENTS.filter((e) => e.group === g).map((e) => `${e.label} (\`${e.id}\`)`).join(', ')}`),
    '',
    '## Universos de marca',
    '',
    'Inspiración, no estilos. Cada marca orienta hacia rasgos visuales y estilos afines; el usuario puede marcarlas en «Mi identidad».',
    '',
    '| Marca | Rasgos que se le suelen asociar | Estilos afines |', '|---|---|---|',
    ...BRAND_UNIVERSES.map((br) => `| ${br.name} | ${br.description} | ${Object.keys(br.styles).map(styleName).join(', ')} |`),
    '',
    '## Catálogo de estilos',
    '',
  ]
  for (const g of STYLE_GROUPS) {
    out.push(`### ${g.name}`, '')
    for (const st of STYLE_CATALOG.filter((x) => x.group === g.id)) {
      out.push(`#### ${st.name} (\`${st.id}\`)`, '', st.description, '',
        `- **Características:** ${st.traits.join('; ')}`, `- **Siluetas habituales:** ${st.silhouettes.join('; ')}`, `- **Prendas características:** ${st.garments.join(', ')}`,
        `- **Calzado y complementos:** ${st.footwear.join(', ')}`, `- **Paleta frecuente:** ${st.palette.join(', ')}`,
        `- **Elementos visuales:** ${st.elements.map(elementLabel).join(', ')}`, `- **Relacionados:** ${st.related.map(styleName).join(', ')}`,
        `- **Galería:** ${outfitsOf(st.id).map((o) => o.desc).join(' · ')}`, '')
    }
  }
  out.push(`Total: ${STYLE_CATALOG.length} estilos y ${OUTFITS.length} conjuntos ilustrados.`, '')
  return out.join('\n')
}

function evaluationSection() {
  const famName: Record<string, string> = { bottom: 'Pantalones', jacket: 'Chaquetas, abrigos y sastrería', shirt: 'Camisas', top: 'Camisetas, polos y punto', footwear: 'Calzado', accessory: 'Complementos', basic: 'Básicos' }
  return [
    'Tres valoraciones **separadas** (0–10). Una prenda puede encajar contigo y combinar mal con tu armario. **Lo que no se puede calcular aparece como «Pendiente», nunca como cero.** Compatibilidad y valor estratégico se calculan con reglas (`lib/wardrobe/compatibility.ts`) cada vez que se consultan: si cambias tu perfil o tu armario, cambian. No se guardan como verdad; solo se guarda una instantánea junto a cada decisión.',
    '',
    '### 1. Compatibilidad personal',
    '',
    '| Criterio | Peso | Datos del perfil que usa |', '|---|---|---|',
    `| Compatibilidad con tu estilo | ${WEIGHTS.style} % | Identidad estética (influencias y pesos, declarada o propuesta), rasgos que te gustan o rechazas, estilos que has descartado; la prenda se traduce a rasgos del catálogo (tipo, corte, silueta, estampado) y a los estilos que le hayas puesto |`,
    `| Compatibilidad cromática | ${WEIGHTS.color} % | Temperatura cromática (validada > declarada > estimada por IA > pistas), colores que te gustan y que evitas; cerca de la cara pesa más |`,
    `| Adecuación del corte a tus preferencias y proporciones | ${WEIGHTS.cut} % | Corte preferido por tipo de prenda, ajuste general preferido, «algo que nunca te pondrías» y proporciones de tus medidas (orientaciones, no prohibiciones) |`,
    `| Encaje con tus necesidades | ${WEIGHTS.needs} % | Reparto de tu semana frente a las ocasiones de la prenda (o las deducidas de su formalidad, marcadas como tales), formalidad del trabajo, clima y restricciones prácticas |`,
    `| Calidad de la información disponible | ${WEIGHTS.info} % | Datos clave confirmados (los propuestos por la IA y no aceptados no cuentan), fotos y composición confirmada |`,
    '',
    'Cada criterio muestra su porqué, los datos usados, lo que falta y la confianza (los datos de la IA sin confirmar cuentan como hipótesis). Si falta más de la mitad del peso personal, la compatibilidad queda **pendiente**; si falta algo, es **provisional** e indica el porcentaje calculado. **Nunca incluye el ajuste real.**',
    '',
    '### 2. Ajuste real (Fit Assessment)',
    '',
    `Solo con fotos tuyas llevándola puesta (función «Llevándola puesta», hasta ${MAX_WORN}) o con tu autoevaluación. La IA (prompt \`${FIT_PROMPT_VERSION}\`) **propone**; la propuesta no cuenta hasta que la confirmas o corriges. Lo que no se ve queda «no observable» y la evaluación, **provisional**. Se tiene en cuenta la clase de prenda: corte diseñado, silueta amplia, estructura (una americana desestructurada no se evalúa como una formal), hombro caído, pinzas. Las dimensiones que solo puedes juzgar tú (talla del calzado, comodidad) nunca las puntúa la IA; hombros y talla nunca son «arreglables». La nota es la media de las dimensiones observadas de la última evaluación confirmada.`,
    '',
    '| Prenda | Dimensiones |', '|---|---|',
    ...Object.entries(FIT_DIMENSIONS).map(([f, ds]) => `| ${famName[f]} | ${ds.map((x) => x.label + (x.ai ? '' : ' (solo tú)')).join(' · ')} |`),
    '',
    '### 3. Valor estratégico (preliminar)',
    '',
    `Se calcula con al menos ${MIN_WARDROBE} prendas activas: con cuántas combina (grupos complementarios, formalidad a ±1, colores que no chocan según tu paleta) 35 %, ocasiones que cubre 20 %, temporadas 15 %, si duplica otra prenda (mismo tipo, color y corte) 15 % y si cubre una actividad importante de tu semana que ninguna otra prenda de su grupo cubre 15 %. Se recalculará con la auditoría (2D) y el registro de uso.`,
    '',
    '### Decisión',
    '',
    '| Decisión | Significado |', '|---|---|',
    ...DECISIONS.map((x) => `| ${x.label} (\`${x.id}\`) | ${x.help} |`),
    '',
    'El sistema **propone** (con su porqué) y tú **decides**: arreglo posible en el ajuste → modificar; sin datos → revisar; ajuste < 5 → sustituir; compatibilidad < 5 y poco valor → sustituir o donar/vender; buena compatibilidad sin prueba de ajuste → revisar; buena compatibilidad y buen ajuste → conservar. Ninguna decisión archiva ni elimina la prenda. Cada decisión guarda la propuesta, si la seguiste y las puntuaciones del momento; el historial de la ficha registra pruebas de ajuste y decisiones.',
    '',
    '**Veredicto del estilista**: un resumen en lenguaje natural, generado por reglas a partir de las tres valoraciones (sin coste de IA). El chat recibe la compatibilidad y la decisión de cada prenda.',
    '',
    '### Prompt del Fit Assessor',
    '',
    '```text', FIT_ASSESSOR, '```',
  ]
}

function garmentAiSection() {
  return [
    `Prompt \`${PROMPT_VERSION}\`, esquema \`${SCHEMA_VERSION}\` (\`lib/wardrobe/analysis.ts\`). Se envían hasta ${MAX_IMAGES} fotos por orden de función: ${ANALYSIS_ROLES.map((r) => IMAGE_ROLES.find((x) => x.id === r)?.label).join(', ')}. Las fotos «llevándola puesta» no se usan para identificar la prenda: son para el Fit Assessment (2C).`,
    '',
    '**Flujo.** Alta asistida («Guardar y analizar con IA»: basta con las fotos, la prenda queda como borrador) o botón «Analizar con IA» en la ficha → propuesta en la pestaña «Análisis IA» → por cada campo: aceptar, corregir o descartar → «Confirmar revisión» (opcionalmente pasa el borrador al armario).',
    '',
    '**Reglas que aplica la aplicación, no solo el prompt:**',
    '',
    '- Cada valor se ajusta a la taxonomía; lo que no encaja se descarta y se muestra como «Descartado automáticamente», nunca se fuerza.',
    '- Las características técnicas solo se aceptan si pertenecen a la familia del tipo de prenda; un tipo que no pertenece a la categoría se descarta.',
    '- La composición, la marca y la talla solo se proponen si hay foto de etiqueta y la IA dice haberlas leído en ella; aceptada, la composición queda con origen «etiqueta». El material aparente se presenta siempre como estimación visual.',
    '- Confianza por campo: alta ≥ 85 %, media ≥ 60 %, baja < 60 %. Se preselecciona «Aceptar» solo con confianza media o alta y si no pisa un dato que pusiste tú; con confianza baja, o si el dato es tuyo, por defecto se mantiene lo actual.',
    '- Observaciones (lo que se ve) e inferencias (lo que deduce) se muestran por separado; lo que no puede determinar aparece con la foto que lo resolvería.',
    '- La IA no valora el ajuste real.',
    '',
    '**Trazabilidad.** La respuesta validada se guarda tal cual en `garment_analyses.analysis_result` y la propuesta ajustada en `normalized`, con modelo, versiones de prompt y de esquema, fotos usadas, confianza global y consumo. Solo lo aceptado o corregido llega a `garments`: aceptado → `field_sources` con `source: ia`, `confirmed_by: usuario` y `analysis_id`; corregido → `source: usuario`. Las decisiones quedan en `garment_analyses.decisions` y el historial registra «Analizada con IA» y «Propuesta de la IA revisada».',
    '',
    `**Estados del análisis:** propuesto → aceptado · aceptado en parte · descartado; un análisis nuevo deja el propuesto anterior como «sustituido» (no se borra).`,
    '',
    '**Control de costes.** Mismas fotos (SHA-256) + misma versión de prompt y esquema + misma pista del usuario = mismo análisis: se reutiliza sin llamar a la IA (consta en `ai_runs` como reutilizado). Corregir la ficha a mano nunca lanza un análisis. «Repetir análisis» fuerza una llamada nueva. El consumo (llamadas, tokens, tiempo) se guarda por análisis y en `ai_runs`, y se resume en «Estado técnico» (coste 0 con proveedores gratuitos; con `AI_PRICE_IN`/`AI_PRICE_OUT` en € por millón de tokens se estima).',
    '',
    '### Prompt del sistema',
    '',
    '```text', GARMENT_ANALYST, '```',
  ]
}

export function wardrobeDoc() {
  const out = [
    '# Armario digital (Fase 2)',
    '',
    '> Documento generado desde `lib/wardrobe/taxonomy.ts` con `npm run docs`. No lo edites a mano.',
    '',
    '## Principios',
    '',
    '- **Un solo sistema.** El armario tiene sus tablas, pero consulta el expediente y el Style Blueprint; no duplica datos personales.',
    '- **Nada se da por confirmado sin comprobarlo.** El corte de una prenda no dice cómo te queda (eso es el Fit Assessment, con fotos llevándola) y el material aparente no es la composición (que solo se confirma con etiqueta, ficha comercial o tu palabra).',
    '- **Trazabilidad.** Cada campo guarda quién lo estableció y cuándo (`field_sources`: usuario, ia, etiqueta, ficha) y cada cambio queda en `garment_events`.',
    '- **Nada se borra solo.** Archivar es reversible; eliminar exige confirmación explícita.',
    '- **Imágenes privadas.** Buckets privados por usuario, URLs firmadas de vida corta, nunca públicas.',
    '',
    '## Estado de la fase',
    '',
    '| Subfase | Contenido | Estado |', '|---|---|---|',
    '| 2A · Base del armario | Tablas, Storage, alta con varias fotos (cámara o galería), edición, archivo, búsqueda, filtros, orden, historial | Hecha |',
    '| 2B · Garment AI | Análisis de visión, prompt especializado, esquema con confianza por campo, revisión y confirmación (`garment_analyses`), control de costes | Hecha |',
    '| 2C · Evaluación personal | Compatibilidad con tu perfil, valor estratégico, Fit Assessment (IA con fotos puestas o autoevaluación), decisiones | Hecha |',
    '| 2D · Auditoría | Duplicados, huecos, informes | Pendiente |',
    '',
    '## Taxonomía',
    '',
    '| Categoría (`category`) | En la primera interfaz | Tipos (`subcategory`) |', '|---|---|---|',
    ...GROUPS.map((g) => `| ${g.label} (\`${g.id}\`) | ${g.primary ? 'Sí' : 'En «Más categorías»'} | ${g.subs.map((x) => `${x.label} (\`${x.id}\`)`).join(', ')} |`),
    '',
    '## Características técnicas por familia de prenda',
    '',
    'Se guardan en `garments.attributes` (jsonb); el corte va en la columna `cut`. Solo se aceptan las de la familia del tipo de prenda.',
    '',
    ...(Object.keys(ATTRIBUTES) as (keyof typeof ATTRIBUTES)[]).filter((f) => ATTRIBUTES[f].length || CUTS[f].length).flatMap((f) => [
      `### ${({ bottom: 'Pantalones y parte inferior', jacket: 'Chaquetas, abrigos y sastrería', shirt: 'Camisas y sobrecamisas', top: 'Camisetas, polos, punto y sudaderas', footwear: 'Calzado', accessory: 'Complementos', basic: 'Básicos' } as Record<string, string>)[f]} (\`${f}\`)`,
      '', `- **Tipos:** ${SUBS.filter((x) => x.family === f).map((x) => x.label).join(', ')}`,
      ...(CUTS[f].length ? [`- **Corte:** ${CUTS[f].join(' · ')}`] : []),
      ...ATTRIBUTES[f].map((d) => `- **${d.label}** (\`${d.key}\`): ${d.options.join(' · ')}`), '',
    ]),
    '## Ficha de la prenda',
    '',
    '| Bloque | Campos |', '|---|---|',
    '| Identificación | nombre, categoría, tipo, color principal y secundarios, estampado, corte, silueta, estilo (ids del catálogo), formalidad 1–5, temporadas, ocasiones |',
    `| Características técnicas | según la familia (arriba) |`,
    `| Materiales | material aparente (estimación) · composición confirmada + origen (${COMPOSITION_SOURCES.map((x) => x.label.toLowerCase()).join(', ')}) |`,
    '| Comercial y personal | marca, talla de etiqueta, talla que te funciona (son distintas), precio, fecha de compra, tienda, conservación, usos estimados, ubicación, notas, favorita |',
    `| Estado | ${STATUSES.map((x) => `${x.label} (\`${x.id}\`)`).join(' · ')}: los borradores y las archivadas no cuentan en el armario activo ni en el diagnóstico |`,
    '',
    `Colores admitidos: ${GARMENT_COLORS.join(', ')}. Estampados: ${PATTERNS.join(', ')}. Conservación: ${CONDITIONS.map((x) => x.label).join(', ')}.`,
    '',
    'Una ficha está **completa** cuando tiene tipo de prenda, color principal (salvo complementos) y al menos una foto o un nombre; si no, aparece «por revisar».',
    '',
    '## Fotografías',
    '',
    `Funciones: ${IMAGE_ROLES.map((r) => r.label).join(' · ')}. En el navegador cada foto se reduce a 2048 px y se recodifica en JPEG (lo que elimina metadatos y ubicación), se genera una miniatura WebP de 480 px y se calcula su SHA-256 para detectar fotos repetidas y no analizar dos veces la misma (fase 2B).`,
    '',
    '```text', 'wardrobe-originals/<usuario>/<prenda>/<uuid>.jpg', 'wardrobe-thumbnails/<usuario>/<prenda>/<uuid>.webp', '```',
    '',
    '## Garment AI (2B)',
    '',
    ...garmentAiSection(),
    '',
    '## Evaluación personal (2C)',
    '',
    ...evaluationSection(),
    '',
    '## Datos (migraciones `0007_wardrobe_base.sql`, `0008_garment_ai.sql` y `0009_garment_evaluation.sql`)',
    '',
    '| Tabla | Responsabilidad | Subfase |', '|---|---|---|',
    '| `garments` | Registro principal (evoluciona la tabla mínima de la fase 1: CHECK, índices por usuario/categoría/estado, `updated_at` con disparador, `field_sources`) | 2A |',
    '| `garment_images` | Fotos, función, dimensiones y hash | 2A |',
    '| `garment_events` | Incorporaciones, cambios campo a campo, estados, fotos | 2A |',
    '| `garment_analyses` | Resultados de IA versionados (modelo, versión de prompt y de esquema, estado) | 2B |',
    '| `garment_fit_reviews` | Evaluaciones de ajuste: propuesta de la IA (con modelo, versión de prompt, fotos y consumo) o autoevaluación; dimensiones con puntuación, nota y si es arreglable; provisional; estado propuesta → vigente → anterior | 2C |',
    '| `garment_decisions` | Decisiones del usuario con la propuesta del sistema y la instantánea de puntuaciones de ese momento; la vigente se copia en `garments.decision` | 2C |',
    '| `wardrobe_audits`, `wardrobe_audit_findings` | Auditorías y hallazgos | 2D |',
    '',
    'Los atributos técnicos viven en `garments.attributes` (jsonb validado contra la taxonomía) en lugar de una tabla `garment_attributes`: cada prenda solo tiene los de su familia y su origen queda en `field_sources`.',
    '',
    '## API REST',
    '',
    '| Ruta | Función |', '|---|---|',
    '| `GET /api/wardrobe/items?q=&category=&status=&favorite=1&sort=` | Listar, buscar, filtrar y ordenar |',
    '| `POST /api/wardrobe/items` | Crear ficha (`status`: draft o active) |',
    '| `GET /api/wardrobe/items/:id` | Ficha con fotos (URLs firmadas) e historial |',
    '| `PATCH /api/wardrobe/items/:id` | Editar cualquier campo |',
    '| `DELETE /api/wardrobe/items/:id` | Archivar (por defecto) o eliminar con `?mode=permanent` |',
    '| `POST /api/wardrobe/items/:id/images` | Asociar una foto ya subida (ruta dentro de la carpeta del usuario y la prenda) |',
    '| `POST /api/wardrobe/items/:id/analyze[?force=1]` | Propuesta de la IA (no toca la ficha). Sin `force` reutiliza el análisis de las mismas fotos |',
    '| `POST /api/wardrobe/items/:id/confirm` | `{analysis_id, decisions: {campo: {action: accept\\|correct\\|reject, value?}}, activate?}`: escribe solo lo aceptado o corregido |',
    '',
    '| `GET /api/wardrobe/items/:id/evaluation` | Compatibilidad, ajuste real y valor estratégico con sus criterios, propuesta de decisión, veredicto e historiales |',
    '| `POST /api/wardrobe/items/:id/fit-review` | `{mode: "ai"}` pide la propuesta de la IA; `{dimensions: [{key, score 1-10\\|null, note, fixable}], proposal_id?, notes?}` registra o confirma la evaluación |',
    '| `POST /api/wardrobe/items/:id/decision` | `{decision: keep\\|modify\\|review\\|replace\\|donate_sell, reason?, alteration?}` (nunca archiva ni borra) |',
    '',
    'Las rutas de auditoría llegan en 2D. La interfaz usa el mismo servicio (`lib/wardrobe/service.ts`) mediante acciones del servidor.',
    '',
  ]
  return out.join('\n')
}

if (process.argv[1]?.endsWith('docs.ts')) {
  writeFileSync('docs/ARMARIO.md', wardrobeDoc())
  writeFileSync('docs/STYLE-DNA.md', styleDnaDoc())
  writeFileSync('docs/MOTOR-DIAGNOSTICO.md', diagnosisDoc())
  writeFileSync('docs/CUESTIONARIO.md', questionnaireDoc())
  writeFileSync('docs/PROTOCOLO-FOTOGRAFICO.md', protocolDoc())
  console.log('docs/CUESTIONARIO.md, docs/PROTOCOLO-FOTOGRAFICO.md, docs/MOTOR-DIAGNOSTICO.md docs/STYLE-DNA.md y docs/ARMARIO.md actualizados')
}
