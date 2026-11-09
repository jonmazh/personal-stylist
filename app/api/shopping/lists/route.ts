import { handle, readJson } from '@/lib/wardrobe/http'
import { createList, listLists } from '@/lib/shopping/service'

/** GET /api/shopping/lists — listas activas con sus necesidades. */
export async function GET() { return handle(({ supabase }) => listLists(supabase)) }
/** POST /api/shopping/lists — {name, description?, target_date?} */
export async function POST(req: Request) { return handle(async ({ supabase, id }) => ({ id: await createList(supabase, id, await readJson(req)) }), 201) }
