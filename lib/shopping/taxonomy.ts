import { z } from 'zod'
import { GARMENT_COLORS, GROUPS, OCCASIONS, SEASONS, SUBS } from '@/lib/wardrobe/taxonomy'

/**
 * Personal Shopper (fase 4A): vocabulario de compras. Es DATOS: la migracion 0016 usa estas listas en sus CHECK
 * (una prueba lo verifica) y docs/PERSONAL-SHOPPER.md se genera desde aqui (npm run docs).
 */
export const NEED_TYPES = [
  { id: 'need', label: 'Necesidad', help: 'Falta una categoría o una función en tu armario.' },
  { id: 'improvement', label: 'Mejora', help: 'Ya tienes algo parecido, pero una alternativa mejoraría claramente tu vestuario.' },
  { id: 'replacement', label: 'Sustitución', help: 'Una prenda actual necesita reemplazo.' },
  { id: 'desire', label: 'Deseo', help: 'Te gustaría tenerla, aunque no sea necesaria. Es legítimo: solo hay que saber que es un deseo.' },
] as const
export type NeedType = (typeof NEED_TYPES)[number]['id']
export const NEED_STATUSES = [
  { id: 'detected', label: 'Detectada', help: 'Necesidad identificada.' },
  { id: 'searching', label: 'Buscando', help: 'Se están buscando alternativas.' },
  { id: 'listed', label: 'En lista', help: 'Producto candidato guardado.' },
  { id: 'comparing', label: 'Comparando', help: 'Evaluando alternativas.' },
  { id: 'approved', label: 'Aprobada', help: 'Has decidido comprar.' },
  { id: 'purchased', label: 'Comprada', help: 'Adquisición realizada.' },
  { id: 'discarded', label: 'Descartada', help: 'Has decidido no comprar.' },
  { id: 'watching', label: 'En seguimiento', help: 'Pendiente de talla, stock o precio.' },
] as const
export type NeedStatus = (typeof NEED_STATUSES)[number]['id']
/** Estados abiertos: cuentan para el diagnóstico; aprobada cuenta además para el presupuesto comprometido. */
export const OPEN_STATUSES: NeedStatus[] = ['detected', 'searching', 'listed', 'comparing', 'approved', 'watching']
export const NEED_ORIGINS = [
  { id: 'detected', label: 'Detectada por el estilista' }, { id: 'audit', label: 'Aprobada en la auditoría' }, { id: 'user', label: 'Añadida por ti' },
] as const
export const PRIORITIES = [{ id: 'high', label: 'Alta' }, { id: 'medium', label: 'Media' }, { id: 'low', label: 'Baja' }] as const
export const BUDGET_PERIODS = [
  { id: 'monthly', label: 'Mensual', months: 1 }, { id: 'quarterly', label: 'Trimestral', months: 3 }, { id: 'season', label: 'Por temporada', months: 6 },
] as const
/** Tiendas y marcas para las preferencias (en 4B pasarán a la tabla retailers con sus fuentes autorizadas). */
export const RETAILERS = [
  { id: 'zara', name: 'Zara', group: 'Inditex' }, { id: 'massimo-dutti', name: 'Massimo Dutti', group: 'Inditex' }, { id: 'pull-and-bear', name: 'Pull&Bear', group: 'Inditex' },
  { id: 'bershka', name: 'Bershka', group: 'Inditex' }, { id: 'stradivarius', name: 'Stradivarius', group: 'Inditex' },
  { id: 'cos', name: 'COS', group: 'Complementarias' }, { id: 'arket', name: 'ARKET', group: 'Complementarias' }, { id: 'uniqlo', name: 'Uniqlo', group: 'Complementarias' },
  { id: 'mango-man', name: 'Mango Man', group: 'Complementarias' }, { id: 'selected-homme', name: 'Selected Homme', group: 'Complementarias' },
] as const
export const label = (xs: readonly { id: string; label?: string; name?: string }[], id?: string | null) => { const x = xs.find((y) => y.id === id); return x?.label ?? x?.name ?? id ?? '—' }

// ── Especificación de la prenda buscada (criterios de búsqueda; en 4D será la «prenda virtual» de la simulación) ──
const ids = <T extends { id: string }>(xs: readonly T[]) => xs.map((x) => x.id) as [string, ...string[]]
export const NeedSpec = z.object({
  category: z.enum(ids(GROUPS)),
  subcategory: z.enum(ids(SUBS)).nullable().optional(),
  colors: z.array(z.enum(GARMENT_COLORS as [string, ...string[]])).max(4).default([]),
  cut: z.string().max(30).nullable().optional(),
  silhouette: z.enum(['Ajustada', 'Regular', 'Amplia']).nullable().optional(),
  formality_min: z.number().int().min(1).max(5).nullable().optional(),
  formality_max: z.number().int().min(1).max(5).nullable().optional(),
  seasons: z.array(z.enum(ids(SEASONS))).max(4).default([]),
  occasions: z.array(z.enum(ids(OCCASIONS))).max(6).default([]),
  materials: z.string().max(120).nullable().optional(),
  details: z.string().max(400).nullable().optional(),
})
export type NeedSpecT = z.infer<typeof NeedSpec>
