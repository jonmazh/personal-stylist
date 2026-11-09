import { handle } from '@/lib/wardrobe/http'
import { evaluateProduct, latestAnalysis, latestEvaluation, referenceGarments } from '@/lib/shopping/evaluator-service'
import { getProduct } from '@/lib/shopping/catalog-service'

type P = { params: Promise<{ id: string }> }
/** GET /api/shopping/products/:id/evaluate — última evaluación de compra, último análisis y prendas de referencia para la talla. */
export async function GET(_req: Request, { params }: P) {
  const { id } = await params
  return handle(async ({ supabase }) => { const p = await getProduct(supabase, id); const [evaluation, analysis, references] = await Promise.all([latestEvaluation(supabase, id), latestAnalysis(supabase, id), referenceGarments(supabase, p)]); return { evaluation, analysis, references } })
}
/** POST /api/shopping/products/:id/evaluate — evalúa la compra con tu perfil, armario y necesidades. {reference_id?} prenda de referencia para la talla. */
export async function POST(req: Request, { params }: P) { const { id } = await params; return handle(async ({ supabase, id: uid }) => evaluateProduct(supabase, uid, id, { reference_id: (await req.json().catch(() => ({}))).reference_id ?? null }), 201) }
