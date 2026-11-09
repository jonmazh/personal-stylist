import { handle } from '@/lib/wardrobe/http'
import { analyzeProduct } from '@/lib/shopping/evaluator-service'

type P = { params: Promise<{ id: string }> }
/** POST /api/shopping/products/:id/analyze — Product Analyzer (IA): descripción + tus capturas y fotos de feeds autorizados. {force} repite aunque esté en caché. */
export async function POST(req: Request, { params }: P) { const { id } = await params; return handle(async ({ supabase, id: uid }) => analyzeProduct(supabase, uid, id, { force: !!(await req.json().catch(() => ({}))).force })) }
