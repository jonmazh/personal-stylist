import { handle, readJson } from '@/lib/wardrobe/http'
import { compareProducts } from '@/lib/shopping/evaluator-service'

/** POST /api/shopping/compare — {ids: [2-4 productos]}: evaluaciones lado a lado, ordenadas por puntuación de compra. */
export async function POST(req: Request) { return handle(async ({ supabase, id }) => compareProducts(supabase, id, ((await readJson(req)).ids ?? []) as string[])) }
