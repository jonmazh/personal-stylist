import { handle, readJson } from '@/lib/wardrobe/http'
import { setGarmentMeasurements } from '@/lib/shopping/evaluator-service'

type P = { params: Promise<{ garmentId: string }> }
/** PUT /api/shopping/references/:garmentId — medidas (cm) de una prenda tuya que te queda bien: {measurements, fits_well?, note?}. */
export async function PUT(req: Request, { params }: P) { const { garmentId } = await params; return handle(async ({ supabase, id }) => { await setGarmentMeasurements(supabase, id, garmentId, await readJson(req)); return { garment_id: garmentId } }) }
