import { handle } from '@/lib/wardrobe/http'
import { analyzeGarment } from '@/lib/wardrobe/ai-service'

/** POST /api/wardrobe/items/:id/analyze[?force=1] — propuesta de la IA (no toca la ficha). Sin force, reutiliza el analisis de las mismas fotos. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const force = new URL(req.url).searchParams.get('force') === '1'
  return handle(async ({ supabase, id: uid }) => {
    const r = await analyzeGarment(supabase, uid, id, { force })
    return { analysis_id: r.analysis.id, cached: r.cached, status: r.analysis.status, overall_confidence: r.analysis.overall_confidence, proposal: r.analysis.normalized }
  }, 201)
}
