import { handle } from '@/lib/wardrobe/http'
import { deleteSource } from '@/lib/shopping/catalog-service'

type P = { params: Promise<{ id: string }> }
/** DELETE /api/shopping/sources/:id — borra el feed y sus productos (los candidatos guardados se conservan). */
export async function DELETE(_req: Request, { params }: P) { const { id } = await params; return handle(async ({ supabase }) => { await deleteSource(supabase, id); return { id, deleted: true } }) }
