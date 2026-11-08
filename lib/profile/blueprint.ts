import { AREAS, DIMS } from './areas'
import type { Bundle } from './data'
import { rule } from '@/lib/diagnosis/rules'

/**
 * Motor de diagnostico: reglas deterministas sobre TUS datos (README 10.4 y 12.4: la IA no calcula).
 * Cada conclusion lleva: conclusion, por que, que haria un estilista, datos usados, que falta,
 * origen y confianza. Ver docs/MOTOR-DIAGNOSTICO.md (npm run docs).
 */
export type Confidence = 'alta' | 'media' | 'baja' | 'sin_datos'
export type Section = 'direccion' | 'cuerpo' | 'color' | 'vida' | 'plan'

export interface Finding {
  key: string
  section: Section
  title: string
  body: string            // la conclusion
  why: string             // «Por qué»
  action: string          // «Qué haría un estilista»
  data_used: string[]
  missing: string[]
  origin: string
  confidence: Confidence
  justification: string   // = why (compatibilidad con versiones anteriores)
  details?: Record<string, unknown>
}

export const SECTIONS: { id: Section; title: string }[] = [
  { id: 'direccion', title: 'Dirección' }, { id: 'cuerpo', title: 'Silueta y cortes' }, { id: 'color', title: 'Color' },
  { id: 'vida', title: 'Tu vida real' }, { id: 'plan', title: 'Plan' },
]

export const CONFIDENCE_LABEL: Record<Confidence, string> = { alta: 'Confianza alta', media: 'Confianza media', baja: 'Hipótesis', sin_datos: 'Sin datos' }
export const CONFIDENCE_RULE: Record<Confidence, string> = {
  alta: 'Datos medidos o declarados que tú has validado (o una conclusión que has confirmado).',
  media: 'Datos declarados o medidos por ti, todavía sin validar; o una observación visual fiable.',
  baja: 'Hipótesis: deducida de pistas indirectas, contradictoria con otros datos o procedente de una foto.',
  sin_datos: 'Falta la información mínima para concluir; se indica qué falta.',
}
export const confLabel = (c: string) => CONFIDENCE_LABEL[c as Confidence] ?? c
export const confClass = (c: string) =>
  c === 'alta' ? 'ok' : c === 'sin_datos' ? 'bad' : c === 'media' || c === 'baja' ? 'warn'
    : /^(Confirm|Alta)/.test(c) ? 'ok' : /^(Sin|Insuf)/.test(c) ? 'bad' : 'warn' // versiones anteriores

/** Muestra aproximada de cada color de la paleta, para dibujarla en el informe. */
export const COLOR_HEX: Record<string, string> = {
  Negro: '#1C1C1C', Blanco: '#F8F7F3', Gris: '#8D8D8A', 'Azul marino': '#1F2A44', Beige: '#D9C7A7', Camel: '#B08D57',
  Marrón: '#5C4033', Oliva: '#6B6B3A', Burdeos: '#6D1F2A', 'Azul claro': '#9DB8D6', 'Verde bosque': '#2F4A36',
  Rojo: '#B0282E', Rosa: '#D9A3AE', Lila: '#B39DC4', Mostaza: '#C99A2E',
}

type Temp = 'Cálida' | 'Fría' | 'Neutra'
const PALETTES: Record<Temp, { cara: string[]; neutros: string[]; acentos: string[]; inferiores: string[] }> = {
  'Cálida': { cara: ['Camel', 'Oliva', 'Mostaza', 'Beige', 'Burdeos'], neutros: ['Camel', 'Beige', 'Marrón', 'Azul marino', 'Gris'], acentos: ['Burdeos', 'Mostaza', 'Oliva', 'Rojo'], inferiores: ['Azul marino', 'Marrón', 'Oliva', 'Beige', 'Gris'] },
  'Fría': { cara: ['Azul claro', 'Lila', 'Rosa', 'Verde bosque', 'Blanco'], neutros: ['Gris', 'Azul marino', 'Negro', 'Blanco'], acentos: ['Burdeos', 'Verde bosque', 'Lila', 'Rojo'], inferiores: ['Gris', 'Azul marino', 'Negro'] },
  'Neutra': { cara: ['Azul claro', 'Verde bosque', 'Beige', 'Burdeos', 'Blanco'], neutros: ['Gris', 'Azul marino', 'Beige', 'Blanco', 'Camel'], acentos: ['Verde bosque', 'Burdeos', 'Azul claro'], inferiores: ['Azul marino', 'Gris', 'Beige', 'Marrón'] },
}
export const PALETTE_GROUPS: [keyof (typeof PALETTES)['Cálida'], string][] = [['cara', 'Cerca de la cara'], ['neutros', 'Neutros (base del armario)'], ['acentos', 'Acentos'], ['inferiores', 'Prendas inferiores']]

const lower = (s: string) => s.toLowerCase()
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}`)
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const has = (v: unknown) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)
const conf = (hasData: boolean, validated: boolean): Confidence => (!hasData ? 'sin_datos' : validated ? 'alta' : 'media')

// ── Inferencias reutilizables ─────────────────────────────────────
export function silhouette(b: Bundle) {
  const m = (k: string) => b.measures[k]?.value
  const pecho = m('pecho'), cintura = m('cintura'), cadera = m('cadera'), entre = m('entrepierna')
  const altura = Number(b.profile?.height_cm) || undefined
  if (!pecho || !cintura) return null
  const drop = pecho - cintura
  const shape = drop >= 20 ? 'v' : drop >= 10 ? 'equilibrada' : drop >= 0 ? 'recta' : 'cintura'
  const hips = cadera !== undefined && cadera - pecho >= 4
  const legRatio = entre && altura ? entre / altura : undefined
  const legs = legRatio === undefined ? undefined : legRatio >= 0.47 ? 'largas' : legRatio <= 0.43 ? 'cortas' : 'equilibradas'
  return { drop, shape, hips, legs, legRatio, pecho, cintura, cadera, entre, altura }
}

const HAIR_DEPTH: Record<string, number> = { 'Rubio claro': 1, 'Rubio oscuro': 2, 'Castaño claro': 2, 'Castaño oscuro': 3, Negro: 4, Pelirrojo: 2, Canoso: 1 }
const SKIN_DEPTH: Record<string, number> = { 'Muy clara': 0, Clara: 1, Media: 2, Morena: 3, Oscura: 4 }

export function colorimetry(b: Bundle) {
  const c = b.color ?? {}
  const clues: string[] = []
  let score = 0, n = 0
  const add = (cond: boolean, s: number, txt: string) => { if (cond) { score += s; n++; clues.push(txt) } }
  add(c.vein_color === 'Verdosas', 1, 'venas verdosas (cálido)')
  add(c.vein_color === 'Azuladas o violetas', -1, 'venas azuladas (frío)')
  add(c.metal === 'Oro', 1, 'te favorece el oro (cálido)')
  add(c.metal === 'Plata', -1, 'te favorece la plata (frío)')
  add(c.sun_reaction === 'Me bronceo con facilidad' || c.sun_reaction === 'Casi nunca me quemo', 0.5, 'te bronceas con facilidad (tiende a cálido)')
  add(c.sun_reaction === 'Me quemo y apenas me bronceo', -0.5, 'te quemas con facilidad (tiende a frío)')
  add(c.hair_color === 'Pelirrojo', 1, 'pelo pelirrojo (cálido)')
  const inferred: Temp | undefined = n === 0 ? undefined : score >= 1 ? 'Cálida' : score <= -1 ? 'Fría' : n >= 2 ? 'Neutra' : undefined
  const declared = (['Cálida', 'Fría', 'Neutra'] as const).find((t) => t === c.temperature)
  const temp = declared ?? inferred
  const conflict = !!(declared && inferred && declared !== inferred)
  const h = HAIR_DEPTH[c.hair_color], s = SKIN_DEPTH[c.skin_tone]
  const inferredContrast = h !== undefined && s !== undefined ? (Math.abs(h - s) >= 2 ? 'Alto' : Math.abs(h - s) === 1 ? 'Medio' : 'Bajo') : undefined
  const contrast: string | undefined = c.contrast ?? inferredContrast
  return { temp, declared, inferred, conflict, clues, contrast, contrastInferred: !c.contrast && !!inferredContrast, depth: c.depth, intensity: c.intensity }
}

// ── Motor ─────────────────────────────────────────────────────────
export function buildFindings(b: Bundle): Finding[] {
  const out: Finding[] = []
  const add = (f: Omit<Finding, 'justification'>) => out.push({ ...f, justification: f.why })
  const v = b.validated

  // ── Direccion de estilo ──
  const dims: Record<string, number> = b.style?.dims ?? {}
  const styles: string[] = b.style?.styles ?? []
  const words: string[] = b.goals?.image_words ?? []
  const never: string | undefined = b.style?.never_wear || undefined
  const leaning = DIMS.map(([k, l, r]) => ({ k, v: dims[k], word: dims[k] >= 65 ? r : dims[k] <= 35 ? l : null })).filter((d) => d.word)
  const dirData = styles.length > 0 || leaning.length > 0
  const DIM_ACTION: Record<string, string> = {
    Minimalista: 'pocas prendas, lisas y sin logos', Expresivo: 'una pieza protagonista por conjunto, no más',
    Estructurado: 'chaquetas de hombro definido y tejidos con cuerpo', Relajado: 'tejidos con caída y cortes con algo de holgura, siempre limpios',
    Clásico: 'prendas de patrón clásico que no caducan', Contemporáneo: 'cortes actuales y alguna textura técnica',
    Formal: 'una capa más formal que tu entorno', Casual: 'básicos de calidad que sustituyan a la americana',
    Discreto: 'neutros y detalles que solo se ven de cerca', Llamativo: 'color o estampado en una sola prenda',
    Ajustado: 'prendas a tu talla exacta, sin tirantez', Amplio: 'volumen controlado: amplio en una zona, limpio en la otra',
  }
  const base = styles[0] ?? (leaning[0] ? cap(lower(leaning[0].word!)) : '')
  const mixed = styles.length >= 2
  const styleText = lower(styles.join(' '))
  // Si la base sale de los ejes (sin estilos), el primer eje ya es la base; se omiten tendencias que repiten un estilo.
  const tendencies = (styles.length ? leaning : leaning.slice(1)).map((d) => lower(d.word!)).filter((w) => !styleText.includes(w.slice(0, 6))).slice(0, 2)
  add({
    key: 'direccion', section: 'direccion', title: 'Dirección de estilo',
    body: dirData
      ? `${mixed ? `Mezcla de ${list(styles.map(lower))}` : base}${tendencies.length ? `, con tendencia a lo ${list(tendencies)}` : ''}.${words.length ? ` Imagen ${list(words.map(lower))}.` : ''}`
      : 'Aún no sé qué quieres transmitir.',
    why: dirData
      ? `Lo deduzco de ${list([styles.length && `los estilos que marcaste (${styles.join(', ')})`, leaning.length && `tu posición en los ejes (${leaning.map((d) => `${lower(d.word!)} ${d.v}/100`).join(', ')})`, words.length && `las palabras que elegiste`].filter(Boolean) as string[])}. ${rule('mezcla')}`
      : 'No has marcado estilos ni te has situado en los ejes del capítulo Identidad estética.',
    action: dirData
      ? `${mixed ? `Usaría uno de tus estilos como base y el otro como toque en una o dos piezas por conjunto; dime cuál pesa más corrigiendo esta conclusión` : `Construiría la base del armario en ${lower(base)}`}. ${leaning.slice(0, 3).map((d) => cap(DIM_ACTION[d.word!] ?? '')).filter(Boolean).join('. ')}${leaning.length ? '.' : ''}${never ? ` Y respetaría tu límite: nada de ${lower(never)}.` : ''}`.trim()
      : 'Empezaría por el capítulo 04: marca dos o tres estilos y sitúate en los ejes; con eso ya puedo proponerte una dirección.',
    data_used: [styles.length && 'Estilos que te atraen', leaning.length && 'Ejes de estilo', words.length && 'Palabras de imagen', never && 'Lo que nunca te pondrías'].filter(Boolean) as string[],
    missing: dirData ? [] : ['Estilos o ejes (capítulo 04)'],
    origin: 'Declarado por ti', confidence: conf(dirData, v.a4),
  })

  // ── Objetivo visual ──
  const ans: Record<string, string> = b.goals?.answers ?? {}
  const WORD_ACTION: Record<string, string> = {
    Limpia: 'prendas lisas, a tu talla y bien cuidadas', Estructurada: 'hombro marcado y tejidos con cuerpo', Relajada: 'tejidos naturales y algo de holgura',
    Profesional: 'una capa más formal que tu entorno', Creativa: 'una textura o un color inesperado por conjunto', Elegante: 'paleta corta y calzado de piel cuidado',
    Cercana: 'colores cálidos y tejidos suaves, sin rigidez', Segura: 'ajuste exacto de hombro y de largo de pantalón', Versátil: 'básicos que combinen todos entre sí',
    Discreta: 'neutros y nada de logos',
  }
  const goalData = words.length > 0 || has(ans.g2) || has(ans.g0)
  add({
    key: 'objetivo', section: 'direccion', title: 'Objetivo visual',
    body: words.length ? `Que al verte piensen: ${list(words.map(lower))}.` : has(ans.g2) ? ans.g2 : goalData ? `Quieres cambiar: ${ans.g0}` : 'Sin objetivo definido todavía.',
    why: goalData ? `${words.length ? `Son las palabras que elegiste${has(ans.g2) ? ` y lo que escribiste («${ans.g2}»)` : ''}.` : `Es lo que escribiste.`}${has(ans.g0) && words.length ? ` Quieres cambiar: «${ans.g0}».` : ''} ${rule('objetivo')}`
      : 'No has respondido el capítulo Objetivos de imagen.',
    action: words.length ? `Para conseguirlo: ${words.map((w) => WORD_ACTION[w]).filter(Boolean).join('; ')}.` : goalData ? 'Elige hasta tres palabras en el capítulo 07: me permiten traducir tu objetivo en decisiones concretas.' : 'Responde el capítulo 07; sin un objetivo, solo puedo recomendar lo que te sienta bien, no lo que quieres transmitir.',
    data_used: [words.length && 'Palabras de imagen', (has(ans.g2) || has(ans.g0)) && 'Respuestas abiertas'].filter(Boolean) as string[],
    missing: words.length ? [] : ['Palabras de imagen (capítulo 07)'],
    origin: 'Declarado por ti', confidence: conf(goalData, v.a7),
  })

  // ── Proporciones ──
  const sil = silhouette(b)
  const SHAPE: Record<string, [string, string]> = {
    v: ['silueta en V marcada', 'Pantalón recto o con algo de volumen para equilibrar los hombros; camisetas a tu talla de hombro sin ceñir la cintura; evitaría hombreras.'],
    equilibrada: ['silueta equilibrada', 'Tienes margen: casi cualquier corte funciona si el hombro está en su sitio. Elegiría por estilo, no por corrección.'],
    recta: ['silueta recta', 'Crearía estructura arriba: chaquetas de hombro definido, camisas algo entalladas y capas abiertas que dibujen una V.'],
    cintura: ['más volumen en la cintura que en el pecho', 'Prendas con caída que no marquen la cintura: camisas regular por fuera, chaquetas sin entallar y pantalón de tiro medio-alto.'],
  }
  if (!sil) {
    add({
      key: 'proporciones', section: 'cuerpo', title: 'Silueta y proporciones',
      body: 'Todavía no puedo valorar tus proporciones.',
      why: 'Las proporciones se calculan con medidas reales; no las estimo a partir de fotos.',
      action: 'Mídete pecho y cintura con una cinta métrica (capítulo 02); con cadera, entrepierna y altura afino mucho más.',
      data_used: [], missing: ['Pecho', 'Cintura'].filter((k) => !b.measures[lower(k)]),
      origin: 'Medición manual', confidence: 'sin_datos',
    })
  } else {
    const [label, act] = SHAPE[sil.shape]
    const legTxt = sil.legs === 'largas' ? ' y piernas largas respecto a tu altura' : sil.legs === 'cortas' ? ' y piernas cortas respecto al torso' : sil.legs ? ' y proporción torso-pierna equilibrada' : ''
    const legAct = sil.legs === 'cortas' ? ' Para alargar la pierna: tiro medio-alto, bajo sin vuelta y calzado del tono del pantalón.' : sil.legs === 'largas' ? ' Puedes permitirte vuelta en el bajo y chaquetas algo más largas.' : ''
    const hipAct = sil.hips ? ' Como la cadera supera al pecho, añadiría volumen arriba (capas, hombro definido) y evitaría pantalones ceñidos.' : ''
    add({
      key: 'proporciones', section: 'cuerpo', title: 'Silueta y proporciones',
      body: `${cap(label)} (pecho − cintura = ${sil.drop} cm)${sil.hips ? ', con más volumen en cadera que en pecho' : ''}${legTxt}.`,
      why: `Pecho ${sil.pecho} cm y cintura ${sil.cintura} cm${sil.cadera ? `, cadera ${sil.cadera} cm` : ''}${sil.legRatio ? `; entrepierna / altura = ${sil.legRatio.toFixed(2)}` : ''}. ${rule('drop')}${sil.hips ? ` ${rule('cadera')}` : ''}${sil.legs ? ` ${rule('pierna')}` : ''}`,
      action: `${act}${hipAct}${legAct}`,
      data_used: ['Pecho', 'Cintura', sil.cadera && 'Cadera', sil.entre && 'Entrepierna', sil.altura && 'Altura'].filter(Boolean) as string[],
      missing: [!sil.cadera && 'Cadera', !sil.entre && 'Entrepierna', !sil.altura && 'Altura (capítulo 01)'].filter(Boolean) as string[],
      origin: 'Medición manual · calculado', confidence: v.a2 ? 'alta' : 'media',
    })
  }

  // ── Cortes que funcionan ──
  const prefs: Record<string, string> = b.fit?.prefs ?? {}
  const prefList = Object.entries(prefs).filter(([, x]) => x).map(([k, x]) => `${k}: ${lower(x)}`)
  const fitPref: string | undefined = b.profile?.fit_pref || undefined
  const SHAPE_CUTS: Record<string, string> = {
    v: 'pantalón recto o amplio, camisetas regular de hombro exacto', equilibrada: 'casi todos los cortes; prioriza el ajuste de hombro',
    recta: 'chaquetas estructuradas, camisas ligeramente entalladas, pantalón recto', cintura: 'camisas regular, chaquetas desestructuradas largas, pantalón de tiro medio-alto',
  }
  const cutsData = prefList.length > 0 || !!sil || !!fitPref
  add({
    key: 'cortes', section: 'cuerpo', title: 'Cortes que funcionan',
    body: !cutsData ? 'Sin datos de cortes ni de medidas.'
      : `${prefList.length ? `Tus preferencias: ${prefList.join('; ')}.` : ''}${fitPref ? ` Ajuste general ${lower(fitPref)}.` : ''}${sil ? ` Por tu silueta: ${SHAPE_CUTS[sil.shape]}.` : ''}`.trim(),
    why: `${prefList.length || fitPref ? 'Las preferencias son tuyas (no una conclusión objetiva)' : 'No has indicado preferencias'}${sil ? '; las contrasto con tu silueta calculada' : '; sin medidas no puedo contrastarlas'}. ${rule('hombro')}`,
    action: `${sil ? `Probaría primero ${SHAPE_CUTS[sil.shape]}.` : 'Con tus medidas podría decirte qué cortes te favorecen además de cuáles te gustan.'}${b.references.length ? ` Usaría tus ${b.references.length} prendas de referencia para elegir talla en cada compra.` : ' Registra una prenda que te quede bien (capítulo 06): es la mejor guía de talla.'}`,
    data_used: [prefList.length && 'Cortes preferidos', fitPref && 'Ajuste general', sil && 'Silueta calculada', b.references.length && 'Prendas de referencia'].filter(Boolean) as string[],
    missing: [!prefList.length && 'Cortes preferidos (capítulo 06)', !sil && 'Pecho y cintura (capítulo 02)'].filter(Boolean) as string[],
    origin: sil ? 'Declarado por ti · calculado' : 'Declarado por ti', confidence: !cutsData ? 'sin_datos' : v.a6 && (!sil || v.a2) ? 'alta' : 'media',
  })

  // ── Cortes con precaucion ──
  const cautions: string[] = []
  if (prefs.pantalones === 'Amplio' && (prefs.camisas === 'Oversize' || prefs.camisetas === 'Relaxed')) cautions.push('volumen amplio arriba y abajo a la vez')
  if (sil?.hips && prefs.pantalones === 'Tapered') cautions.push('pantalón tapered: marca la cadera')
  if (sil?.shape === 'cintura' && (prefs.camisetas === 'Ajustada' || prefs.camisas === 'Entallada')) cautions.push('camisetas o camisas ceñidas: marcan la cintura')
  if (sil?.legs === 'cortas' && prefs.abrigos === 'Largo') cautions.push('abrigo largo: acorta la pierna')
  if (sil?.shape === 'v' && prefs.chaquetas === 'Estructurada') cautions.push('chaquetas muy estructuradas: exageran la V')
  add({
    key: 'precaucion', section: 'cuerpo', title: 'Cortes con precaución',
    body: cautions.length ? `${cap(list(cautions))}.` : cutsData ? 'Con tus datos no veo cortes problemáticos.' : 'Sin datos para valorarlo.',
    why: cautions.length ? `Cruzo tus preferencias con tu silueta. ${rule('volumen')}` : cutsData ? 'Ninguna de tus preferencias choca con tu silueta.' : 'Necesito tus cortes preferidos o tus medidas.',
    action: cautions.length ? 'No los descartaría: los equilibraría con una pieza de línea limpia y los probaría antes de comprar.' : never ? `Mantendría tu límite: nada de ${lower(never)}.` : 'Seguiría con tus cortes habituales.',
    data_used: [prefList.length && 'Cortes preferidos', sil && 'Silueta calculada'].filter(Boolean) as string[],
    missing: cutsData ? [] : ['Cortes preferidos o medidas'],
    origin: 'Calculado a partir de tus datos', confidence: !cutsData ? 'sin_datos' : sil && prefList.length ? 'media' : 'baja',
  })

  // ── Colorimetria ──
  const col = colorimetry(b)
  const TEMP_ACTION: Record<Temp, string> = {
    'Cálida': 'Cerca de la cara, colores con base amarilla: camel, oliva, crudo en vez de blanco óptico; metal dorado.',
    'Fría': 'Cerca de la cara, colores con base azul: azul marino, gris, blanco óptico; metal plateado.',
    'Neutra': 'Tienes margen a ambos lados; evitaría solo los extremos (naranja intenso, rosa muy frío) cerca de la cara.',
  }
  const CONTRAST_ACTION: Record<string, string> = {
    Alto: 'Combinaría claro con oscuro (blanco y marino) para estar a la altura de tu contraste.',
    Medio: 'Combinaría un neutro claro con uno medio; el blanco y negro puro, mejor lejos de la cara.',
    Bajo: 'Combinaciones tono sobre tono; evitaría blanco y negro juntos cerca de la cara.',
  }
  const colConf: Confidence = !col.temp ? 'sin_datos' : v.a3 ? 'alta' : !col.declared || col.conflict ? 'baja' : 'media'
  add({
    key: 'colorimetria', section: 'color', title: 'Colorimetría',
    body: !col.temp ? 'Sin datos para estimar tu subtono.'
      : `Subtono ${({ 'Cálida': 'cálido', 'Fría': 'frío', 'Neutra': 'neutro' } as const)[col.temp]}${col.contrast ? `, contraste ${lower(col.contrast)}` : ''}${col.depth ? `, profundidad ${lower(col.depth)}` : ''}${col.intensity ? `, intensidad ${lower(col.intensity)}` : ''}.${col.conflict ? ` Ojo: tus pistas apuntan a ${lower(col.inferred!)}.` : ''}`,
    why: !col.temp ? 'No has indicado temperatura ni pistas de subtono.'
      : `${col.declared ? `Lo declaraste tú${col.clues.length ? ` y tus pistas (${col.clues.join(', ')}) ${col.conflict ? 'apuntan a otro lado' : 'lo respaldan'}` : ''}` : `Lo deduzco de tus pistas: ${col.clues.join(', ')}`}.${col.contrastInferred ? ' El contraste lo calculo con tu color de pelo y de piel.' : ''} ${rule('subtono')} ${rule('luz')}`,
    action: !col.temp ? 'Responde las pistas de subtono del capítulo 03 (venas, metal, sol): bastan dos minutos.'
      : `${TEMP_ACTION[col.temp]} ${col.contrast ? CONTRAST_ACTION[col.contrast] ?? '' : ''} ${col.conflict || !col.declared ? 'Lo validaría con la foto de rostro con luz natural y un folio blanco.' : ''}`.replace(/\s+/g, ' ').trim(),
    data_used: [col.declared && 'Temperatura declarada', col.clues.length && 'Pistas de subtono', col.contrast && (col.contrastInferred ? 'Color de pelo y piel' : 'Contraste declarado')].filter(Boolean) as string[],
    missing: [!col.temp && 'Temperatura o pistas de subtono (capítulo 03)', !col.contrast && 'Color de pelo y tono de piel'].filter(Boolean) as string[],
    origin: col.declared ? 'Declarado por ti' : 'Deducido de tus respuestas', confidence: colConf,
  })

  // ── Paleta ──
  const avoids: string[] = b.color?.avoids ?? [], likes: string[] = b.color?.likes ?? []
  if (col.temp) {
    const base = PALETTES[col.temp]
    const groups = Object.fromEntries(Object.entries(base).map(([g, xs]) => [g, xs.filter((x) => !avoids.includes(x))])) as typeof base
    const inPalette = new Set([...groups.cara, ...groups.neutros])
    const far = likes.filter((x) => !inPalette.has(x) && !avoids.includes(x))
    const removed = avoids.filter((x) => Object.values(base).some((xs) => xs.includes(x)))
    const tonal = col.contrast === 'Bajo'
    const combos = tonal
      ? [[groups.neutros[0], groups.neutros[1], groups.inferiores[0]], [groups.cara[0], groups.neutros[2] ?? groups.neutros[0], groups.inferiores[1] ?? groups.inferiores[0]]]
      : [[groups.cara[0], groups.inferiores[0], groups.acentos[0]], [groups.neutros[0], groups.inferiores[1] ?? groups.inferiores[0], groups.acentos[1] ?? groups.acentos[0]]]
    const combosTxt = combos.map((c) => [...new Set(c.filter(Boolean))].map(lower).join(' + ')).filter((c) => c.includes('+'))
    add({
      key: 'paleta', section: 'color', title: 'Paleta',
      body: `Neutros: ${list(groups.neutros.map(lower))}. Cerca de la cara: ${list(groups.cara.map(lower))}. Acentos: ${list(groups.acentos.map(lower))}.`,
      why: `Sale de tu subtono ${({ 'Cálida': 'cálido', 'Fría': 'frío', 'Neutra': 'neutro' } as const)[col.temp]}${col.contrast ? ` y tu contraste ${lower(col.contrast)}` : ''}. ${rule('cara')}${removed.length ? ` He quitado lo que evitas (${list(removed.map(lower))}).` : ''}`,
      action: `Empezaría por los neutros: son el 70 % del armario. Los acentos, en prendas pequeñas o cerca de la cara. Combinaciones para empezar: ${combosTxt.join('; ')}.${far.length ? ` ${list(far)} te gusta${far.length > 1 ? 'n' : ''}: llévalo${far.length > 1 ? 's' : ''} lejos de la cara (pantalón, calzado).` : ''}`,
      data_used: ['Colorimetría', likes.length && 'Colores que te gustan', avoids.length && 'Colores que evitas'].filter(Boolean) as string[],
      missing: colConf === 'baja' ? ['Validar la colorimetría con luz natural'] : [],
      origin: 'Calculado a partir de tu colorimetría', confidence: colConf === 'alta' ? 'alta' : colConf,
      details: { groups, combos: combosTxt, far },
    })
  } else {
    add({
      key: 'paleta', section: 'color', title: 'Paleta',
      body: 'Sin paleta todavía.', why: 'La paleta depende de tu subtono, que aún no conozco.',
      action: 'Responde las pistas de subtono del capítulo 03 y te propongo neutros, acentos y combinaciones.',
      data_used: [], missing: ['Colorimetría (capítulo 03)'], origin: 'Calculado a partir de tu colorimetría', confidence: 'sin_datos',
    })
  }

  // ── Necesidades de vida ──
  const life: Record<string, number> = b.life?.life ?? {}
  const LIFE_LABEL: Record<string, string> = { trabajo: 'trabajo', universidad: 'estudios', ocio: 'ocio', deporte: 'deporte', citas: 'citas y cenas', eventos: 'eventos' }
  const total = Object.values(life).reduce((a, x) => a + (Number(x) || 0), 0)
  const top = Object.entries(life).filter(([, x]) => x > 0).sort((a, z) => z[1] - a[1]).slice(0, 2)
  const lf = b.life ?? {}
  const FORMALITY: Record<string, string> = {
    Uniforme: 'Llevas uniforme: tu armario personal es para ocio y fin de semana; ahí invertiría.',
    'Muy formal (traje)': 'Dos trajes de lana fría (marino y gris), camisas blancas y azul claro, y zapatos de piel que alternar.',
    'Smart casual': 'Chinos y pantalón de lana, camisas oxford, punto fino y una americana desestructurada.',
    Casual: 'Vaqueros oscuros, camisetas de calidad, sobrecamisa y zapatillas limpias.',
    Teletrabajo: 'Punto de calidad y camisas que funcionen en videollamada; comodidad sin pijama.',
    'No trabajo ahora': 'Prioriza lo que más usas fuera de casa.',
  }
  const CLIMATE: Record<string, string> = {
    'Cálido todo el año': 'tejidos ligeros (lino, algodón fino) y colores claros',
    'Templado, inviernos suaves': 'capas ligeras y un abrigo medio',
    'Cuatro estaciones marcadas': 'capas: punto fino, sobrecamisa y un buen abrigo',
    'Frío y húmedo': 'lana, un abrigo impermeable y calzado que aguante agua',
    'Varía: viajo mucho': 'capas combinables que sirvan en varios climas',
  }
  const LAUNDRY: Record<string, string> = {
    'A diario o casi': 'con 4–5 camisetas básicas te basta', 'Una o dos veces por semana': 'necesitas unas 7–8 camisetas y 5 camisas',
    'Cada dos semanas o más': 'necesitas 10 o más camisetas: pocas lavadoras piden más unidades',
  }
  const lifeData = top.length > 0 || has(lf.work_formality)
  const lifeActions = [lf.work_formality && FORMALITY[lf.work_formality], lf.climate && `Por tu clima: ${CLIMATE[lf.climate]}.`,
    lf.travel === 'Una vez al mes o más' && 'Como viajas mucho: prendas que no se arruguen y todo combinable en tres colores.',
    lf.laundry && `Por tu ritmo de lavado, ${LAUNDRY[lf.laundry]}.`,
    (lf.constraints ?? []).includes('Camino mucho') && 'Caminas mucho: calzado con suela de goma que no parezca deportivo.'].filter(Boolean) as string[]
  add({
    key: 'vida', section: 'vida', title: 'Necesidades de vida',
    body: !lifeData ? 'Sin datos de tu día a día.'
      : `${top.map(([k, x]) => `${cap(LIFE_LABEL[k] ?? k)} ${x} %`).join(', ')}${lf.work_formality ? `${top.length ? '; ' : ''}trabajo ${lower(lf.work_formality)}` : ''}${lf.climate ? `; clima ${lower(lf.climate)}` : ''}.${total > 0 && total !== 100 ? ` Tu reparto suma ${total} %, no 100 %.` : ''}`,
    why: lifeData ? `Es tu reparto declarado${lf.work_formality ? ' y la formalidad de tu trabajo' : ''}. ${rule('reparto')}${lf.laundry ? ` ${rule('rotacion')}` : ''}` : 'No has rellenado el capítulo Estilo de vida.',
    action: lifeActions.length ? lifeActions.join(' ') : 'Rellena el capítulo 05: sin saber para qué te vistes, solo puedo recomendar prendas bonitas, no útiles.',
    data_used: [top.length && 'Reparto del armario', lf.work_formality && 'Formalidad del trabajo', lf.climate && 'Clima', lf.travel && 'Viajes', lf.laundry && 'Lavado', (lf.constraints ?? []).length && 'Restricciones'].filter(Boolean) as string[],
    missing: [!top.length && 'Reparto del armario (capítulo 05)', top.length && total !== 100 && 'Ajustar el reparto a 100 %', !lf.climate && 'Clima habitual'].filter(Boolean) as string[],
    origin: 'Declarado por ti', confidence: conf(lifeData, v.a5),
  })

  // ── Prioridades de armario ──
  const priorities: string[] = []
  if (!b.garments.length) priorities.push('Inventariar lo que ya tienes antes de comprar nada: evita duplicados (armario digital, fase 2).')
  if (lf.work_formality && FORMALITY[lf.work_formality] && (top[0]?.[0] === 'trabajo' || !top.length)) priorities.push(`Cubrir el trabajo, que es lo que más usas: ${lower(FORMALITY[lf.work_formality])}`)
  else if (top[0]) priorities.push(`Cubrir ${LIFE_LABEL[top[0][0]] ?? top[0][0]}, que es tu ${top[0][1]} %.`)
  const pal = out.find((f) => f.key === 'paleta')?.details as { groups?: Record<string, string[]> } | undefined
  if (pal?.groups) priorities.push(`Básicos en tus neutros (${list(pal.groups.neutros.slice(0, 3).map(lower))}) antes que acentos.`)
  if (b.references.length === 0) priorities.push('Registrar una prenda que te quede perfecta: será tu patrón de talla.')
  const prioData = lifeData || !!pal?.groups
  add({
    key: 'prioridades', section: 'plan', title: 'Prioridades de armario',
    body: priorities.slice(0, 3).map((p, i) => `${i + 1}. ${p}`).join(' '),
    why: `Ordeno por impacto: primero evitar compras inútiles, después lo que más usas, después la base de color. ${rule('reparto')}`,
    action: 'Haría las compras en este orden y ninguna fuera de la lista hasta tener la base.',
    data_used: [lifeData && 'Necesidades de vida', pal?.groups && 'Paleta', 'Armario registrado'].filter(Boolean) as string[],
    missing: prioData ? [] : ['Estilo de vida y colorimetría'],
    origin: 'Calculado a partir de tus datos', confidence: prioData ? 'media' : 'baja',
  })

  // ── Observaciones de la IA (propuestas visuales, nunca hechos) ──
  const SECTION_OF: Record<string, Section> = { antropometria: 'cuerpo', colorimetria: 'color', estilo: 'direccion' }
  for (const o of b.observations) add({
    key: `ia:${o.title}`, section: SECTION_OF[o.area] ?? 'cuerpo', title: `IA · ${o.title}`, body: o.body,
    why: `${o.justification ?? ''} Es una observación visual sobre la foto ${o.source_photo ?? ''}.`.trim(),
    action: 'Contrástalo con tus medidas o con un espejo. Si no te reconoces, corrígelo: tu criterio manda.',
    data_used: [`Foto ${o.source_photo ?? ''}`.trim()], missing: [],
    origin: `IA · foto ${o.source_photo ?? '—'}`, confidence: o.confidence === 'alta' ? 'media' : 'baja',
  })

  // ── Proximos pasos (lo que mas sube la confianza) ──
  const steps: string[] = []
  for (const f of out) for (const m of f.missing) if (steps.length < 6 && !steps.includes(m)) steps.push(m)
  const unvalidated = AREAS.filter((a) => !v[a.id]).map((a) => `Revisar y validar el capítulo ${lower(a.name)}.`)
  const pendingReview = 'Confirmar o corregir cada conclusión de este diagnóstico.'
  const nextSteps = [...steps.map((s) => `Completar: ${lower(s)}.`), ...unvalidated, pendingReview].slice(0, 3)
  add({
    key: 'pasos', section: 'plan', title: 'Próximos pasos',
    body: nextSteps.length ? nextSteps.map((s, i) => `${i + 1}. ${cap(s)}`).join(' ') : 'Tu expediente está completo y validado: el siguiente paso es tu armario (fase 2).',
    why: 'Son los datos que faltan o están sin validar y que más suben la confianza de este diagnóstico.',
    action: 'Haría primero el paso 1: en diez minutos el diagnóstico gana precisión.',
    data_used: ['Estado del expediente'], missing: [],
    origin: 'Calculado a partir de tu expediente', confidence: 'alta',
  })

  const order = SECTIONS.map((s) => s.id)
  return out.sort((a, z) => order.indexOf(a.section) - order.indexOf(z.section))
}
