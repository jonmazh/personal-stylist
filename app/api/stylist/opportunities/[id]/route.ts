import { handle, readJson } from '@/lib/wardrobe/http'
import { setOpportunityStatus } from '@/lib/stylist/service'

type P = { params: Promise<{ id: string }> }
/** PATCH /api/stylist/opportunities/:id — {status: propuesta|me_interesa|descartada}. */
export async function PATCH(req: Request, { params }: P) { const { id } = await params; return handle(async ({ supabase }) => { await setOpportunityStatus(supabase, id, String((await readJson(req))?.status)); return { id } }) }
