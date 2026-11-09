import { handle, readJson } from '@/lib/wardrobe/http'
import { evaluateTheoretical, evaluateVisual, getEvaluation } from '@/lib/outfits/evaluator-service'

/** POST /api/outfits/:id/evaluate — {mode: theoretical} o {mode: visual, photo_path, keep_photo?}: evaluar el conjunto. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return handle(async ({ supabase, id: uid }) => {
    const b = await readJson(req)
    const eid = b.mode === 'visual' ? await evaluateVisual(supabase, uid, { ...b, outfit_id: id }) : await evaluateTheoretical(supabase, uid, { ...b, outfit_id: id })
    return getEvaluation(supabase, eid)
  }, 201)
}
