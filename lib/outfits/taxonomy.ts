import { groupOf, subOf } from '@/lib/wardrobe/taxonomy'

/**
 * Outfit Studio (fase 3A): vocabulario de los conjuntos. Es DATOS: la migracion 0011 usa estas mismas listas
 * en sus CHECK (una prueba lo verifica) y docs/OUTFIT-STUDIO.md se genera desde aqui (npm run docs).
 */

// ── Rol de cada prenda dentro del conjunto (anatomia flexible: capas y complementos opcionales) ──
export const ITEM_ROLES = [
  { id: 'top_base', label: 'Base superior', help: 'Camiseta, camisa, polo, jersey…', max: 1 },
  { id: 'mid_layer', label: 'Capa intermedia', help: 'Jersey o chaleco sobre la base', max: 2 },
  { id: 'third_layer', label: 'Tercera pieza', help: 'Chaqueta, blazer, sobrecamisa…', max: 1 },
  { id: 'outer_layer', label: 'Abrigo', help: 'Abrigo, gabardina, parka…', max: 1 },
  { id: 'bottom', label: 'Parte inferior', help: 'Pantalón, vaquero, chino…', max: 1 },
  { id: 'full_body', label: 'Pieza completa', help: 'Traje o conjunto de dos piezas que ocupa arriba y abajo', max: 1 },
  { id: 'footwear', label: 'Calzado', help: 'Zapatillas, mocasines, botas…', max: 1 },
  { id: 'accessory', label: 'Complemento', help: 'Cinturón, reloj, gafas, bufanda, bolso…', max: 6 },
  { id: 'other', label: 'Otro', help: 'Cualquier otra prenda', max: 4 },
] as const
export type ItemRole = (typeof ITEM_ROLES)[number]['id']
export const roleLabel = (id?: string | null) => ITEM_ROLES.find((r) => r.id === id)?.label ?? id ?? '—'
export const ROLE_ORDER = ITEM_ROLES.map((r) => r.id) as string[]

/** Roles que puede ocupar una prenda segun su categoria y tipo (evita, p. ej., un zapato como parte inferior). */
export function rolesFor(g: { category?: string | null; subcategory?: string | null }): ItemRole[] {
  const s = g.subcategory, c = g.category
  if (s === 'suit' || s === 'tuxedo') return ['full_body', 'third_layer']
  if (s === 'waistcoat' || s === 'gilet') return ['mid_layer', 'third_layer']
  if (['coat', 'trench', 'parka', 'puffer'].includes(s ?? '')) return ['outer_layer', 'third_layer']
  if (['knit', 'cardigan', 'sweatshirt', 'hoodie', 'turtleneck'].includes(s ?? '')) return ['top_base', 'mid_layer', 'third_layer']
  if (s === 'overshirt' || s === 'shirt') return ['top_base', 'third_layer', 'mid_layer']
  switch (c) {
    case 'top': return ['top_base', 'mid_layer']
    case 'outerwear': return ['third_layer', 'outer_layer']
    case 'tailoring': return ['third_layer', 'full_body', 'bottom', 'mid_layer']
    case 'bottom': return ['bottom']
    case 'footwear': return ['footwear']
    case 'accessories': return ['accessory']
    case 'sport': return s === 'sport_bottom' ? ['bottom'] : s === 'sport_jacket' ? ['third_layer', 'top_base'] : ['top_base', 'mid_layer']
    default: return ['other']
  }
}
/** Rol por defecto al añadir una prenda: el primero que admite. */
export const defaultRole = (g: { category?: string | null; subcategory?: string | null }): ItemRole => rolesFor(g)[0]

// ── Ocasiones (las del Occasion Stylist; 3C las usara para el contexto) ──
export const OUTFIT_OCCASIONS = [
  { id: 'dia_a_dia', label: 'Día a día', life: 'ocio', formality: [1, 3] },
  { id: 'oficina', label: 'Jornada de oficina', life: 'trabajo', formality: [2, 4] },
  { id: 'reunion_trabajo', label: 'Reunión de trabajo', life: 'trabajo', formality: [3, 5] },
  { id: 'entrevista', label: 'Entrevista', life: 'trabajo', formality: [3, 5] },
  { id: 'cita', label: 'Cita', life: 'citas', formality: [2, 4] },
  { id: 'primera_cita', label: 'Primera cita', life: 'citas', formality: [2, 4] },
  { id: 'cena_amigos', label: 'Cena con amigos', life: 'ocio', formality: [2, 4] },
  { id: 'comida_familiar', label: 'Comida familiar', life: 'ocio', formality: [2, 4] },
  { id: 'boda', label: 'Boda', life: 'eventos', formality: [4, 5] },
  { id: 'evento_formal', label: 'Evento formal', life: 'eventos', formality: [4, 5] },
  { id: 'fiesta', label: 'Fiesta', life: 'ocio', formality: [2, 4] },
  { id: 'evento_nocturno', label: 'Evento nocturno', life: 'eventos', formality: [3, 5] },
  { id: 'escapada', label: 'Escapada de fin de semana', life: 'ocio', formality: [1, 3] },
  { id: 'viaje', label: 'Viaje', life: 'ocio', formality: [1, 3] },
  { id: 'turismo', label: 'Día de turismo', life: 'ocio', formality: [1, 3] },
  { id: 'deporte', label: 'Deporte', life: 'deporte', formality: [1, 1] },
] as const
export const occasionLabel = (id?: string | null) => OUTFIT_OCCASIONS.find((o) => o.id === id)?.label ?? id ?? '—'

export const OUTFIT_STATUSES = [
  { id: 'draft', label: 'Borrador' }, { id: 'saved', label: 'Guardado' }, { id: 'archived', label: 'Archivado' },
] as const
/** Origen del conjunto: hoy solo manual; el generador (3B), el estilista (3C) y la evaluacion (3D) usaran los demas. */
export const OUTFIT_SOURCES = ['manual', 'generator', 'stylist', 'evaluation'] as const
export const MAX_ITEMS = 12
export const MAX_TAGS = 8

// ── Instantanea de la prenda al incluirla: para entender el conjunto aunque luego cambie o se borre la ficha ──
export const SNAPSHOT_FIELDS = ['name', 'category', 'subcategory', 'primary_color', 'secondary_colors', 'cut', 'silhouette', 'pattern', 'formality_level',
  'seasons', 'occasions', 'style_tags', 'apparent_material', 'confirmed_composition', 'brand', 'wardrobe_status', 'decision'] as const
export function snapshotOf(g: Record<string, any>, title: string) {
  const out: Record<string, unknown> = { title, at: new Date().toISOString() }
  for (const k of SNAPSHOT_FIELDS) if (g[k] !== undefined && g[k] !== null && !(Array.isArray(g[k]) && !g[k].length)) out[k] = g[k]
  return out
}

// ── Reglas estructurales (no son puntuacion: solo coherencia del conjunto) ──
export interface ItemIn { garment_id: string; role: string }
export interface Problem { level: 'error' | 'aviso'; text: string }
/**
 * Errores: impiden guardar (rol imposible para la prenda, mas prendas de las que admite un rol, prenda repetida,
 * pieza completa junto a parte inferior). Avisos: el conjunto se guarda, pero se señala (falta calzado, prenda archivada…).
 */
export function checkComposition(items: ItemIn[], garments: Map<string, Record<string, any>>): Problem[] {
  const out: Problem[] = []
  if (items.length > MAX_ITEMS) out.push({ level: 'error', text: `Un conjunto admite como máximo ${MAX_ITEMS} prendas.` })
  const seen = new Set<string>()
  for (const it of items) {
    if (seen.has(it.garment_id)) out.push({ level: 'error', text: 'Una misma prenda no puede aparecer dos veces.' })
    seen.add(it.garment_id)
    const g = garments.get(it.garment_id)
    if (!g) { out.push({ level: 'error', text: 'Alguna prenda no existe en tu armario.' }); continue }
    const t = g.name || subOf(g.subcategory)?.label || groupOf(g.category)?.label || 'Prenda'
    if (!ROLE_ORDER.includes(it.role)) out.push({ level: 'error', text: `Función no válida para «${t}».` })
    else if (!rolesFor(g).includes(it.role as ItemRole)) out.push({ level: 'error', text: `«${t}» no puede ser ${roleLabel(it.role).toLowerCase()} (puede ser: ${rolesFor(g).map((r) => roleLabel(r).toLowerCase()).join(', ')}).` })
  }
  for (const r of ITEM_ROLES) {
    const n = items.filter((i) => i.role === r.id).length
    if (n > r.max) out.push({ level: 'error', text: `Solo cabe ${r.max === 1 ? 'una prenda' : `${r.max} prendas`} como ${r.label.toLowerCase()} (hay ${n}).` })
  }
  const has = (r: string) => items.some((i) => i.role === r)
  if (has('full_body') && has('bottom')) out.push({ level: 'error', text: 'Una pieza completa (traje) ya ocupa la parte inferior.' })
  if (items.length) {
    if (!has('top_base') && !has('full_body') && !has('third_layer')) out.push({ level: 'aviso', text: 'Falta una prenda para la parte superior.' })
    if (!has('bottom') && !has('full_body')) out.push({ level: 'aviso', text: 'Falta la parte inferior.' })
    if (!has('footwear')) out.push({ level: 'aviso', text: 'Falta el calzado.' })
  }
  for (const it of items) {
    const g = garments.get(it.garment_id)
    if (!g) continue
    const t = g.name || subOf(g.subcategory)?.label || 'Prenda'
    if (g.wardrobe_status === 'archived') out.push({ level: 'aviso', text: `«${t}» está archivada: ya no forma parte de tu armario activo.` })
    if (g.wardrobe_status === 'draft') out.push({ level: 'aviso', text: `«${t}» es un borrador del armario.` })
    if (g.decision === 'replace' || g.decision === 'donate_sell') out.push({ level: 'aviso', text: `«${t}» está marcada para ${g.decision === 'replace' ? 'sustituir' : 'donar o vender'}.` })
  }
  return out
}
