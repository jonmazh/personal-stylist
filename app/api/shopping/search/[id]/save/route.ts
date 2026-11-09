import { handle, readJson } from '@/lib/wardrobe/http'
import { saveSearchResult } from '@/lib/shopping/catalog-service'

type P = { params: Promise<{ id: string }> }
/** POST /api/shopping/search/:id/save — {index}: guarda ese resultado como producto candidato. */
export async function POST(req: Request, { params }: P) { const { id } = await params; return handle(async ({ supabase, id: uid }) => saveSearchResult(supabase, uid, id, Number((await readJson(req)).index)), 201) }
