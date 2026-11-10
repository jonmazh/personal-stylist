import { handle, readJson } from '@/lib/wardrobe/http'
import { wardrobeAnalysis } from '@/lib/stylist/service'

/** GET /api/stylist/wardrobe — diagnóstico estratégico del armario (reutiliza el último si nada ha cambiado). */
export async function GET() { return handle(async ({ supabase, id }) => wardrobeAnalysis(supabase, id)) }
/** POST /api/stylist/wardrobe — {force:true} lo recalcula aunque nada haya cambiado. */
export async function POST(req: Request) { return handle(async ({ supabase, id }) => wardrobeAnalysis(supabase, id, { force: !!(await readJson(req).catch(() => ({})))?.force })) }
