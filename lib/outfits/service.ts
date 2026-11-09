import { z } from 'zod'
import { garmentTitle } from '@/lib/wardrobe/display'
import { WardrobeError, type Sb } from '@/lib/wardrobe/service'
import { MAX_TAGS, OUTFIT_OCCASIONS, ROLE_ORDER, checkComposition, defaultRole, snapshotOf, type ItemIn, type Problem } from './taxonomy'

/**
 * Outfit Studio (fase 3A): conjuntos manuales con prendas reales del armario.
 * - Solo prendas propias (RLS + comprobacion aqui) y activas al añadirlas; nunca se inventan prendas.
 * - Las fotos no se copian: se firman las miniaturas de garment_images.
 * - Cada prenda guarda una instantanea de sus atributos al incluirla.
 */
const ids = <T extends { id: string }>(xs: readonly T[]) => xs.map((x) => x.id) as [string, ...string[]]
const txt = (max: number) => z.string().trim().max(max).transform((v) => v || null).nullable()
export const OutfitMeta = z.object({
  name: z.string().trim().min(1, 'Ponle un nombre al conjunto').max(120),
  description: txt(1000).optional(),
  occasion: z.enum(ids(OUTFIT_OCCASIONS)).nullable().optional(),
  formality_level: z.number().int().min(1).max(5).nullable().optional(),
  seasons: z.array(z.enum(['primavera', 'verano', 'otono', 'invierno'])).max(4).optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(MAX_TAGS).optional(),
  status: z.enum(['draft', 'saved']).optional(),
  is_favorite: z.boolean().optional(),
})
export const ItemsInput = z.array(z.object({ id: z.string().uuid().optional(), garment_id: z.string().uuid().nullable(), role: z.string() })).max(30)
export type ItemPayload = z.infer<typeof ItemsInput>[number]
const zmsg = (e: z.ZodError) => e.issues.map((i) => i.message).join('; ')
const dbErr = (m: string) => new WardrobeError(/schema cache|does not exist/i.test(m) ? 'Ejecuta la migración 0011 en Supabase.' : m, 500)

/** Prendas propias por id (RLS), con su miniatura firmada (frontal si existe) y la original para la ficha. */
export async function garmentsWithPhotos(sb: Sb, gids: string[], opts: { originals?: boolean } = {}) {
  const map = new Map<string, Record<string, any>>()
  const uniq = [...new Set(gids.filter(Boolean))]
  if (!uniq.length) return map
  const { data, error } = await sb.from('garments').select('*, garment_images(id, role, thumb_path, storage_path, position)').in('id', uniq)
  if (error) throw dbErr(error.message)
  const cover = (g: any) => [...(g.garment_images ?? [])].sort((a, z) => (a.role === 'front' ? -1 : 0) - (z.role === 'front' ? -1 : 0) || a.position - z.position)[0]
  const thumbs = (data ?? []).map(cover).filter((i) => i?.thumb_path).map((i) => i.thumb_path as string)
  const origs = opts.originals ? (data ?? []).map(cover).filter(Boolean).map((i) => i.storage_path as string) : []
  const sign = async (bucket: string, paths: string[]) => {
    if (!paths.length) return new Map<string, string>()
    const { data: s } = await sb.storage.from(bucket).createSignedUrls(paths, 600)
    return new Map((s ?? []).filter((x) => x.path && x.signedUrl).map((x) => [x.path as string, x.signedUrl]))
  }
  const [tu, ou] = await Promise.all([sign('wardrobe-thumbnails', thumbs), sign('wardrobe-originals', origs)])
  for (const g of data ?? []) {
    const c = cover(g)
    delete g.garment_images
    map.set(g.id, { ...g, title: garmentTitle(g), thumb_url: c?.thumb_path ? tu.get(c.thumb_path) ?? null : null, photo_url: c ? ou.get(c.storage_path) ?? null : null })
  }
  return map
}

type Row = Record<string, any>
const sortItems = (xs: Row[]) => [...xs].sort((a, z) => ROLE_ORDER.indexOf(a.item_role) - ROLE_ORDER.indexOf(z.item_role) || a.position - z.position)
export interface OutfitItemView { id: string; garment_id: string; role: string; position: number; snapshot: Row; title: string; thumb_url: string | null; photo_url: string | null; state: 'active' | 'archived' | 'draft' | 'missing'; garment: Row | null }
export type OutfitView = Row & { id: string; name: string; items: OutfitItemView[]; problems: Problem[] }
function present(o: Row, garments: Map<string, Row>): OutfitView {
  const items: OutfitItemView[] = sortItems(o.outfit_items ?? []).map((it) => {
    const g = it.garment_id ? garments.get(it.garment_id) : undefined
    return {
      id: it.id, garment_id: it.garment_id, role: it.item_role, position: it.position, snapshot: it.attribute_snapshot,
      title: g?.title ?? it.attribute_snapshot?.title ?? 'Prenda', thumb_url: g?.thumb_url ?? null, photo_url: g?.photo_url ?? null,
      state: (!it.garment_id || !g ? 'missing' : g.wardrobe_status === 'archived' ? 'archived' : g.wardrobe_status === 'draft' ? 'draft' : 'active') as OutfitItemView['state'],
      garment: g ?? null,
    }
  })
  const { outfit_items: _i, ...rest } = o
  const problems = checkComposition(items.filter((i) => i.garment).map((i) => ({ garment_id: i.garment_id, role: i.role })), garments)
  if (items.some((i) => i.state === 'missing')) problems.push({ level: 'aviso', text: 'Alguna prenda ya no está en tu armario (se muestra con los datos que tenía).' })
  return { ...(rest as Row), id: o.id, name: o.name, items, problems }
}

export interface OutfitQuery { status?: string; occasion?: string; formality?: number; season?: string; tag?: string; favorite?: boolean; q?: string }
export async function listOutfits(sb: Sb, q: OutfitQuery = {}) {
  let req = sb.from('outfits').select('*, outfit_items(id, garment_id, item_role, position, attribute_snapshot)')
  const status = q.status ?? 'active'
  if (status === 'active') req = req.in('status', ['draft', 'saved']); else if (status !== 'all') req = req.eq('status', status)
  if (q.occasion) req = req.eq('occasion', q.occasion)
  if (q.formality) req = req.eq('formality_level', q.formality)
  if (q.season) req = req.filter('seasons', 'cs', JSON.stringify([q.season]))
  if (q.tag) req = req.filter('tags', 'cs', JSON.stringify([q.tag]))
  if (q.favorite) req = req.eq('is_favorite', true)
  const { data, error } = await req.order('updated_at', { ascending: false })
  if (error) throw dbErr(error.message)
  let rows = data ?? []
  const s = q.q?.trim().toLowerCase()
  if (s) rows = rows.filter((o) => [o.name, o.description, ...(o.tags ?? []), ...(o.outfit_items ?? []).map((i: Row) => i.attribute_snapshot?.title)].filter(Boolean).some((v) => String(v).toLowerCase().includes(s)))
  const garments = await garmentsWithPhotos(sb, rows.flatMap((o) => (o.outfit_items ?? []).map((i: Row) => i.garment_id)))
  return rows.map((o) => present(o, garments))
}

export async function getOutfit(sb: Sb, id: string) {
  const { data: o, error } = await sb.from('outfits').select('*, outfit_items(id, garment_id, item_role, position, attribute_snapshot)').eq('id', id).maybeSingle()
  if (error) throw dbErr(error.message)
  if (!o) throw new WardrobeError('Conjunto no encontrado', 404)
  return present(o, await garmentsWithPhotos(sb, (o.outfit_items ?? []).map((i: Row) => i.garment_id), { originals: true }))
}

/** Etiquetas usadas (para el filtro). */
export async function outfitTags(sb: Sb) {
  const { data } = await sb.from('outfits').select('tags')
  return [...new Set((data ?? []).flatMap((o) => o.tags ?? []))].sort() as string[]
}

/** Comprueba las prendas: propias, activas si se añaden ahora, y la composicion sin errores. Devuelve los avisos. */
async function validateItems(sb: Sb, items: ItemPayload[], keep: Set<string> = new Set()) {
  const live = items.filter((i) => i.garment_id) as (ItemPayload & { garment_id: string })[]
  const garments = await garmentsWithPhotos(sb, live.map((i) => i.garment_id))
  for (const it of live) {
    const g = garments.get(it.garment_id)
    if (!g) throw new WardrobeError('Alguna prenda no existe en tu armario.', 400)
    if (g.wardrobe_status !== 'active' && !keep.has(it.garment_id)) throw new WardrobeError(`«${g.title}» no está en tu armario activo: solo se pueden añadir prendas activas.`)
  }
  const problems = checkComposition(live.map((i): ItemIn => ({ garment_id: i.garment_id, role: i.role })), garments)
  const errors = problems.filter((p) => p.level === 'error')
  if (errors.length) throw new WardrobeError(errors.map((e) => e.text).join(' '))
  return { garments, warnings: problems.filter((p) => p.level === 'aviso').map((p) => p.text) }
}

const metaRow = (m: z.infer<typeof OutfitMeta>) => {
  const r: Row = {}
  for (const k of ['name', 'description', 'occasion', 'formality_level', 'seasons', 'tags', 'status', 'is_favorite'] as const) if (m[k] !== undefined) r[k] = m[k]
  if (r.tags) r.tags = [...new Set((r.tags as string[]).map((t) => t.toLowerCase()))]
  if (r.status) r.archived_at = null
  return r
}

export async function createOutfit(sb: Sb, uid: string, rawMeta: unknown, rawItems: unknown) {
  const m = OutfitMeta.safeParse(rawMeta); if (!m.success) throw new WardrobeError(zmsg(m.error))
  const it = ItemsInput.safeParse(rawItems ?? []); if (!it.success) throw new WardrobeError('Prendas no válidas')
  const items = it.data.map((i) => ({ ...i, role: i.role || '' }))
  const { garments, warnings } = await validateItems(sb, items)
  const { data: o, error } = await sb.from('outfits').insert({ ...metaRow(m.data), user_id: uid, status: m.data.status ?? 'draft', source: 'manual' }).select('id').single()
  if (error) throw dbErr(error.message)
  if (items.length) {
    const { error: ie } = await sb.from('outfit_items').insert(items.map((x, i) => ({ user_id: uid, outfit_id: o.id, garment_id: x.garment_id, item_role: x.role, position: i, attribute_snapshot: snapshotOf(garments.get(x.garment_id!)!, garments.get(x.garment_id!)!.title) })))
    if (ie) { await sb.from('outfits').delete().eq('id', o.id); throw dbErr(ie.message) }
  }
  return { id: o.id as string, warnings }
}

/**
 * Edita datos y/o prendas. Las prendas llegan como lista completa: las que traen id se actualizan (rol, orden o
 * sustitucion de la prenda, que renueva su instantanea), las nuevas se insertan y las que faltan se quitan.
 */
export async function updateOutfit(sb: Sb, uid: string, id: string, rawMeta?: unknown, rawItems?: unknown) {
  const { data: cur, error } = await sb.from('outfits').select('*, outfit_items(*)').eq('id', id).maybeSingle()
  if (error) throw dbErr(error.message)
  if (!cur) throw new WardrobeError('Conjunto no encontrado', 404)
  let warnings: string[] = []
  if (rawMeta !== undefined) {
    const m = OutfitMeta.partial().safeParse(rawMeta); if (!m.success) throw new WardrobeError(zmsg(m.error))
    const row = metaRow(m.data as z.infer<typeof OutfitMeta>)
    if (Object.keys(row).length) { const { error: ue } = await sb.from('outfits').update(row).eq('id', id); if (ue) throw dbErr(ue.message) }
  }
  if (rawItems !== undefined) {
    const it = ItemsInput.safeParse(rawItems); if (!it.success) throw new WardrobeError('Prendas no válidas')
    const existing = new Map<string, Row>((cur.outfit_items ?? []).map((x: Row) => [x.id, x]))
    // Las prendas que ya estaban pueden seguir aunque se hayan archivado; las nuevas deben estar activas
    const keep = new Set((cur.outfit_items ?? []).map((x: Row) => x.garment_id).filter(Boolean) as string[])
    const items = it.data.filter((x) => !x.id || existing.has(x.id))
    for (const x of items) if (!x.garment_id && !(x.id && existing.has(x.id))) throw new WardrobeError('Prendas no válidas')
    const r = await validateItems(sb, items, keep)
    warnings = r.warnings
    const toDelete = [...existing.keys()].filter((k) => !items.some((x) => x.id === k))
    if (toDelete.length) await sb.from('outfit_items').delete().in('id', toDelete)
    // Primero se liberan las prendas que cambian de posicion (unique outfit_id+garment_id): permite intercambiarlas
    const changing = items.filter((x) => x.id && x.garment_id && x.garment_id !== existing.get(x.id)!.garment_id).map((x) => x.id!)
    if (changing.length) await sb.from('outfit_items').update({ garment_id: null }).in('id', changing)
    for (const [i, x] of items.entries()) {
      if (x.id) {
        const e = existing.get(x.id)!
        const patch: Row = { item_role: x.role, position: i }
        if (x.garment_id && x.garment_id !== e.garment_id) { patch.garment_id = x.garment_id; const g = r.garments.get(x.garment_id)!; patch.attribute_snapshot = { ...snapshotOf(g, g.title), replaced: e.attribute_snapshot?.title ?? null } }
        const { error: ue } = await sb.from('outfit_items').update(patch).eq('id', x.id)
        if (ue) throw new WardrobeError(/duplicate|unique/i.test(ue.message) ? 'Una misma prenda no puede aparecer dos veces.' : ue.message, 400)
      } else {
        const g = r.garments.get(x.garment_id!)!
        const { error: ie } = await sb.from('outfit_items').insert({ user_id: uid, outfit_id: id, garment_id: x.garment_id, item_role: x.role, position: i, attribute_snapshot: snapshotOf(g, g.title) })
        if (ie) throw new WardrobeError(/duplicate|unique/i.test(ie.message) ? 'Una misma prenda no puede aparecer dos veces.' : ie.message, 400)
      }
    }
    await sb.from('outfits').update({ updated_at: new Date().toISOString() }).eq('id', id)
  }
  return { id, warnings }
}

/** Sustituye la prenda de una posicion conservando su funcion y su orden (contexto del conjunto). */
export async function replaceItem(sb: Sb, uid: string, outfitId: string, itemId: string, garmentId: string) {
  const o = await getOutfit(sb, outfitId)
  if (!o.items.some((i: Row) => i.id === itemId)) throw new WardrobeError('Esa prenda no está en el conjunto', 404)
  const items = o.items.map((i: Row) => ({ id: i.id, garment_id: i.id === itemId ? garmentId : i.garment_id, role: i.role }))
  return updateOutfit(sb, uid, outfitId, undefined, items)
}

/** Añade una prenda con su funcion por defecto (o la indicada). */
export async function addItem(sb: Sb, uid: string, outfitId: string, garmentId: string, role?: string) {
  const o = await getOutfit(sb, outfitId)
  const [g] = [...(await garmentsWithPhotos(sb, [garmentId])).values()]
  if (!g) throw new WardrobeError('Esa prenda no existe en tu armario.', 404)
  const items = [...o.items.map((i: Row) => ({ id: i.id, garment_id: i.garment_id, role: i.role })), { garment_id: garmentId, role: role || defaultRole(g) }]
  return updateOutfit(sb, uid, outfitId, undefined, items)
}

export async function setOutfitStatus(sb: Sb, id: string, status: 'draft' | 'saved' | 'archived') {
  const { data, error } = await sb.from('outfits').update({ status, archived_at: status === 'archived' ? new Date().toISOString() : null }).eq('id', id).select('id').maybeSingle()
  if (error) throw dbErr(error.message)
  if (!data) throw new WardrobeError('Conjunto no encontrado', 404)
}

export async function deleteOutfit(sb: Sb, id: string) {
  const { data, error } = await sb.from('outfits').delete().eq('id', id).select('id').maybeSingle()
  if (error) throw dbErr(error.message)
  if (!data) throw new WardrobeError('Conjunto no encontrado', 404)
}

/** Conjuntos en los que aparece una prenda (para la ficha de la prenda). */
export async function outfitsWithGarment(sb: Sb, garmentId: string) {
  const { data } = await sb.from('outfit_items').select('item_role, outfits(id, name, status)').eq('garment_id', garmentId)
  return (data ?? []).map((x: Row) => ({ role: x.item_role, ...(Array.isArray(x.outfits) ? x.outfits[0] : x.outfits) })).filter((x) => x.id)
}
export type Outfit = Awaited<ReturnType<typeof getOutfit>>
export type { Problem }
