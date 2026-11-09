import { handle } from '@/lib/wardrobe/http'
import { getSearch } from '@/lib/shopping/catalog-service'

type P = { params: Promise<{ id: string }> }
/** GET /api/shopping/search/:id — una búsqueda guardada con sus resultados y el estado de cada fuente. */
export async function GET(_req: Request, { params }: P) { const { id } = await params; return handle(({ supabase }) => getSearch(supabase, id)) }
