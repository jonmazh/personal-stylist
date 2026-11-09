import { handle, readJson } from '@/lib/wardrobe/http'
import { createFormula, formulasView } from '@/lib/outfits/formula-service'

/** GET /api/style-formulas — tus fórmulas (con cuántas variaciones permiten con tu armario) y las detectadas. */
export async function GET() { return handle(({ supabase, id }) => formulasView(supabase, id)) }
/** POST /api/style-formulas — {name, description?, slots: [{role, subcategories[], colors[], cuts[], formality_min?, formality_max?, optional?}]} */
export async function POST(req: Request) { return handle(async ({ supabase, id }) => ({ id: await createFormula(supabase, id, await readJson(req)) }), 201) }
