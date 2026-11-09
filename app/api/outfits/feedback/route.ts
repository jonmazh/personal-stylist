import { handle, readJson } from '@/lib/wardrobe/http'
import { addFeedback } from '@/lib/outfits/feedback-service'

/** POST /api/outfits/feedback — valorar un conjunto (`outfit_id`) o una propuesta del motor/estilista (`result_id`). */
export async function POST(req: Request) {
  return handle(async ({ supabase, id }) => addFeedback(supabase, id, await readJson(req)), 201)
}
