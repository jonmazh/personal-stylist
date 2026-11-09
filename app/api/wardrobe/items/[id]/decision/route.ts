import { z } from 'zod'
import { handle, readJson } from '@/lib/wardrobe/http'
import { decideGarment } from '@/lib/wardrobe/eval-service'
import { WardrobeError } from '@/lib/wardrobe/service'

const Body = z.object({ decision: z.enum(['keep', 'modify', 'review', 'replace', 'donate_sell']), reason: z.string().max(500).optional(), alteration: z.string().max(300).optional() })

/** POST /api/wardrobe/items/:id/decision — {decision: keep|modify|review|replace|donate_sell, reason?, alteration?}. Nunca archiva ni borra. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return handle(async ({ supabase, id: uid }) => {
    const b = Body.safeParse(await readJson(req))
    if (!b.success) throw new WardrobeError('Decisión no válida')
    return decideGarment(supabase, uid, id, b.data)
  }, 201)
}
