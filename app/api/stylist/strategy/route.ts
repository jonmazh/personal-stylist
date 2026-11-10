import { handle, readJson } from '@/lib/wardrobe/http'
import { styleStrategy } from '@/lib/stylist/service'

/** GET /api/stylist/strategy — estrategia de estilo y oportunidades (se reutiliza si nada ha cambiado). */
export async function GET() { return handle(async ({ supabase, id }) => styleStrategy(supabase, id)) }
/** POST /api/stylist/strategy — {force:true} la recalcula. */
export async function POST(req: Request) { return handle(async ({ supabase, id }) => styleStrategy(supabase, id, { force: !!(await readJson(req).catch(() => ({})))?.force })) }
