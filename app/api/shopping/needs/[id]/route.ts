import { handle, readJson } from '@/lib/wardrobe/http'
import { getNeed, updateNeed } from '@/lib/shopping/service'

type P = { params: Promise<{ id: string }> }
/** GET /api/shopping/needs/:id — necesidad con evaluaciones, historial, listas y prendas relacionadas. */
export async function GET(_req: Request, { params }: P) { const { id } = await params; return handle(({ supabase }) => getNeed(supabase, id)) }
/** PATCH /api/shopping/needs/:id — editar, {user_priority} o {status, discard_reason} (descartar exige motivo). */
export async function PATCH(req: Request, { params }: P) { const { id } = await params; return handle(async ({ supabase, id: uid }) => updateNeed(supabase, uid, id, await readJson(req))) }
