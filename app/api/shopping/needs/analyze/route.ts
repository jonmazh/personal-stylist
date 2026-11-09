import { handle } from '@/lib/wardrobe/http'
import { analyzeNeeds } from '@/lib/shopping/service'

/** POST /api/shopping/needs/analyze — detecta necesidades con el armario, la auditoría y el perfil; reevalúa las abiertas. Sin IA ni productos. */
export async function POST() { return handle(({ supabase, id }) => analyzeNeeds(supabase, id)) }
