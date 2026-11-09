import { handle } from '@/lib/wardrobe/http'
import { deleteEvaluationPhoto, getEvaluation } from '@/lib/outfits/evaluator-service'

type P = { params: Promise<{ id: string }> }
/** GET /api/outfits/evaluations/:id — evaluación (foto firmada si se conservó). */
export async function GET(_req: Request, { params }: P) { const { id } = await params; return handle(({ supabase }) => getEvaluation(supabase, id)) }
/** DELETE /api/outfits/evaluations/:id — borra la foto (la evaluación se conserva). */
export async function DELETE(_req: Request, { params }: P) { const { id } = await params; return handle(async ({ supabase }) => { await deleteEvaluationPhoto(supabase, id); return { id, photo_deleted: true } }) }
