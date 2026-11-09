import { handle, readJson } from '@/lib/wardrobe/http'
import { getBudget, setBudget } from '@/lib/shopping/service'

/** GET /api/shopping/budgets — presupuesto activo (o null). */
export async function GET() { return handle(({ supabase }) => getBudget(supabase)) }
/** PUT /api/shopping/budgets — {period: monthly|quarterly|season, amount, currency?, starts_on?} o {active:false} para quitarlo. */
export async function PUT(req: Request) { return handle(async ({ supabase, id }) => { const b = await readJson(req); return setBudget(supabase, id, b?.active === false ? null : b) }) }
