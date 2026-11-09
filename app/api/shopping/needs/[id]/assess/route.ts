import { handle } from '@/lib/wardrobe/http'
import { reassessNeed } from '@/lib/shopping/service'

type P = { params: Promise<{ id: string }> }
/** POST /api/shopping/needs/:id/assess — reevalúa la prioridad con el armario actual (guarda una evaluación nueva). */
export async function POST(_req: Request, { params }: P) { const { id } = await params; return handle(({ supabase, id: uid }) => reassessNeed(supabase, uid, id)) }
