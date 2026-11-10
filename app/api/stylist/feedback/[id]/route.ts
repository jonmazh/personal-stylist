import { handle } from '@/lib/wardrobe/http'
import { deleteFeedback } from '@/lib/stylist/service'

type P = { params: Promise<{ id: string }> }
/** DELETE /api/stylist/feedback/:id — deshace una valoración (y lo aprendido de ella). */
export async function DELETE(_req: Request, { params }: P) { const { id } = await params; return handle(async ({ supabase }) => { await deleteFeedback(supabase, id); return { id } }) }
