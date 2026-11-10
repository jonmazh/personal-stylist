import { handle } from '@/lib/wardrobe/http'
import { liveSources } from '@/lib/stylist/trend-service'

type P = { params: Promise<{ id: string }> }
/** GET /api/stylist/trends/:id/sources — fuentes de una señal consultadas en vivo en Brave (no se guardan). */
export async function GET(_req: Request, { params }: P) { const { id } = await params; return handle(async ({ supabase, id: uid }) => liveSources(supabase, uid, id)) }
