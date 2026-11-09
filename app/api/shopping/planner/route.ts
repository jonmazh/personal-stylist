import { handle } from '@/lib/wardrobe/http'
import { plannerView } from '@/lib/shopping/service'

/** GET /api/shopping/planner — necesidades que merecen compra / que pueden esperar, presupuesto, listas y preferencias. */
export async function GET() { return handle(({ supabase }) => plannerView(supabase)) }
