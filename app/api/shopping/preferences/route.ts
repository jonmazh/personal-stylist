import { handle, readJson } from '@/lib/wardrobe/http'
import { getPreferences, setPreferences } from '@/lib/shopping/service'

/** GET /api/shopping/preferences */
export async function GET() { return handle(({ supabase }) => getPreferences(supabase)) }
/** PUT /api/shopping/preferences — {preferred_retailers[], excluded_retailers[], priority_weights?, min_priority_to_suggest, quality_over_price, notes?} */
export async function PUT(req: Request) { return handle(async ({ supabase, id }) => setPreferences(supabase, id, await readJson(req))) }
