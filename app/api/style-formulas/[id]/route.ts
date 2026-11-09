import { handle, readJson } from '@/lib/wardrobe/http'
import { deleteFormula, setFormulaStatus } from '@/lib/outfits/formula-service'

type P = { params: Promise<{ id: string }> }
/** PATCH /api/style-formulas/:id — {status: pending|tested|validated|retired} */
export async function PATCH(req: Request, { params }: P) { const { id } = await params; return handle(async ({ supabase }) => { const b = await readJson(req); await setFormulaStatus(supabase, id, b.status); return { id, status: b.status } }) }
/** DELETE /api/style-formulas/:id */
export async function DELETE(_req: Request, { params }: P) { const { id } = await params; return handle(async ({ supabase }) => { await deleteFormula(supabase, id); return { id, deleted: true } }) }
