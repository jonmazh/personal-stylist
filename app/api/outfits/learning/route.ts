import { z } from 'zod'
import { handle, readJson } from '@/lib/wardrobe/http'
import { decidePattern, learningView } from '@/lib/outfits/feedback-service'
import { WardrobeError } from '@/lib/wardrobe/service'

/** GET /api/outfits/learning — patrones detectados en tus valoraciones (con su estado) y métricas. */
export async function GET() { return handle(async ({ supabase }) => { const v = await learningView(supabase); return { patterns: v.patterns, metrics: v.metrics } }) }
/** POST /api/outfits/learning — {key, action: confirm|dismiss|reset}. No modifica el Style Blueprint. */
export async function POST(req: Request) {
  return handle(async ({ supabase, id }) => {
    const b = z.object({ key: z.string().min(3).max(120), action: z.enum(['confirm', 'dismiss', 'reset']) }).safeParse(await readJson(req))
    if (!b.success) throw new WardrobeError('Acción no válida')
    return decidePattern(supabase, id, b.data.key, b.data.action)
  })
}
