import { handle, readJson } from '@/lib/wardrobe/http'
import { addRetailer, listRetailers } from '@/lib/shopping/catalog-service'

/** GET /api/shopping/retailers — tiendas del catálogo común y las tuyas, con su política de acceso. */
export async function GET() { return handle(({ supabase }) => listRetailers(supabase)) }
/** POST /api/shopping/retailers — {name, domains[], url_policy: metadata|manual_only, policy_note?} */
export async function POST(req: Request) { return handle(async ({ supabase, id }) => ({ id: await addRetailer(supabase, id, await readJson(req)) }), 201) }
