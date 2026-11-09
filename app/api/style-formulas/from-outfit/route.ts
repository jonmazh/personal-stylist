import { z } from 'zod'
import { handle, readJson } from '@/lib/wardrobe/http'
import { formulaFromOutfit } from '@/lib/outfits/formula-service'
import { WardrobeError } from '@/lib/wardrobe/service'

/** POST /api/style-formulas/from-outfit — {outfit_id, name?}: abstrae un conjunto en fórmula (por tipo de prenda). */
export async function POST(req: Request) {
  return handle(async ({ supabase, id }) => {
    const b = z.object({ outfit_id: z.string().uuid(), name: z.string().max(80).optional() }).safeParse(await readJson(req))
    if (!b.success) throw new WardrobeError('Petición no válida')
    return { id: await formulaFromOutfit(supabase, id, b.data.outfit_id, b.data.name) }
  }, 201)
}
