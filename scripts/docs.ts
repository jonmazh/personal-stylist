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

const KIND: Record<Question['kind'], string> = {
  number: 'Número', text: 'Texto', textarea: 'Texto libre', single: 'Una opción', multi: 'Varias opciones', slider: 'Deslizador 0–100', percent: 'Porcentaje', measure: 'Medida (cm)',
}
const cell = (s: string) => s.replace(/\|/g, '\\|')
const answers = (q: Question) =>
  q.options ? q.options.join(' · ') + (q.max ? ` (máx. ${q.max})` : '')
  : q.kind === 'slider' ? `${q.ends![0]} (0) ↔ ${q.ends![1]} (100); 50 = sin preferencia`
  : q.kind === 'percent' ? '0–100 en pasos de 5; el grupo debe sumar 100 %'
  : q.kind === 'measure' ? '1–299 cm' : q.unit ? `Número (${q.unit})` : 'Libre'
const storage = (q: Question) =>
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
    if (a.id === 'a6') {
      out.push('', '### Prendas de referencia', '', 'Prendas que ya le quedan bien, medidas en plano (medidas de prenda, no corporales). Tabla `reference_garments` (`category`, `name`, `measurements` jsonb, `notes`).', '')
      out.push('| Tipo | Medidas que se piden (cm) |', '|---|---|')
      for (const [k, f] of Object.entries(GARMENT_FIELDS)) out.push(`| ${GARMENT_LABEL[k]} | ${f.map(([, l]) => l).join(', ')} |`)
      out.push('', 'Alimentan: Cortes que funcionan; comparación de tallas en compras (fase 4).')
    }
    out.push('')
  })
  out.push('## Pendiente', '', '- Descubrimiento visual del Style DNA (clasificar referencias de conjuntos: «Me encanta», «No me lo pondría»…): necesita un banco de imágenes de referencia.', '- Referencias visuales propias (Pinterest, Instagram): bucket `references-private` ya creado.', '')
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
    `| Contraste | desviación de luminancia < ${T.flat} | Silueta poco distinguible |`,
    `| Nitidez | varianza del laplaciano < ${T.blurry} (imagen a 256 px) | Desenfocada o movida |`,
    `| Dominante de color (solo rostro) | desviación de un canal > ${Math.round(T.cast * 100)} % | No sirve para colorimetría |`,
    '',
    '**2. Por la IA, al analizar.** La IA devuelve primero `photo_quality` (utilizable o no, y por qué) para cada foto; las observaciones de fotos no utilizables se descartan y el motivo se muestra bajo la foto (`body_photos.quality.ai`). Los avisos del paso 1 se le pasan para que rebaje la confianza.',
    '',
    '## Qué se guarda de cada análisis',
    '',
    '- `observations`: área, título, observación, confianza (alta/media/baja), justificación y foto de origen. Son propuestas: entran en el diagnóstico como pendientes de revisión.',
    '- `ai_runs.meta`: fotos usadas, fotos descartadas y número de observaciones descartadas.',
    '',
  )
  return out.join('\n')
}

if (process.argv[1]?.endsWith('docs.ts')) {
  writeFileSync('docs/CUESTIONARIO.md', questionnaireDoc())
  writeFileSync('docs/PROTOCOLO-FOTOGRAFICO.md', protocolDoc())
  console.log('docs/CUESTIONARIO.md y docs/PROTOCOLO-FOTOGRAFICO.md actualizados')
}
