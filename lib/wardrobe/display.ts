import { groupOf, subOf } from './taxonomy'

/** Nombre visible: el que puso el usuario o «Tipo + color». */
export const garmentTitle = (g: Record<string, any>) =>
  g.name || [subOf(g.subcategory)?.label ?? groupOf(g.category)?.label ?? 'Prenda', g.primary_color?.toLowerCase()].filter(Boolean).join(' ')
/** «Pantalones · Recto». */
export const garmentSubtitle = (g: Record<string, any>) => [subOf(g.subcategory)?.label ?? groupOf(g.category)?.label, g.cut].filter(Boolean).join(' · ')
