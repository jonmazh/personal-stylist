import { CONSTRAINTS, DIMS, GOALS, LIFE, MEASURES, PREFS, type AreaId } from './areas'

/**
 * Cuestionario de incorporacion: UNICA fuente de verdad.
 * De aqui salen los formularios, el guardado, el contexto del chat y docs/CUESTIONARIO.md
 * (npm run docs). Cada pregunta declara que dato extrae, donde se guarda y que conclusion alimenta.
 */
export type QKind = 'number' | 'text' | 'textarea' | 'single' | 'multi' | 'slider' | 'percent' | 'measure'
export type Table = 'profiles' | 'body_measurements' | 'color_profiles' | 'style_preferences' | 'lifestyle_profiles' | 'fit_preferences' | 'style_goals'

export interface Question {
  id: string                 // nombre del campo del formulario (unico)
  area: AreaId
  group: string              // subtitulo bajo el que se muestra
  label: string
  kind: QKind
  options?: readonly string[]
  ends?: readonly [string, string] // extremos de un deslizador
  unit?: string
  max?: number               // maximo de opciones en 'multi'
  help?: string
  extracts: string           // que informacion pretende extraer
  feeds: string              // que conclusion del Blueprint (o del chat) alimenta
  store: { table: Table; column: string; key?: string }
}

export const COLOR_NAMES = ['Negro', 'Blanco', 'Gris', 'Azul marino', 'Beige', 'Camel', 'Marrón', 'Oliva', 'Burdeos', 'Azul claro',
  'Verde bosque', 'Rojo', 'Rosa', 'Lila', 'Mostaza'] as const
export const IMAGE_WORDS = ['Limpia', 'Estructurada', 'Relajada', 'Profesional', 'Creativa', 'Elegante', 'Cercana', 'Segura', 'Versátil', 'Discreta'] as const

const P = (column: string): Question['store'] => ({ table: 'profiles', column })
const C = (column: string): Question['store'] => ({ table: 'color_profiles', column })
const L = (column: string, key?: string): Question['store'] => ({ table: 'lifestyle_profiles', column, key })

export const QUESTIONS: Question[] = [
  // ── a1 · Identidad y datos ──────────────────────────────────────
  { id: 'age', area: 'a1', group: 'Sobre ti', label: 'Edad', kind: 'number', extracts: 'Etapa vital; matiza la formalidad y las referencias adecuadas.', feeds: 'Contexto del chat', store: P('age') },
  { id: 'height_cm', area: 'a1', group: 'Sobre ti', label: 'Altura', unit: 'cm', kind: 'number', extracts: 'Escala corporal: largos de prenda y proporción con el resto de medidas.', feeds: 'Proporciones', store: P('height_cm') },
  { id: 'weight_kg', area: 'a1', group: 'Sobre ti', label: 'Peso (opcional)', unit: 'kg', kind: 'number', extracts: 'Dato opcional de contexto; nunca se estima desde fotos.', feeds: 'Contexto del chat', store: P('weight_kg') },
  { id: 'city', area: 'a1', group: 'Sobre ti', label: 'Ciudad y país', kind: 'text', extracts: 'Clima y mercado (tiendas disponibles).', feeds: 'Necesidades de vida; compras (fase 4)', store: P('city') },
  { id: 'sizes', area: 'a1', group: 'Tallas y compras', label: 'Tallas habituales', kind: 'text', help: 'Por ejemplo: camisa M, pantalón 42, calzado 43', extracts: 'Punto de partida de tallaje por marca.', feeds: 'Contexto del chat; compras (fase 4)', store: P('sizes') },
  { id: 'brands', area: 'a1', group: 'Tallas y compras', label: 'Marcas habituales', kind: 'text', extracts: 'Nivel de precio y patrones de las marcas que ya le funcionan.', feeds: 'Contexto del chat; compras (fase 4)', store: P('brands') },
  { id: 'budget_max', area: 'a1', group: 'Tallas y compras', label: 'Presupuesto máximo por prenda', unit: '€', kind: 'number', extracts: 'Techo de gasto por prenda.', feeds: 'Compras (fase 4)', store: P('budget_max') },
  { id: 'fit_pref', area: 'a1', group: 'Ajuste preferido', label: 'Ajuste general preferido', kind: 'single', options: ['Ajustado', 'Regular', 'Relajado', 'Amplio'], extracts: 'Preferencia global de holgura (preferencia, no conclusión objetiva).', feeds: 'Cortes que funcionan', store: P('fit_pref') },

  // ── a2 · Estudio antropometrico (medidas; las fotos siguen el protocolo B) ──
  ...MEASURES.map(([k, l]): Question => ({
    id: k, area: 'a2', group: 'Medidas corporales (cm)', label: l, kind: 'measure', unit: 'cm',
    extracts: `Contorno o largo real (${l.toLowerCase()}), medido con cinta; se guarda con fecha y no se sobrescribe.`,
    feeds: 'Proporciones', store: { table: 'body_measurements', column: 'value_cm', key: k },
  })),

  // ── a3 · Estudio cromatico ─────────────────────────────────────
  { id: 'eye_color', area: 'a3', group: 'Tus colores naturales', label: 'Color de ojos', kind: 'single', options: ['Azul', 'Verde', 'Gris', 'Avellana', 'Marrón claro', 'Marrón oscuro', 'Negro'], extracts: 'Profundidad y contraste natural.', feeds: 'Colorimetría', store: C('eye_color') },
  { id: 'hair_color', area: 'a3', group: 'Tus colores naturales', label: 'Color de pelo (o barba)', kind: 'single', options: ['Rubio claro', 'Rubio oscuro', 'Castaño claro', 'Castaño oscuro', 'Negro', 'Pelirrojo', 'Canoso', 'Sin pelo'], extracts: 'Profundidad y contraste con la piel.', feeds: 'Colorimetría', store: C('hair_color') },
  { id: 'skin_tone', area: 'a3', group: 'Tus colores naturales', label: 'Tono de piel', kind: 'single', options: ['Muy clara', 'Clara', 'Media', 'Morena', 'Oscura'], extracts: 'Profundidad de la piel; base del contraste.', feeds: 'Colorimetría', store: C('skin_tone') },
  { id: 'vein_color', area: 'a3', group: 'Pistas de subtono', label: 'Las venas de tu muñeca, con luz natural, parecen…', kind: 'single', options: ['Azuladas o violetas', 'Verdosas', 'Una mezcla / no lo sé'], extracts: 'Indicio de subtono frío (azuladas) o cálido (verdosas).', feeds: 'Colorimetría', store: C('vein_color') },
  { id: 'sun_reaction', area: 'a3', group: 'Pistas de subtono', label: 'Con el sol…', kind: 'single', options: ['Me quemo y apenas me bronceo', 'Me quemo y luego me bronceo', 'Me bronceo con facilidad', 'Casi nunca me quemo'], extracts: 'Indicio de subtono y profundidad.', feeds: 'Colorimetría', store: C('sun_reaction') },
  { id: 'metal', area: 'a3', group: 'Pistas de subtono', label: '¿Qué metal te favorece más (reloj, anillo)?', kind: 'single', options: ['Plata', 'Oro', 'Los dos por igual', 'No lo sé'], extracts: 'Indicio de subtono frío (plata) o cálido (oro).', feeds: 'Colorimetría', store: C('metal') },
  { id: 'temperature', area: 'a3', group: 'Tu hipótesis', label: 'Temperatura', kind: 'single', options: ['Cálida', 'Neutra', 'Fría'], help: 'Si no lo sabes, déjalo en blanco: lo deduciré de las pistas anteriores.', extracts: 'Subtono declarado (hipótesis hasta validarlo con luz natural).', feeds: 'Colorimetría; Paleta', store: C('temperature') },
  { id: 'depth', area: 'a3', group: 'Tu hipótesis', label: 'Profundidad', kind: 'single', options: ['Clara', 'Media', 'Oscura'], extracts: 'Claridad general de tus colores.', feeds: 'Colorimetría', store: C('depth') },
  { id: 'intensity', area: 'a3', group: 'Tu hipótesis', label: 'Intensidad', kind: 'single', options: ['Suave', 'Media', 'Brillante'], extracts: 'Si te favorecen colores apagados o saturados.', feeds: 'Colorimetría', store: C('intensity') },
  { id: 'contrast', area: 'a3', group: 'Tu hipótesis', label: 'Contraste', kind: 'single', options: ['Bajo', 'Medio', 'Alto'], extracts: 'Diferencia entre piel, pelo y ojos: cuánto contraste admiten tus combinaciones.', feeds: 'Colorimetría', store: C('contrast') },
  { id: 'likes', area: 'a3', group: 'Tus gustos', label: 'Colores que te gusta llevar', kind: 'multi', options: COLOR_NAMES, extracts: 'Preferencia cromática (gusto, no conclusión objetiva).', feeds: 'Paleta', store: C('likes') },
  { id: 'avoids', area: 'a3', group: 'Tus gustos', label: 'Colores que evitas', kind: 'multi', options: COLOR_NAMES, extracts: 'Rechazos cromáticos que la paleta debe respetar o justificar.', feeds: 'Paleta', store: C('avoids') },

  // ── a4 · Identidad estetica ────────────────────────────────────
  ...DIMS.map(([k, l, r]): Question => ({
    id: `d_${k}`, area: 'a4', group: 'Dónde te sitúas', label: `${l} ↔ ${r}`, kind: 'slider', ends: [l, r],
    extracts: `Posición entre ${l.toLowerCase()} y ${r.toLowerCase()} (50 = sin preferencia).`, feeds: 'Identidad estética', store: { table: 'style_preferences', column: 'dims', key: k },
  })),
  { id: 'never_wear', area: 'a4', group: 'Lo que no eres', label: 'Algo que nunca te pondrías', kind: 'text', help: 'Por ejemplo: pantalón pitillo, estampados grandes, americana', extracts: 'Límites del estilo: tan informativos como los gustos.', feeds: 'Identidad estética; Cortes con precaución', store: { table: 'style_preferences', column: 'never_wear' } },

  // ── a5 · Estilo de vida ────────────────────────────────────────
  ...LIFE.map(([k, l]): Question => ({
    id: `l_${k}`, area: 'a5', group: 'Qué parte de tu armario dedicas a…', label: l, kind: 'percent', unit: '%',
    extracts: `Peso de «${l.toLowerCase()}» en tu semana (el reparto debe sumar 100 %).`, feeds: 'Necesidades de vida', store: L('life', k),
  })),
  { id: 'work_formality', area: 'a5', group: 'Tu contexto', label: 'Formalidad de tu trabajo', kind: 'single', options: ['Uniforme', 'Muy formal (traje)', 'Smart casual', 'Casual', 'Teletrabajo', 'No trabajo ahora'], extracts: 'Nivel de formalidad exigido el día a día.', feeds: 'Necesidades de vida', store: L('work_formality') },
  { id: 'climate', area: 'a5', group: 'Tu contexto', label: 'Clima habitual', kind: 'single', options: ['Cálido todo el año', 'Templado, inviernos suaves', 'Cuatro estaciones marcadas', 'Frío y húmedo', 'Varía: viajo mucho'], extracts: 'Pesos de tejido y capas necesarias.', feeds: 'Necesidades de vida', store: L('climate') },
  { id: 'travel', area: 'a5', group: 'Tu contexto', label: '¿Cuánto viajas?', kind: 'single', options: ['Casi nunca', 'Algunas veces al año', 'Una vez al mes o más'], extracts: 'Necesidad de prendas versátiles y que no se arruguen.', feeds: 'Necesidades de vida', store: L('travel') },
  { id: 'laundry', area: 'a5', group: 'Tu contexto', label: '¿Cada cuánto pones lavadoras?', kind: 'single', options: ['A diario o casi', 'Una o dos veces por semana', 'Cada dos semanas o más'], extracts: 'Rotación necesaria: cuántas unidades de lo básico hacen falta.', feeds: 'Necesidades de vida', store: L('laundry') },
  { id: 'constraints', area: 'a5', group: 'Restricciones prácticas', label: 'Restricciones prácticas', kind: 'multi', options: CONSTRAINTS, extracts: 'Condiciones que descartan tejidos o prendas.', feeds: 'Necesidades de vida', store: L('constraints') },

  // ── a6 · Preferencias de vestuario (las prendas de referencia van en su tabla) ──
  ...Object.entries(PREFS).map(([k, o]): Question => ({
    id: `p_${k}`, area: 'a6', group: 'Cortes con los que te sientes bien', label: k[0].toUpperCase() + k.slice(1), kind: 'single', options: o,
    extracts: `Corte preferido en ${k} (preferencia; se contrasta con las medidas).`, feeds: 'Cortes que funcionan; Cortes con precaución', store: { table: 'fit_preferences', column: 'prefs', key: k },
  })),

  // ── a7 · Objetivos de imagen ───────────────────────────────────
  { id: 'image_words', area: 'a7', group: 'La imagen que buscas', label: 'Hasta tres palabras que quieres que piensen al verte', kind: 'multi', options: IMAGE_WORDS, max: 3, extracts: 'Objetivo visual en términos que el motor puede usar.', feeds: 'Objetivos; Identidad estética', store: { table: 'style_goals', column: 'image_words' } },
  ...GOALS.map((q, i): Question => ({
    id: `g${i}`, area: 'a7', group: 'En tus palabras', label: q, kind: 'textarea',
    extracts: 'Motivación y contexto en tus palabras.', feeds: 'Objetivos', store: { table: 'style_goals', column: 'answers', key: `g${i}` },
  })),
]

export const questionsOf = (area: AreaId) => QUESTIONS.filter((q) => q.area === area)

// ── Guardado ──────────────────────────────────────────────────────
type Form = { get(name: string): FormDataEntryValue | null; getAll(name: string): FormDataEntryValue[] }
const num = (v: FormDataEntryValue | null) => (v === null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)
const str = (v: FormDataEntryValue | null) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/**
 * Convierte el formulario de un capitulo en filas por tabla, validando contra la especificacion:
 * solo acepta opciones existentes, respeta maximos y avisa si el reparto no suma 100 %.
 */
export function buildAreaPayload(area: AreaId, f: Form) {
  const rows: Partial<Record<Table, Record<string, any>>> = {}
  const measures: { key: string; value_cm: number }[] = []
  const warnings: string[] = []
  let percentTotal = 0, hasPercent = false

  for (const q of questionsOf(area)) {
    let v: unknown
    switch (q.kind) {
      case 'measure': {
        const n = num(f.get(q.id))
        if (n !== null && n > 0 && n < 300) measures.push({ key: q.store.key!, value_cm: n })
        else if (n !== null) warnings.push(`${q.label}: ${n} cm no parece una medida válida; no la he guardado.`)
        continue
      }
      case 'number': {
        const n = num(f.get(q.id))
        v = n !== null && n >= 0 ? n : null
        break
      }
      case 'slider': v = num(f.get(q.id)) ?? 50; break
      case 'percent': v = num(f.get(q.id)) ?? 0; hasPercent = true; percentTotal += v as number; break
      case 'single': { const s = str(f.get(q.id)); v = s && q.options!.includes(s) ? s : null; break }
      case 'multi': {
        let all = f.getAll(q.id).map(String).filter((s) => q.options!.includes(s))
        if (q.max && all.length > q.max) { warnings.push(`${q.label}: he guardado solo las ${q.max} primeras.`); all = all.slice(0, q.max) }
        v = all
        break
      }
      default: v = str(f.get(q.id))
    }
    const row = (rows[q.store.table] ??= {})
    if (q.store.key) {
      const obj = (row[q.store.column] ??= {})
      if (v !== null) obj[q.store.key] = v
    } else row[q.store.column] = v
  }
  if (hasPercent && percentTotal > 0 && percentTotal !== 100)
    warnings.push(`Tu reparto suma ${percentTotal} %: ajústalo para que sume 100 %.`)
  return { rows, measures, warnings }
}

// ── Lectura ───────────────────────────────────────────────────────
type BundleLike = { profile: any; color: any; style: any; life: any; fit: any; goals: any; measures: Record<string, { value: number; at: string; source: string }> }
const ROW: Record<Exclude<Table, 'body_measurements'>, keyof BundleLike> = {
  profiles: 'profile', color_profiles: 'color', style_preferences: 'style', lifestyle_profiles: 'life', fit_preferences: 'fit', style_goals: 'goals',
}

/** Valor guardado de una pregunta (o undefined). */
export function valueOf(q: Question, b: BundleLike): any {
  if (q.kind === 'measure') return b.measures[q.store.key!]?.value
  const row = b[ROW[q.store.table as keyof typeof ROW]]
  const v = row?.[q.store.column]
  return q.store.key ? v?.[q.store.key] : v
}

/** ¿La respuesta aporta informacion? (50 en un deslizador y 0 % no cuentan). */
export function answered(q: Question, v: any) {
  if (v === null || v === undefined || v === '') return false
  if (Array.isArray(v)) return v.length > 0
  if (q.kind === 'slider') return v !== 50
  if (q.kind === 'percent') return v > 0
  return true
}
