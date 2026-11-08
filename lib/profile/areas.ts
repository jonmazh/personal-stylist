export const AREAS = [
  { id: 'a1', slug: 'identidad', name: 'Identidad y datos', intro: 'Lo básico para empezar: quién eres, tus tallas habituales y cuánto sueles invertir en una prenda.' },
  { id: 'a2', slug: 'cuerpo', name: 'Estudio antropométrico', intro: 'Tus medidas y tus fotografías. Las medidas las tomas tú; las fotos solo sirven para observar proporciones, nunca para medir.' },
  { id: 'a3', slug: 'color', name: 'Estudio cromático', intro: 'Cómo se comporta el color contigo. Es una hipótesis que se valida con luz natural, no una clasificación cerrada.' },
  { id: 'a4', slug: 'estilo', name: 'Identidad estética', intro: 'Qué quieres transmitir. No hace falta elegir una sola etiqueta: tu estilo puede ser una mezcla.' },
  { id: 'a5', slug: 'vida', name: 'Estilo de vida', intro: 'Para qué te vistes de verdad. Un armario bonito que no sirve a tu semana no es un buen armario.' },
  { id: 'a6', slug: 'prendas', name: 'Preferencias de vestuario', intro: 'Los cortes con los que te sientes bien, prenda a prenda.' },
  { id: 'a7', slug: 'objetivos', name: 'Objetivos de imagen', intro: 'Hacia dónde quieres ir. Lo revisaremos en cada actualización de tu perfil.' },
] as const
export type AreaId = (typeof AREAS)[number]['id']
export const areaBySlug = (slug: string) => AREAS.find((a) => a.slug === slug)

export const MEASURES: [string, string][] = [
  ['pecho', 'Pecho'], ['hombros', 'Hombros'], ['cintura', 'Cintura'], ['cadera', 'Cadera'], ['torso', 'Largo de torso'],
  ['entrepierna', 'Entrepierna'], ['pierna', 'Pierna exterior'], ['muslo', 'Muslo'], ['cuello', 'Cuello'], ['brazo', 'Largo de brazo'],
]
export const DIMS: [string, string, string][] = [
  ['clasico', 'Clásico', 'Contemporáneo'], ['minimalista', 'Minimalista', 'Expresivo'], ['estructurado', 'Estructurado', 'Relajado'],
  ['ajustado', 'Ajustado', 'Amplio'], ['formal', 'Formal', 'Casual'], ['discreto', 'Discreto', 'Llamativo'],
]
export const PREFS: Record<string, string[]> = {
  camisetas: ['Regular', 'Relaxed', 'Ajustada'], camisas: ['Regular', 'Oversize', 'Entallada'], pantalones: ['Recto', 'Amplio', 'Tapered'],
  chaquetas: ['Estructurada', 'Desestructurada'], abrigos: ['Corto', 'Medio', 'Largo'], calzado: ['Minimalista', 'Clásico', 'Deportivo'],
}
export const CONSTRAINTS = ['Camino mucho', 'Necesito prendas que no se arruguen', 'Uso transporte público', 'Llevo uniforme', 'Visto formal a diario', 'Paso calor con facilidad', 'Priorizo la comodidad sobre todo']
export const LIFE: [string, string][] = [['trabajo', 'Trabajo'], ['universidad', 'Estudios'], ['ocio', 'Ocio'], ['deporte', 'Deporte'], ['citas', 'Citas y cenas'], ['eventos', 'Eventos y ocasiones especiales']]
export const GOALS = [
  '¿Qué te gustaría cambiar de tu forma de vestir?', '¿En qué situaciones nunca encuentras la ropa adecuada?',
  '¿Qué imagen quieres proyectar?', '¿Qué prendas usas y cuáles evitas?', '¿Qué te gustaría llevar dentro de seis meses y hoy no te atreves?',
]
export const PHOTO_KINDS = ['frontal', 'lateral', 'espalda', 'rostro'] as const
