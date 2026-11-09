import { z } from 'zod'
import { handle, readJson } from '@/lib/wardrobe/http'
import { getSession, listSessions, startSession } from '@/lib/outfits/stylist/service'
import { WardrobeError } from '@/lib/wardrobe/service'

/** GET /api/stylist/sessions — conversaciones recientes con el estilista. */
export async function GET() {
  return handle(({ supabase }) => listSessions(supabase, 20))
}

/**
 * POST /api/stylist/sessions — {message, filters?}: interpreta la petición en lenguaje natural (los `filters`
 * estructurados, si se envían, mandan sobre lo interpretado), genera con el motor y la IA elige y explica.
 */
export async function POST(req: Request) {
  return handle(async ({ supabase, id }) => {
    const b = z.object({ message: z.string().max(1200).default(''), filters: z.record(z.string(), z.unknown()).optional() }).safeParse(await readJson(req))
    if (!b.success) throw new WardrobeError('Petición no válida')
    const sid = await startSession(supabase, id, b.data.message, (b.data.filters ?? {}) as never)
    const s = await getSession(supabase, sid)
    return { ...s, results: Object.fromEntries(s.results), currentIds: [...s.currentIds], numberOf: Object.fromEntries(s.numberOf) }
  }, 201)
}
