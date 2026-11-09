import { handle } from '@/lib/wardrobe/http'
import { listGenerations } from '@/lib/outfits/generate-service'

/** GET /api/outfits/generations — últimas peticiones al generador. */
export async function GET() {
  return handle(({ supabase }) => listGenerations(supabase, 20))
}
