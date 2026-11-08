/** Paletas por temperatura cromatica: base de la paleta digital y del encaje de color (colorFit). */
export type Temp = 'Cálida' | 'Fría' | 'Neutra'
export const PALETTES: Record<Temp, { cara: string[]; neutros: string[]; acentos: string[]; inferiores: string[] }> = {
  'Cálida': { cara: ['Camel', 'Oliva', 'Mostaza', 'Beige', 'Burdeos'], neutros: ['Camel', 'Beige', 'Marrón', 'Azul marino', 'Gris'], acentos: ['Burdeos', 'Mostaza', 'Oliva', 'Rojo'], inferiores: ['Azul marino', 'Marrón', 'Oliva', 'Beige', 'Gris'] },
  'Fría': { cara: ['Azul claro', 'Lila', 'Rosa', 'Verde bosque', 'Blanco'], neutros: ['Gris', 'Azul marino', 'Negro', 'Blanco'], acentos: ['Burdeos', 'Verde bosque', 'Lila', 'Rojo'], inferiores: ['Gris', 'Azul marino', 'Negro'] },
  'Neutra': { cara: ['Azul claro', 'Verde bosque', 'Beige', 'Burdeos', 'Blanco'], neutros: ['Gris', 'Azul marino', 'Beige', 'Blanco', 'Camel'], acentos: ['Verde bosque', 'Burdeos', 'Azul claro'], inferiores: ['Azul marino', 'Gris', 'Beige', 'Marrón'] },
}
export const PALETTE_GROUPS: [keyof (typeof PALETTES)['Cálida'], string][] = [['cara', 'Cerca de la cara'], ['neutros', 'Neutros (base del armario)'], ['acentos', 'Acentos'], ['inferiores', 'Prendas inferiores']]

