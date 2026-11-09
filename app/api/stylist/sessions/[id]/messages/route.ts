import { z } from 'zod'
import { handle, readJson } from '@/lib/wardrobe/http'
import { getSession, sendMessage } from '@/lib/outfits/stylist/service'
import { WardrobeError } from '@/lib/wardrobe/service'

/** POST /api/stylist/sessions/:id/messages — {message}: conversar sobre las propuestas (cambiar prendas, regenerar, guardar). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return handle(async ({ supabase, id: uid }) => {
    const b = z.object({ message: z.string().min(1).max(1000) }).safeParse(await readJson(req))
    if (!b.success) throw new WardrobeError('Mensaje no válido')
    await sendMessage(supabase, uid, id, b.data.message)
    const s = await getSession(supabase, id)
    return { ...s, results: Object.fromEntries(s.results), currentIds: [...s.currentIds], numberOf: Object.fromEntries(s.numberOf), last: s.messages.at(-1) }
  }, 201)
}
