import { handle, readJson } from '@/lib/wardrobe/http'
import { createNeed, listNeeds } from '@/lib/shopping/service'

/** GET /api/shopping/needs?status=open|all|<estado> — necesidades ordenadas por prioridad (con su última evaluación). */
export async function GET(req: Request) { const status = new URL(req.url).searchParams.get('status') ?? 'open'; return handle(({ supabase }) => listNeeds(supabase, { status })) }
/** POST /api/shopping/needs — {title, type: need|improvement|replacement|desire, spec, price_min?, price_max?, target_date?, replaces_garment_id?, user_priority?} */
export async function POST(req: Request) { return handle(async ({ supabase, id }) => ({ id: await createNeed(supabase, id, await readJson(req)) }), 201) }
