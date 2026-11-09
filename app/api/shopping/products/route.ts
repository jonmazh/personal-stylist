import { handle } from '@/lib/wardrobe/http'
import { listProducts } from '@/lib/shopping/catalog-service'

/** GET /api/shopping/products?need_id=&status=candidate|saved|discarded|all — productos candidatos (por defecto, sin descartados). */
export async function GET(req: Request) { const sp = new URL(req.url).searchParams; return handle(({ supabase }) => listProducts(supabase, { need_id: sp.get('need_id'), status: sp.get('status') ?? undefined })) }
