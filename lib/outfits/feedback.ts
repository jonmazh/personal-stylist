/**
 * Outfit Feedback (fase 3D): vocabulario de las valoraciones. Es DATOS: la migracion 0014 usa estas listas en sus
 * CHECK (una prueba lo verifica). Una valoracion no cambia nada por si sola: alimenta patrones (lib/outfits/learning.ts).
 */
export const RATINGS = [
  { id: 'love', label: 'Me encanta', info: 'Preferencia muy positiva' },
  { id: 'like', label: 'Me gusta', info: 'Buena aceptación' },
  { id: 'dislike', label: 'No me convence', info: 'Preferencia negativa' },
] as const
export const FLAGS = [
  { id: 'worn', label: 'Me lo he puesto', info: 'Uso real' },
  { id: 'comfortable', label: 'Me sentí cómodo', info: 'Experiencia' },
  { id: 'well_dressed', label: 'Me sentí bien vestido', info: 'Confianza subjetiva' },
  { id: 'would_repeat', label: 'Lo repetiría', info: 'Intención de repetición' },
] as const
export const REASONS = [
  { id: 'cut', label: 'El corte no es el que busco' },
  { id: 'colors', label: 'Los colores no me gustan juntos' },
  { id: 'too_formal', label: 'Es demasiado formal' },
  { id: 'too_informal', label: 'Es demasiado informal' },
  { id: 'not_me', label: 'No me representa' },
  { id: 'uncomfortable', label: 'No me siento cómodo' },
  { id: 'garment', label: 'No me gusta una de las prendas' },
  { id: 'prefer_other', label: 'Prefiero otra alternativa' },
] as const
export const FORMULA_STATUSES = [
  { id: 'pending', label: 'Pendiente de probar' }, { id: 'tested', label: 'Probada' }, { id: 'validated', label: 'Validada' }, { id: 'retired', label: 'Ya no representa mi estilo' },
] as const
export const FORMULA_SOURCES = [{ id: 'stylist', label: 'Creada por el estilista' }, { id: 'user', label: 'Creada por ti' }] as const
export const label = (xs: readonly { id: string; label: string }[], id?: string | null) => xs.find((x) => x.id === id)?.label ?? id ?? '—'
