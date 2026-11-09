import { handle, readJson } from '@/lib/wardrobe/http'
import { saveFormulaCombo, tryFormulaFor } from '@/lib/outfits/formula-service'

/** POST /api/style-formulas/:id/try — {occasion?} → mejores combinaciones de tu armario; con {save: [{garment_id, role}]} guarda una como conjunto. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return handle(async ({ supabase, id: uid }) => {
    const b = await readJson(req)
    return b.save ? saveFormulaCombo(supabase, uid, id, b.save) : tryFormulaFor(supabase, uid, id, b.occasion)
  })
}
