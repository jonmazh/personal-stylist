export const AREAS = [
  { id: 'a1', name: 'Identidad y datos' },
  { id: 'a2', name: 'Estudio antropométrico' },
  { id: 'a3', name: 'Estudio cromático' },
  { id: 'a4', name: 'Identidad estética' },
  { id: 'a5', name: 'Estilo de vida' },
  { id: 'a6', name: 'Preferencias de vestuario' },
  { id: 'a7', name: 'Objetivos de imagen' },
] as const
export type AreaId = (typeof AREAS)[number]['id']

export const MEASURES: [string, string][] = [
  ['pecho', 'Pecho'], ['hombros', 'Hombros'], ['cintura', 'Cintura'], ['cadera', 'Cadera'], ['torso', 'Largo de torso'],
  ['entrepierna', 'Entrepierna'], ['pierna', 'Pierna exterior'], ['muslo', 'Muslo'], ['cuello', 'Cuello'], ['brazo', 'Largo de brazo'],
]
export const DIMS: [string, string, string][] = [
  ['clasico', 'Clásico', 'Contemporáneo'], ['minimalista', 'Minimalista', 'Expresivo'], ['estructurado', 'Estructurado', 'Relajado'],
  ['ajustado', 'Ajustado', 'Amplio'], ['formal', 'Formal', 'Casual'], ['discreto', 'Discreto', 'Llamativo'],
]
export const STYLES = ['Clásico contemporáneo', 'Minimalismo escandinavo', 'Elegancia italiana', 'Workwear', 'Streetwear contemporáneo', 'Preppy / Ivy League', 'Casual sofisticado', 'Old money']
export const PREFS: Record<string, string[]> = {
  camisetas: ['Regular', 'Relaxed', 'Ajustada'], camisas: ['Regular', 'Oversize', 'Entallada'], pantalones: ['Recto', 'Amplio', 'Tapered'],
  chaquetas: ['Estructurada', 'Desestructurada'], abrigos: ['Corto', 'Medio', 'Largo'], calzado: ['Minimalista', 'Clásico', 'Deportivo'],
}
export const CONSTRAINTS = ['Camino mucho', 'Necesito prendas que no se arruguen', 'Uso transporte público', 'Llevo uniforme', 'Visto formal a diario']
export const LIFE: [string, string][] = [['trabajo', 'Trabajo'], ['ocio', 'Ocio'], ['deporte', 'Deporte'], ['eventos', 'Eventos']]
export const GOALS = [
  '¿Qué te gustaría cambiar de tu forma de vestir?', '¿En qué situaciones nunca encuentras la ropa adecuada?',
  '¿Qué imagen quieres proyectar?', '¿Qué prendas usas y cuáles evitas?', '¿Qué te gustaría llevar dentro de seis meses y hoy no te atreves?',
]
export const PHOTO_KINDS = ['frontal', 'lateral', 'espalda', 'rostro'] as const
