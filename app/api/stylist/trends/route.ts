import { handle, readJson } from '@/lib/wardrobe/http'
import { trendResearch } from '@/lib/stylist/trend-service'

/** GET /api/stylist/trends — investigación de tendencias (reutiliza la de los últimos 7 días si es la misma temporada e identidad). */
export async function GET() { return handle(async ({ supabase, id }) => trendResearch(supabase, id)) }
/** POST /api/stylist/trends — {force:true} investiga de nuevo. */
export async function POST(req: Request) { return handle(async ({ supabase, id }) => trendResearch(supabase, id, { force: !!(await readJson(req).catch(() => ({})))?.force })) }
