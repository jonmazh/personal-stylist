import { handle, readJson } from '@/lib/wardrobe/http'
import { registerWear } from '@/lib/outfits/feedback-service'

/** POST /api/outfits/:id/wear — {worn_on?, occasion?, comfortable?, well_dressed?, note?}: registrar uso real. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return handle(async ({ supabase, id: uid }) => registerWear(supabase, uid, id, await readJson(req)), 201)
}
