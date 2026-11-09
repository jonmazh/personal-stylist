import { z } from 'zod'
import { handle, readJson } from '@/lib/wardrobe/http'
import { confirmAnalysis } from '@/lib/wardrobe/ai-service'
import { WardrobeError } from '@/lib/wardrobe/service'

const Body = z.object({
  analysis_id: z.string().uuid(),
  decisions: z.record(z.string(), z.object({ action: z.enum(['accept', 'reject', 'correct']), value: z.unknown().optional() })),
  activate: z.boolean().optional(),
})

/** POST /api/wardrobe/items/:id/confirm — {analysis_id, decisions: {campo: {action, value?}}, activate?} */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return handle(async ({ supabase, id: uid }) => {
    const b = Body.safeParse(await readJson(req))
    if (!b.success) throw new WardrobeError('Decisiones no válidas')
    return confirmAnalysis(supabase, uid, id, b.data.analysis_id, b.data.decisions, { activate: b.data.activate })
  })
}
