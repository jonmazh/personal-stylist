import { handle } from '@/lib/wardrobe/http'
import { deleteRetailer } from '@/lib/shopping/catalog-service'

type P = { params: Promise<{ id: string }> }
/** DELETE /api/shopping/retailers/:id — solo tiendas añadidas por ti. */
export async function DELETE(_req: Request, { params }: P) { const { id } = await params; return handle(async ({ supabase }) => { await deleteRetailer(supabase, id); return { id, deleted: true } }) }
