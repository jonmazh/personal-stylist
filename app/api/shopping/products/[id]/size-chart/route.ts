import { handle, readJson } from '@/lib/wardrobe/http'
import { setSizeChart } from '@/lib/shopping/evaluator-service'

type P = { params: Promise<{ id: string }> }
/** PUT /api/shopping/products/:id/size-chart — [{size, measurements: {cintura: 41, ...}}] en cm (copiada de la guía de la tienda). */
export async function PUT(req: Request, { params }: P) { const { id } = await params; return handle(async ({ supabase, id: uid }) => { await setSizeChart(supabase, uid, id, await readJson(req)); return { id } }) }
