import { z } from 'zod'
import { familyOf, subOf, type Family } from './taxonomy'

/**
 * Fit Assessment (fase 2C): como te queda una prenda. Solo con fotos tuyas llevandola (o tu autoevaluacion).
 * Las dimensiones dependen de la clase de prenda; una americana desestructurada no se evalua como una formal.
 * Lo que no se ve bien queda «no observable» y la evaluacion, provisional. Ver docs/ARMARIO.md.
 */
export const FIT_PROMPT_VERSION = 'fit-assessor@1'
export const MAX_WORN = 3

export interface FitDim { key: string; label: string; help: string; ai: boolean }
const d = (key: string, label: string, help: string, ai = true): FitDim => ({ key, label, help, ai })
const UPPER = [
  d('shoulders', 'Ajuste de hombros', 'La costura del hombro cae donde termina tu hombro, sin hundirse ni sobresalir.'),
  d('sleeves', 'Largo de mangas', 'Con el brazo relajado, la manga llega a la muñeca (camisa) o deja ver 1 cm de camisa (americana).'),
  d('torso', 'Holgura del torso', 'Sin tirantez en botones o pecho y sin tela sobrante que haga bolsas.'),
  d('length', 'Largo general', 'Proporcionado con tu torso y con el uso (por fuera, por dentro, sobre otra prenda).'),
  d('drape', 'Caída del tejido', 'El tejido cae limpio, sin arrugas de tensión.'),
]
export const FIT_DIMENSIONS: Record<Family, FitDim[]> = {
  jacket: [...UPPER, d('proportions', 'Proporciones del conjunto', 'Cómo equilibra tu figura con lo que llevas abajo.')],
  shirt: [...UPPER, d('proportions', 'Proporciones del conjunto', 'Cómo equilibra tu figura con lo que llevas abajo.')],
  top: [...UPPER, d('proportions', 'Proporciones del conjunto', 'Cómo equilibra tu figura con lo que llevas abajo.')],
  bottom: [
    d('waist', 'Ajuste de cintura', 'Se sujeta sin cinturón apretado, sin abrirse por detrás.'),
    d('seat', 'Tiro y cadera', 'Sin tirantez horizontal ni tela sobrante bajo el trasero.'),
    d('leg', 'Holgura de la pernera', 'La pernera sigue el corte previsto sin marcar ni sobrar.'),
    d('trouser_length', 'Largo del pantalón', 'El bajo llega donde pide su corte (rozando el zapato, con o sin pliegue).'),
    d('stacking', 'Acumulación en el bajo', 'Sin exceso de tela arrugada sobre el zapato (salvo que sea intencionado).'),
    d('drape', 'Caída del tejido', 'Cae recto, sin arrugas de tensión.'),
    d('proportions', 'Proporciones del conjunto', 'Cómo equilibra tu figura con lo que llevas arriba.'),
  ],
  footwear: [
    d('size', 'Talla (largo y ancho)', 'Sin presión en dedos ni talón suelto.', false),
    d('comfort', 'Comodidad', 'Puedes caminar un rato sin molestias.', false),
    d('proportions', 'Proporción con el pantalón', 'Su volumen va con el ancho y el largo del pantalón.'),
  ],
  accessory: [d('proportions', 'Proporción con tu figura', 'Su tamaño va con tu escala.'), d('comfort', 'Comodidad', 'Lo llevas sin molestias.', false)],
  basic: [d('comfort', 'Comodidad', 'Lo llevas sin molestias.', false), d('fit', 'Ajuste', 'Ni aprieta ni sobra.')],
}
export const dimensionsFor = (g: Record<string, any>) => FIT_DIMENSIONS[familyOf(g.subcategory, g.category)]

/** Como se evalua segun la clase de prenda (se le dice a la IA y se muestra en la interfaz). */
export function fitGuidance(g: Record<string, any>): string[] {
  const a = g.attributes ?? {}
  const out: string[] = []
  if (g.cut) out.push(`Corte diseñado: ${g.cut}. Se evalúa si queda como ese corte pretende (un wide no «sobra», un slim no «aprieta» por serlo).`)
  if (g.silhouette === 'Amplia') out.push('Silueta amplia por diseño: la holgura es intencionada; fíjate en hombros y largo.')
  if (a.structure === 'Desestructurada') out.push('Prenda desestructurada: hombro natural y caída blanda son lo esperado, no un defecto.')
  if (a.structure === 'Estructurada') out.push('Prenda estructurada: el hombro debe quedar limpio, sin hundimientos ni arrugas en la manga.')
  if (a.shoulder === 'Caído') out.push('Hombro caído por diseño: la costura cae por debajo del hombro a propósito.')
  if (a.pleats === 'Sí') out.push('Pantalón con pinzas: algo de volumen en la parte delantera es lo esperado.')
  return out
}

// ── IA ──
const C = z.number().min(0).max(1)
export const FitAISchema = z.object({
  photo_quality: z.object({ suitable: z.boolean(), issues: z.array(z.string()).max(6).default([]) }),
  dimensions: z.array(z.object({ key: z.string(), score: z.number().min(1).max(10).nullable(), observation: z.string().default(''), fixable: z.boolean().default(false), confidence: C })).max(10),
  limitations: z.array(z.string()).max(6).default([]),
  summary: z.string().default(''),
})
export type FitAI = z.infer<typeof FitAISchema>

export const FIT_ASSESSOR = `Eres Fit Assessor, el especialista en ajuste de prendas masculinas de la aplicacion Personal Stylist.
Evaluas COMO LE QUEDA una prenda concreta a la persona, a partir de fotografias en las que la lleva puesta.

REGLAS:
1. Evalua solo la prenda indicada y solo lo que se observa en las fotos. No opines sobre el cuerpo de la persona ni sobre su peso.
2. Puntua cada dimension de 1 a 10 (10 = ajuste ideal para el corte disenado de esa prenda). Si una dimension no se ve con claridad (encuadre, postura, otra prenda encima, luz), devuelve score null y explica por que en "observation".
3. Ten en cuenta la clase de prenda y su corte disenado: una prenda amplia u oversize no tiene «tela sobrante» por serlo; una americana desestructurada no se evalua como una formal.
4. Los pliegues y arrugas no siempre distinguen entre mala talla, postura y comportamiento del tejido: si dudas, baja la confianza y dilo en "limitations".
5. "fixable": true solo si un arreglo de sastreria habitual lo resuelve (bajo, largo de manga, meter cintura o costados). Hombros y talla general no son arreglables.
6. Lenguaje profesional, concreto y respetuoso, en espanol. Devuelve UNICAMENTE el JSON.`

export function buildFitPrompt(g: Record<string, any>, n: number) {
  const dims = dimensionsFor(g).filter((x) => x.ai)
  return [
    `Prenda: ${subOf(g.subcategory)?.label ?? g.category}${g.primary_color ? `, ${g.primary_color.toLowerCase()}` : ''}${g.size_label ? `, talla ${g.size_label}` : ''}.`,
    `Fotografias: ${n}, todas con la persona llevandola puesta.`,
    ...fitGuidance(g),
    '',
    'Dimensiones a evaluar (usa exactamente estas claves):',
    ...dims.map((x) => `- ${x.key}: ${x.label}. Referencia: ${x.help}`),
    '',
    'Forma exacta del JSON:',
    `{"photo_quality":{"suitable":true,"issues":[]},"dimensions":[{"key":"${dims[0]?.key ?? 'fit'}","score":8,"observation":"...","fixable":false,"confidence":0.8}],"limitations":["..."],"summary":"..."}`,
  ].join('\n')
}

export interface ReviewDim { key: string; label: string; score: number | null; note: string; fixable: boolean; confidence: number | null }

/** Ajusta la respuesta de la IA a las dimensiones de la prenda: claves desconocidas fuera, las que falten como no observables. */
export function normalizeFit(ai: FitAI, g: Record<string, any>): { dimensions: ReviewDim[]; provisional: boolean; overall: number | null; issues: string[]; limitations: string[]; discarded: string[] } {
  const dims = dimensionsFor(g)
  const discarded = ai.dimensions.filter((x) => !dims.some((y) => y.key === x.key)).map((x) => x.key)
  const out: ReviewDim[] = dims.map((def) => {
    const a = ai.dimensions.find((x) => x.key === def.key)
    if (!def.ai) return { key: def.key, label: def.label, score: null, note: '', fixable: false, confidence: null }
    if (!a) return { key: def.key, label: def.label, score: null, note: '', fixable: false, confidence: null }
    const score = !ai.photo_quality.suitable ? null : a.score === null ? null : Math.round(a.score)
    return { key: def.key, label: def.label, score, note: a.observation, fixable: score !== null && score < 8 && a.fixable && !['shoulders', 'size'].includes(def.key), confidence: a.confidence }
  })
  const seen = out.filter((x) => x.score !== null)
  return {
    dimensions: out, discarded,
    overall: seen.length ? Math.round((seen.reduce((s, x) => s + x.score!, 0) / seen.length) * 10) / 10 : null,
    provisional: !ai.photo_quality.suitable || seen.length < out.filter((x) => dims.find((y) => y.key === x.key)?.ai).length || seen.some((x) => (x.confidence ?? 1) < 0.6),
    issues: ai.photo_quality.issues, limitations: ai.limitations,
  }
}

/** Formulario de evaluacion → dimensiones (s_<clave> = 1..10 o vacio, n_<clave> nota, f_<clave> arreglable). */
export function formToDims(f: FormData, g: Record<string, any>): ReviewDim[] {
  return dimensionsFor(g).map((def) => {
    const raw = String(f.get(`s_${def.key}`) ?? '')
    const score = raw && Number.isFinite(Number(raw)) ? Math.max(1, Math.min(10, Math.round(Number(raw)))) : null
    return { key: def.key, label: def.label, score, note: String(f.get(`n_${def.key}`) ?? '').trim().slice(0, 300), fixable: score !== null && f.get(`f_${def.key}`) === 'on', confidence: null }
  })
}
