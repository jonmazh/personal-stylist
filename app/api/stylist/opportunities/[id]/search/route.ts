import { handle, readJson } from '@/lib/wardrobe/http'
import { searchForOpportunity } from '@/lib/shopping/catalog-service'

type P = { params: Promise<{ id: string }> }
/** POST /api/stylist/opportunities/:id/search — productos reales que materializan la oportunidad ({force:true} sin caché). */
export async function POST(req: Request, { params }: P) { const { id } = await params; return handle(async ({ supabase, id: uid }) => searchForOpportunity(supabase, uid, id, { force: !!(await readJson(req).catch(() => ({})))?.force })) }
