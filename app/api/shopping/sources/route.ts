import { handle, readJson } from '@/lib/wardrobe/http'
import { createSource, listSources, searchConfigured } from '@/lib/shopping/catalog-service'

/** GET /api/shopping/sources — tus feeds autorizados y si hay buscador configurado. */
export async function GET() { return handle(async ({ supabase }) => ({ sources: await listSources(supabase), search_provider: searchConfigured() })) }
/** POST /api/shopping/sources — {name, feed_url?, format?, retailer_id?, authorization_note} */
export async function POST(req: Request) { return handle(async ({ supabase, id }) => ({ id: await createSource(supabase, id, await readJson(req)) }), 201) }
