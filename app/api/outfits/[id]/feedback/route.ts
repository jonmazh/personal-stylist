import { handle, readJson } from '@/lib/wardrobe/http'
import { addFeedback, outfitHistory } from '@/lib/outfits/feedback-service'

type P = { params: Promise<{ id: string }> }
/** GET /api/outfits/:id/feedback — valoraciones y usos del conjunto. */
export async function GET(_req: Request, { params }: P) { const { id } = await params; return handle(({ supabase }) => outfitHistory(supabase, id)) }
/** POST /api/outfits/:id/feedback — {rating?: love|like|dislike, flags[], reasons[], garment_id?, note?, worn_on?} */
export async function POST(req: Request, { params }: P) {
  const { id } = await params
  return handle(async ({ supabase, id: uid }) => addFeedback(supabase, uid, { ...(await readJson(req)), outfit_id: id, result_id: undefined }), 201)
}
