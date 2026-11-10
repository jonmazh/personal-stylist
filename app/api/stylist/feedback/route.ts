import { handle, readJson } from '@/lib/wardrobe/http'
import { addFeedback, listFeedback } from '@/lib/stylist/service'

/** GET /api/stylist/feedback — tus valoraciones. POST — {target_kind, target_ref, reason, context?, note?}. */
export async function GET() { return handle(async ({ supabase }) => listFeedback(supabase)) }
export async function POST(req: Request) { return handle(async ({ supabase, id }) => ({ id: await addFeedback(supabase, id, await readJson(req)) }), 201) }
