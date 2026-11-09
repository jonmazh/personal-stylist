import { handle, readJson } from '@/lib/wardrobe/http'
import { addToList, removeFromList } from '@/lib/shopping/service'

type P = { params: Promise<{ id: string }> }
/** POST /api/shopping/lists/:id/items — {need_id, note?} */
export async function POST(req: Request, { params }: P) { const { id } = await params; return handle(async ({ supabase, id: uid }) => { const b = await readJson(req); await addToList(supabase, uid, id, String(b.need_id ?? ''), b.note ?? null); return { list_id: id, need_id: b.need_id } }, 201) }
/** DELETE /api/shopping/lists/:id/items?need_id= */
export async function DELETE(req: Request, { params }: P) { const { id } = await params; const need = new URL(req.url).searchParams.get('need_id') ?? ''; return handle(async ({ supabase }) => { await removeFromList(supabase, id, need); return { list_id: id, need_id: need, removed: true } }) }
