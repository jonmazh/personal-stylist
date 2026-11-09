import { handle } from '@/lib/wardrobe/http'
import { generateAudit, latestAudit } from '@/lib/wardrobe/audit-service'

/** GET /api/wardrobe/audit[?version=N] — última auditoría (o la versión indicada) con sus hallazgos. */
export async function GET(req: Request) {
  const v = Number(new URL(req.url).searchParams.get('version')) || undefined
  return handle(async ({ supabase }) => (await latestAudit(supabase, v)) ?? { audit: null, findings: [], versions: [] })
}

/** POST /api/wardrobe/audit — genera una auditoría nueva (bajo demanda; reglas, sin coste de IA). */
export async function POST() {
  return handle(async ({ supabase, id }) => {
    const a = await generateAudit(supabase, id)
    return latestAudit(supabase, a.version)
  }, 201)
}
