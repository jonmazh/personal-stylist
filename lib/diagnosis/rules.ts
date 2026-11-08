/**
 * Reglas profesionales del motor de diagnostico. Cada conclusion cita las reglas que aplica en su «Por qué».
 * Son criterios de estilismo de uso comun, no verdades cientificas: el motor los aplica a TUS datos y
 * nunca sustituye un dato que falta por un valor inventado.
 */
export interface Rule { id: string; area: 'Estilo' | 'Proporciones' | 'Color' | 'Cortes' | 'Vida'; text: string }

export const RULES = {
  // Estilo
  mezcla: { id: 'mezcla', area: 'Estilo', text: 'Un estilo personal suele ser una base (70–80 % del armario) con una influencia que aparece en una o dos piezas por conjunto.' },
  objetivo: { id: 'objetivo', area: 'Estilo', text: 'El objetivo de imagen manda sobre las tendencias: cada prenda nueva tiene que acercarte a las palabras que elegiste.' },
  limites: { id: 'limites', area: 'Estilo', text: 'Lo que nunca te pondrías es un límite, no un reto: un buen estilista trabaja dentro de él.' },
  // Proporciones
  drop: { id: 'drop', area: 'Proporciones', text: 'La diferencia entre contorno de pecho y de cintura define la silueta: 20 cm o más es una V marcada; 10–19, equilibrada; 0–9, recta; negativa, más volumen en la cintura.' },
  cadera: { id: 'cadera', area: 'Proporciones', text: 'Si la cadera supera al pecho en 4 cm o más, el volumen visual está abajo y conviene equilibrarlo arriba.' },
  pierna: { id: 'pierna', area: 'Proporciones', text: 'Entrepierna / altura ≥ 0,47 indica piernas largas; ≤ 0,43, piernas cortas respecto al torso.' },
  hombro: { id: 'hombro', area: 'Cortes', text: 'El hombro es lo único que un sastre no arregla bien: una prenda que no encaja de hombro no es tu talla.' },
  volumen: { id: 'volumen', area: 'Cortes', text: 'Un volumen se equilibra con una línea limpia: amplio arriba y amplio abajo a la vez borra la silueta.' },
  // Color
  luz: { id: 'luz', area: 'Color', text: 'La colorimetría es una hipótesis: la luz y el procesado del móvil alteran el color; se valida con luz natural.' },
  subtono: { id: 'subtono', area: 'Color', text: 'Venas verdosas, preferencia por el oro y facilidad para broncearse apuntan a subtono cálido; venas azuladas, plata y quemarse con facilidad, a frío.' },
  contraste: { id: 'contraste', area: 'Color', text: 'El contraste natural (diferencia de claridad entre pelo y piel) marca cuánto contraste admiten tus combinaciones.' },
  cara: { id: 'cara', area: 'Color', text: 'El color importa sobre todo cerca de la cara; lejos de ella (pantalones, calzado) casi cualquier neutro funciona.' },
  // Vida
  reparto: { id: 'reparto', area: 'Vida', text: 'El armario debe repartirse como tu semana: lo que ocupa más tiempo merece más prendas y más inversión.' },
  rotacion: { id: 'rotacion', area: 'Vida', text: 'La frecuencia de lavado fija cuántas unidades de lo básico necesitas para no repetir prendas sucias.' },
} as const satisfies Record<string, Rule>

export type RuleId = keyof typeof RULES
export const rule = (id: RuleId) => RULES[id].text
