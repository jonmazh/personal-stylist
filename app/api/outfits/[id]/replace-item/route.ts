import { z } from 'zod'
import { handle, readJson } from '@/lib/wardrobe/http'
import { getOutfit, replaceItem } from '@/lib/outfits/service'
import { WardrobeError } from '@/lib/wardrobe/service'

/** POST /api/outfits/:id/replace-item — {item_id, garment_id}: cambia la prenda conservando su función y su posición. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return handle(async ({ supabase, id: uid }) => {
    const b = z.object({ item_id: z.string().uuid(), garment_id: z.string().uuid() }).safeParse(await readJson(req))
    if (!b.success) throw new WardrobeError('Sustitución no válida')
    const r = await replaceItem(supabase, uid, id, b.data.item_id, b.data.garment_id)
    return { ...r, outfit: await getOutfit(supabase, id) }
  })
}
