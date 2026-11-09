import { z } from 'zod'
import { handle, readJson } from '@/lib/wardrobe/http'
import { dismissProposal, saveProposal } from '@/lib/outfits/generate-service'
import { WardrobeError } from '@/lib/wardrobe/service'

/** POST /api/outfits/generations/results/:id — {action: save|dismiss, name?}: guardar la propuesta como conjunto o descartarla. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return handle(async ({ supabase, id: uid }) => {
    const b = z.object({ action: z.enum(['save', 'dismiss']), name: z.string().max(120).optional() }).safeParse(await readJson(req))
    if (!b.success) throw new WardrobeError('Acción no válida')
    if (b.data.action === 'dismiss') { await dismissProposal(supabase, id); return { status: 'dismissed' } }
    return saveProposal(supabase, uid, id, b.data.name)
  })
}
