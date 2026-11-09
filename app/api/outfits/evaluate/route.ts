import { handle, readJson } from '@/lib/wardrobe/http'
import { evaluateTheoretical, evaluateVisual, getEvaluation } from '@/lib/outfits/evaluator-service'

/** POST /api/outfits/evaluate — modo teórico {items: [{garment_id, role}], occasion?, dress_code?, weather?} o visual {mode: visual, photo_path, keep_photo?}. */
export async function POST(req: Request) {
  return handle(async ({ supabase, id }) => {
    const b = await readJson(req)
    return getEvaluation(supabase, b.mode === 'visual' ? await evaluateVisual(supabase, id, b) : await evaluateTheoretical(supabase, id, b))
  }, 201)
}
