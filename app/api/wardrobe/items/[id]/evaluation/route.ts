import { handle } from '@/lib/wardrobe/http'
import { decisionsOf, evaluationFor } from '@/lib/wardrobe/eval-service'
import { WardrobeError } from '@/lib/wardrobe/service'

/** GET /api/wardrobe/items/:id/evaluation — compatibilidad, ajuste real, valor estratégico, decisión propuesta y veredicto. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return handle(async ({ supabase, id: uid }) => {
    const { data: g } = await supabase.from('garments').select('*, garment_images(id)').eq('id', id).maybeSingle()
    if (!g) throw new WardrobeError('Prenda no encontrada', 404)
    const ev = await evaluationFor(supabase, uid, g, g.garment_images?.length ?? 0)
    const { combos, duplicates, ...value } = ev.value
    return {
      compatibility: ev.compat, fit: ev.fit, strategic_value: { ...value, combines_with: combos.map((x) => x.id), duplicates: duplicates.map((x) => x.id) },
      proposal: ev.proposal, verdict: ev.verdict, decision: g.decision ?? null, decisions: await decisionsOf(supabase, id),
      fit_reviews: ev.reviews.map(({ ai_result: _a, ...r }) => r),
    }
  })
}
