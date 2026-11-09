import { handle } from '@/lib/wardrobe/http'
import { getSession } from '@/lib/outfits/stylist/service'

/** GET /api/stylist/sessions/:id — conversación con sus mensajes y las propuestas (todas las versiones). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return handle(async ({ supabase }) => {
    const s = await getSession(supabase, id)
    return { ...s, results: Object.fromEntries(s.results), currentIds: [...s.currentIds], numberOf: Object.fromEntries(s.numberOf) }
  })
}
