import type { SupabaseClient } from '@supabase/supabase-js'
import { GarmentInput, GarmentPatch, ImageInput, completeness, normalizeGarment, zodMessage } from './schema'
import { GROUPS, subOf } from './taxonomy'

/**
 * Servicio del armario (fase 2A). Lo usan las APIs REST (app/api/wardrobe) y las acciones de la interfaz.
 * RLS garantiza que cada consulta solo ve las filas del usuario; aqui ademas se comprueban las rutas de Storage.
 */
export type Sb = SupabaseClient
export class WardrobeError extends Error { constructor(message: string, public status = 400) { super(message) } }

const ORIGINALS = 'wardrobe-originals', THUMBS = 'wardrobe-thumbnails'
const TRACKED = ['name', 'category', 'subcategory', 'brand', 'size_label', 'size_fit', 'primary_color', 'secondary_colors', 'cut', 'silhouette', 'pattern',
  'apparent_material', 'confirmed_composition', 'composition_source', 'attributes', 'formality_level', 'seasons', 'occasions', 'style_tags', 'condition',
  'location', 'purchase_price', 'purchase_date', 'store', 'estimated_uses', 'notes'] as const

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
const dbError = (msg: string) => new WardrobeError(/schema cache|does not exist|column/i.test(msg) ? 'Ejecuta la migración 0007 en Supabase.' : msg, 500)

/** Cambios campo a campo y nuevo mapa de origenes (quien confirmo cada dato y cuando). */
export function diffAndSources(current: Record<string, any> | null, next: Record<string, any>, source: 'usuario' | 'ia' | 'etiqueta' = 'usuario') {
  const changes: Record<string, [unknown, unknown]> = {}
  const sources: Record<string, { source: string; at: string }> = { ...(current?.field_sources ?? {}) }
  const at = new Date().toISOString()
  for (const k of TRACKED) {
    if (!(k in next)) continue
    if (current && same(current[k], next[k])) continue
    if (!current && (next[k] === null || next[k] === undefined || (Array.isArray(next[k]) && !next[k].length) || (k === 'attributes' && !Object.keys(next[k] ?? {}).length) || (k === 'condition' && next[k] === 'desconocido'))) continue
    changes[k] = [current?.[k] ?? null, next[k]]
    sources[k] = { source, at }
  }
  return { changes, sources }
}

async function logEvent(sb: Sb, uid: string, garmentId: string, kind: string, changes?: unknown) {
  await sb.from('garment_events').insert({ user_id: uid, garment_id: garmentId, kind, changes: changes ?? null })
}

// ── Lectura ──
export interface ListQuery { q?: string; category?: string; decision?: string; status?: 'active' | 'draft' | 'archived' | 'all'; favorite?: boolean; sort?: 'recent' | 'updated' | 'name' | 'category' | 'price' | 'compat' }

export async function listGarments(sb: Sb, query: ListQuery = {}) {
  let req = sb.from('garments').select('*, garment_images(id, role, thumb_path, storage_path, position)')
  const status = query.status ?? 'active'
  if (status !== 'all') req = req.eq('wardrobe_status', status)
  if (query.category && GROUPS.some((g) => g.id === query.category)) req = req.eq('category', query.category)
  if (query.favorite) req = req.eq('is_favorite', true)
  if (query.decision === 'none') req = req.is('decision', null)
  else if (query.decision && ['keep', 'modify', 'review', 'replace', 'donate_sell'].includes(query.decision)) req = req.eq('decision', query.decision)
  const order = { recent: ['created_at', false], updated: ['updated_at', false], name: ['name', true], category: ['category', true], price: ['purchase_price', false] } as const
  const [col, asc] = order[query.sort as keyof typeof order] ?? order.recent
  req = req.order(col, { ascending: asc, nullsFirst: false }).order('created_at', { ascending: false })
  const { data, error } = await req
  if (error) throw dbError(error.message)
  let rows = data ?? []
  const q = query.q?.trim().toLowerCase()
  if (q) rows = rows.filter((g) => [g.name, g.brand, g.primary_color, g.apparent_material, g.store, g.notes, subOf(g.subcategory)?.label, ...(g.attributes ? Object.values(g.attributes) : [])]
    .filter(Boolean).some((v) => String(v).toLowerCase().includes(q)))
  // Miniatura firmada de la primera foto (frontal si existe): URLs de vida corta, nunca publicas
  const cover = (g: any) => [...(g.garment_images ?? [])].sort((a, z) => (a.role === 'front' ? -1 : 0) - (z.role === 'front' ? -1 : 0) || a.position - z.position)[0]
  const thumbs = rows.map(cover).filter((i) => i?.thumb_path).map((i) => i.thumb_path as string)
  const urls = new Map<string, string>()
  if (thumbs.length) {
    const { data: signed } = await sb.storage.from(THUMBS).createSignedUrls(thumbs, 600)
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl)
  }
  // Propuestas de la IA pendientes de revisar (si la migracion 0008 no esta aplicada, simplemente no hay)
  const { data: pend } = rows.length ? await sb.from('garment_analyses').select('garment_id').eq('status', 'proposed') : { data: [] }
  const pending = new Set((pend ?? []).map((x) => x.garment_id))
  return rows.map((g) => {
    const c = cover(g)
    const imgs = g.garment_images ?? []
    delete g.garment_images
    return { ...g, image_count: imgs.length, pending_review: pending.has(g.id), thumb_url: c?.thumb_path ? urls.get(c.thumb_path) ?? null : null, ...completeness(g, imgs.length) }
  })
}

export async function wardrobeSummary(sb: Sb) {
  const { data, error } = await sb.from('garments').select('id, category, wardrobe_status, is_favorite, subcategory, primary_color, name, garment_images(id)')
  if (error) throw dbError(error.message)
  const rows = data ?? []
  const active = rows.filter((g) => g.wardrobe_status === 'active')
  const { data: an } = await sb.from('garment_analyses').select('garment_id, status')
  const live = new Set(rows.filter((g) => g.wardrobe_status !== 'archived').map((g) => g.id))
  // Por revisar: borradores, fichas activas incompletas y prendas con una propuesta de la IA sin revisar (sin contar dos veces)
  const review = new Set([
    ...rows.filter((g) => g.wardrobe_status === 'draft').map((g) => g.id),
    ...active.filter((g) => !completeness(g, (g.garment_images ?? []).length).complete).map((g) => g.id),
    ...(an ?? []).filter((a) => a.status === 'proposed' && live.has(a.garment_id)).map((a) => a.garment_id),
  ])
  return {
    review: review.size,
    analyzed: new Set((an ?? []).filter((a) => live.has(a.garment_id)).map((a) => a.garment_id)).size,
    active: active.length,
    drafts: rows.filter((g) => g.wardrobe_status === 'draft').length,
    archived: rows.filter((g) => g.wardrobe_status === 'archived').length,
    incomplete: active.filter((g) => !completeness(g, (g.garment_images ?? []).length).complete).length,
    favorites: active.filter((g) => g.is_favorite).length,
    byCategory: Object.fromEntries(GROUPS.map((g) => [g.id, active.filter((x) => x.category === g.id).length])),
  }
}

export async function getGarment(sb: Sb, id: string) {
  const { data: g, error } = await sb.from('garments').select('*').eq('id', id).maybeSingle()
  if (error) throw dbError(error.message)
  if (!g) throw new WardrobeError('Prenda no encontrada', 404)
  const [{ data: images }, { data: events }] = await Promise.all([
    sb.from('garment_images').select('*').eq('garment_id', id).order('position').order('created_at'),
    sb.from('garment_events').select('*').eq('garment_id', id).order('created_at', { ascending: false }).limit(50),
  ])
  const imgs = images ?? []
  const sign = async (bucket: string, paths: string[]) => {
    if (!paths.length) return new Map<string, string>()
    const { data } = await sb.storage.from(bucket).createSignedUrls(paths, 600)
    return new Map((data ?? []).filter((x) => x.path).map((x) => [x.path as string, x.signedUrl]))
  }
  const [orig, th] = await Promise.all([sign(ORIGINALS, imgs.map((i) => i.storage_path)), sign(THUMBS, imgs.map((i) => i.thumb_path).filter(Boolean))])
  return {
    ...g,
    images: imgs.map((i) => ({ ...i, url: orig.get(i.storage_path) ?? null, thumb_url: i.thumb_path ? th.get(i.thumb_path) ?? null : null })),
    events: events ?? [],
    ...completeness(g, imgs.length),
  }
}

// ── Escritura ──
export async function createGarment(sb: Sb, uid: string, raw: unknown, status: 'draft' | 'active' = 'draft') {
  const parsed = GarmentInput.safeParse(raw)
  if (!parsed.success) throw new WardrobeError(zodMessage(parsed.error))
  const { data: norm, warnings } = normalizeGarment(parsed.data)
  if (status === 'active' && !norm.category) throw new WardrobeError('Indica la categoría para guardarla en el armario, o guárdala como borrador y deja que la IA la identifique.')
  const { sources } = diffAndSources(null, norm)
  const row = { ...norm, user_id: uid, wardrobe_status: status, field_sources: sources }
  const { data, error } = await sb.from('garments').insert(row).select('id').single()
  if (error) throw dbError(error.message)
  await logEvent(sb, uid, data.id, 'created', { status })
  return { id: data.id as string, warnings }
}

export interface UpdateOpts { sources?: Record<string, Record<string, unknown>> }

export async function updateGarment(sb: Sb, uid: string, id: string, raw: unknown, opts: UpdateOpts = {}) {
  const parsed = GarmentPatch.safeParse(raw)
  if (!parsed.success) throw new WardrobeError(zodMessage(parsed.error))
  const { data: cur, error: ge } = await sb.from('garments').select('*').eq('id', id).maybeSingle()
  if (ge) throw dbError(ge.message)
  if (!cur) throw new WardrobeError('Prenda no encontrada', 404)
  const { data: norm, warnings } = normalizeGarment(parsed.data, cur)
  // Al cambiar de tipo de prenda, los atributos tecnicos de la familia anterior dejan de aplicar.
  if ((norm.subcategory !== undefined && norm.subcategory !== cur.subcategory) && !parsed.data.attributes) {
    const { data: re } = normalizeGarment({ attributes: cur.attributes ?? {}, subcategory: norm.subcategory, category: norm.category ?? cur.category })
    norm.attributes = re.attributes
  }
  if (norm.wardrobe_status === 'active' && !(norm.category ?? cur.category)) throw new WardrobeError('Indica la categoría antes de guardarla en el armario.')
  const { changes, sources } = diffAndSources(cur, norm)
  // Origen explicito (p. ej. propuesta de la IA aceptada por el usuario) para los campos que cambian
  for (const [k, v] of Object.entries(opts.sources ?? {})) if (k in changes || k === 'composition_source') sources[k] = v as { source: string; at: string }
  const statusChanged = norm.wardrobe_status && norm.wardrobe_status !== cur.wardrobe_status
  const favChanged = norm.is_favorite !== undefined && norm.is_favorite !== cur.is_favorite
  if (!Object.keys(changes).length && !statusChanged && !favChanged) return { id, warnings, changed: false }
  const { error } = await sb.from('garments').update({ ...norm, field_sources: sources }).eq('id', id)
  if (error) throw dbError(error.message)
  if (Object.keys(changes).length) await logEvent(sb, uid, id, 'updated', changes)
  if (statusChanged) await logEvent(sb, uid, id, norm.wardrobe_status === 'archived' ? 'archived' : cur.wardrobe_status === 'archived' ? 'restored' : 'status', { wardrobe_status: [cur.wardrobe_status, norm.wardrobe_status] })
  if (favChanged) await logEvent(sb, uid, id, 'favorite', { is_favorite: [cur.is_favorite, norm.is_favorite] })
  return { id, warnings, changed: true }
}

/** Eliminar de verdad (ficha, fotos y miniaturas). Por defecto la interfaz archiva: borrar es una decision explicita. */
export async function deleteGarment(sb: Sb, id: string) {
  const { data: imgs } = await sb.from('garment_images').select('storage_path, thumb_path').eq('garment_id', id)
  const { data: g } = await sb.from('garments').select('id').eq('id', id).maybeSingle()
  if (!g) throw new WardrobeError('Prenda no encontrada', 404)
  if (imgs?.length) {
    await sb.storage.from(ORIGINALS).remove(imgs.map((i) => i.storage_path))
    const th = imgs.map((i) => i.thumb_path).filter(Boolean) as string[]
    if (th.length) await sb.storage.from(THUMBS).remove(th)
  }
  const { error } = await sb.from('garments').delete().eq('id', id)
  if (error) throw dbError(error.message)
}

/** Asocia una foto ya subida a Storage. La ruta debe estar en la carpeta del usuario y de la prenda. */
export async function addImage(sb: Sb, uid: string, garmentId: string, raw: unknown) {
  const parsed = ImageInput.safeParse(raw)
  if (!parsed.success) throw new WardrobeError(zodMessage(parsed.error))
  const img = parsed.data
  const prefix = `${uid}/${garmentId}/`
  if (!img.storage_path.startsWith(prefix) || (img.thumb_path && !img.thumb_path.startsWith(prefix))) throw new WardrobeError('Ruta de imagen no válida', 403)
  const { data: g } = await sb.from('garments').select('id').eq('id', garmentId).maybeSingle()
  if (!g) throw new WardrobeError('Prenda no encontrada', 404)
  let duplicateOf: string | null = null
  if (img.sha256) {
    const { data: dup } = await sb.from('garment_images').select('garment_id').eq('sha256', img.sha256).limit(1).maybeSingle()
    duplicateOf = dup?.garment_id ?? null
  }
  const { count } = await sb.from('garment_images').select('id', { count: 'exact', head: true }).eq('garment_id', garmentId)
  const { data, error } = await sb.from('garment_images').insert({ ...img, user_id: uid, garment_id: garmentId, position: count ?? 0 }).select('id').single()
  if (error) throw dbError(error.message)
  await logEvent(sb, uid, garmentId, 'image_added', { role: img.role })
  return { id: data.id as string, duplicateOf }
}

export async function removeImage(sb: Sb, uid: string, imageId: string) {
  const { data: img } = await sb.from('garment_images').select('*').eq('id', imageId).maybeSingle()
  if (!img) throw new WardrobeError('Imagen no encontrada', 404)
  await sb.storage.from(ORIGINALS).remove([img.storage_path])
  if (img.thumb_path) await sb.storage.from(THUMBS).remove([img.thumb_path])
  await sb.from('garment_images').delete().eq('id', imageId)
  await logEvent(sb, uid, img.garment_id, 'image_removed', { role: img.role })
  return { garmentId: img.garment_id as string }
}

export async function setImageRole(sb: Sb, imageId: string, role: string) {
  const r = ImageInput.shape.role.safeParse(role)
  if (!r.success) throw new WardrobeError('Función de imagen no válida')
  const { error } = await sb.from('garment_images').update({ role: r.data }).eq('id', imageId)
  if (error) throw dbError(error.message)
}
