import { z } from 'zod'
import { STYLE_CATALOG } from '@/lib/style/catalog'
import {
  ATTRIBUTES, COMPOSITION_SOURCES, CONDITIONS, CUTS, GARMENT_COLORS, GROUPS, IMAGE_ROLES, OCCASIONS, PATTERNS, SEASONS, SILHOUETTES, STATUSES,
  familyOf, subOf,
} from './taxonomy'

/**
 * Validacion de la ficha de una prenda, comun a las APIs REST y a las acciones del servidor.
 * Todo valor cerrado se comprueba contra la taxonomia; lo que no encaja se descarta con un aviso, nunca se inventa.
 */
const ids = <T extends { id: string }>(xs: readonly T[]) => xs.map((x) => x.id) as [string, ...string[]]
const text = (max: number) => z.string().trim().max(max).transform((v) => v || null).nullable()

export const GarmentInput = z.object({
  name: text(120).optional(),
  category: z.enum(ids(GROUPS)),
  subcategory: z.string().nullable().optional(),
  brand: text(80).optional(),
  size_label: text(40).optional(),
  size_fit: text(80).optional(),
  primary_color: z.enum(GARMENT_COLORS as [string, ...string[]]).nullable().optional(),
  secondary_colors: z.array(z.enum(GARMENT_COLORS as [string, ...string[]])).max(4).optional(),
  cut: z.string().nullable().optional(),
  silhouette: z.enum(SILHOUETTES as [string, ...string[]]).nullable().optional(),
  pattern: z.enum(PATTERNS as [string, ...string[]]).nullable().optional(),
  apparent_material: text(80).optional(),
  confirmed_composition: text(160).optional(),
  composition_source: z.enum(ids(COMPOSITION_SOURCES)).nullable().optional(),
  attributes: z.record(z.string(), z.string()).optional(),
  formality_level: z.number().int().min(1).max(5).nullable().optional(),
  seasons: z.array(z.enum(ids(SEASONS))).optional(),
  occasions: z.array(z.enum(ids(OCCASIONS))).optional(),
  style_tags: z.array(z.enum(ids(STYLE_CATALOG))).max(4).optional(),
  condition: z.enum(ids(CONDITIONS)).optional(),
  wardrobe_status: z.enum(ids(STATUSES)).optional(),
  location: text(80).optional(),
  purchase_price: z.number().min(0).max(100000).nullable().optional(),
  purchase_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  store: text(80).optional(),
  estimated_uses: z.number().int().min(0).max(10000).nullable().optional(),
  notes: text(1000).optional(),
  is_favorite: z.boolean().optional(),
})
export type GarmentInputT = z.infer<typeof GarmentInput>
export const GarmentPatch = GarmentInput.partial()

/** Coherencia con la taxonomia: subcategoria del grupo, corte y atributos de su familia, composicion con origen. */
export function normalizeGarment<T extends Partial<GarmentInputT>>(g: T, current?: Record<string, any>) {
  const warnings: string[] = []
  const out: Record<string, any> = { ...g }
  const category = g.category ?? current?.category
  const subcategory = g.subcategory !== undefined ? g.subcategory : current?.subcategory
  if (subcategory && subOf(subcategory)?.family === undefined) { warnings.push('Subcategoría desconocida: la he quitado.'); out.subcategory = null }
  else if (subcategory && GROUPS.find((x) => x.id === category)?.subs.every((x) => x.id !== subcategory)) {
    warnings.push('La subcategoría no pertenece a esa categoría: la he quitado.'); out.subcategory = null
  }
  const family = familyOf(out.subcategory !== undefined ? out.subcategory : subcategory, category)
  if (g.cut !== undefined && g.cut !== null && !CUTS[family].includes(g.cut)) { warnings.push(`El corte «${g.cut}» no aplica a esta prenda: lo he quitado.`); out.cut = null }
  if (g.attributes) {
    const defs = ATTRIBUTES[family]
    out.attributes = Object.fromEntries(Object.entries(g.attributes).filter(([k, v]) => {
      const d = defs.find((x) => x.key === k)
      if (!v) return false
      if (!d || !d.options.includes(v)) { warnings.push(`Atributo «${k}» con valor «${v}» no válido para esta prenda: lo he quitado.`); return false }
      return true
    }))
  }
  if (g.confirmed_composition && !g.composition_source && !current?.composition_source) out.composition_source = 'usuario'
  if (g.confirmed_composition === null) out.composition_source = null
  if (g.wardrobe_status === 'archived' && current?.wardrobe_status !== 'archived') out.archived_at = new Date().toISOString()
  if (g.wardrobe_status && g.wardrobe_status !== 'archived') out.archived_at = null
  return { data: out, warnings }
}

/** Ficha completa para entrar en el armario: tipo, color y al menos una foto o un nombre que la identifique. */
export function completeness(g: Record<string, any>, imageCount: number) {
  const missing: string[] = []
  if (!g.subcategory) missing.push('Tipo de prenda')
  if (!g.primary_color && !['accessories'].includes(g.category)) missing.push('Color principal')
  if (!imageCount && !g.name) missing.push('Una foto o un nombre')
  return { complete: missing.length === 0, missing }
}

export const ImageInput = z.object({
  storage_path: z.string().min(5),
  thumb_path: z.string().min(5).nullable().optional(),
  role: z.enum(ids(IMAGE_ROLES)).default('front'),
  width: z.number().int().positive().max(20000).optional(),
  height: z.number().int().positive().max(20000).optional(),
  bytes: z.number().int().positive().optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
})

const n = (v: FormDataEntryValue | null) => (v === null || v === '' ? null : Number(v))
const sOrNull = (v: FormDataEntryValue | null) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** Formulario HTML de la ficha → entrada validable. Los atributos tecnicos llegan como attr_<clave>. */
export function formToGarment(f: FormData) {
  const attributes: Record<string, string> = {}
  for (const [k, v] of f.entries()) if (k.startsWith('attr_') && typeof v === 'string' && v) attributes[k.slice(5)] = v
  return {
    name: sOrNull(f.get('name')), category: String(f.get('category') ?? ''), subcategory: sOrNull(f.get('subcategory')),
    brand: sOrNull(f.get('brand')), size_label: sOrNull(f.get('size_label')), size_fit: sOrNull(f.get('size_fit')),
    primary_color: sOrNull(f.get('primary_color')), secondary_colors: f.getAll('secondary_colors').map(String),
    cut: sOrNull(f.get('cut')), silhouette: sOrNull(f.get('silhouette')), pattern: sOrNull(f.get('pattern')),
    apparent_material: sOrNull(f.get('apparent_material')), confirmed_composition: sOrNull(f.get('confirmed_composition')),
    composition_source: sOrNull(f.get('composition_source')), attributes,
    formality_level: n(f.get('formality_level')), seasons: f.getAll('seasons').map(String), occasions: f.getAll('occasions').map(String),
    style_tags: f.getAll('style_tags').map(String), condition: sOrNull(f.get('condition')) ?? 'desconocido',
    location: sOrNull(f.get('location')), purchase_price: n(f.get('purchase_price')), purchase_date: sOrNull(f.get('purchase_date')),
    store: sOrNull(f.get('store')), estimated_uses: n(f.get('estimated_uses')), notes: sOrNull(f.get('notes')),
  }
}

/** Mensaje legible de un error de Zod. */
export const zodMessage = (e: z.ZodError) => e.issues.map((i) => `${i.path.join('.') || 'ficha'}: ${i.message}`).join('; ')
