import { handle, readJson } from '@/lib/wardrobe/http'
import { deleteOutfit, getOutfit, setOutfitStatus, updateOutfit } from '@/lib/outfits/service'
import { WardrobeError } from '@/lib/wardrobe/service'

type P = { params: Promise<{ id: string }> }
/** GET /api/outfits/:id — conjunto con sus prendas (fotos firmadas), instantáneas y avisos de composición. */
export async function GET(_req: Request, { params }: P) {
  const { id } = await params
  return handle(({ supabase }) => getOutfit(supabase, id))
}

/** PATCH /api/outfits/:id — datos del conjunto, `status` (draft|saved|archived) y/o `items` (lista completa: [{id?, garment_id, role}]). */
export async function PATCH(req: Request, { params }: P) {
  const { id } = await params
  return handle(async ({ supabase, id: uid }) => {
    const { items, status, ...meta } = await readJson(req)
    if (status !== undefined && !['draft', 'saved', 'archived'].includes(status)) throw new WardrobeError('Estado no válido')
    const r = await updateOutfit(supabase, uid, id, Object.keys(meta).length ? meta : undefined, items)
    if (status) await setOutfitStatus(supabase, id, status)
    return { ...r, outfit: await getOutfit(supabase, id) }
  })
}

/** DELETE /api/outfits/:id — archiva; con ?mode=permanent lo elimina (las prendas del armario no se tocan). */
export async function DELETE(req: Request, { params }: P) {
  const { id } = await params
  const permanent = new URL(req.url).searchParams.get('mode') === 'permanent'
  return handle(async ({ supabase }) => {
    if (permanent) await deleteOutfit(supabase, id); else await setOutfitStatus(supabase, id, 'archived')
    return { id, deleted: permanent, archived: !permanent }
  })
}
