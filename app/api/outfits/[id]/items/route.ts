import { z } from 'zod'
import { handle, readJson } from '@/lib/wardrobe/http'
import { addItem, getOutfit } from '@/lib/outfits/service'
import { WardrobeError } from '@/lib/wardrobe/service'

/** POST /api/outfits/:id/items — {garment_id, role?}: añade una prenda propia y activa (función por defecto según su tipo). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return handle(async ({ supabase, id: uid }) => {
    const b = z.object({ garment_id: z.string().uuid(), role: z.string().optional() }).safeParse(await readJson(req))
    if (!b.success) throw new WardrobeError('Prenda no válida')
    const r = await addItem(supabase, uid, id, b.data.garment_id, b.data.role)
    return { ...r, outfit: await getOutfit(supabase, id) }
  }, 201)
}
