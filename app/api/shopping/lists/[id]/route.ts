import { handle } from '@/lib/wardrobe/http'
import { archiveList } from '@/lib/shopping/service'

type P = { params: Promise<{ id: string }> }
/** DELETE /api/shopping/lists/:id — archiva la lista (las necesidades no se tocan). */
export async function DELETE(_req: Request, { params }: P) { const { id } = await params; return handle(async ({ supabase }) => { await archiveList(supabase, id); return { id, archived: true } }) }
