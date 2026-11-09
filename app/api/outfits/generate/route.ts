import { handle, readJson } from '@/lib/wardrobe/http'
import { getGeneration, runGeneration } from '@/lib/outfits/generate-service'

/**
 * POST /api/outfits/generate — criterios estructurados (no texto libre):
 * {occasion, dress_code, time_of_day, environment, weather, formality, comfort_priority, preferred_style, restrictions[],
 *  exclude_categories[], exclude_garment_ids[], required_garment_ids[], preferred_garment_ids[], number_of_outfits, weights?}
 * Devuelve las propuestas con su desglose de 100 puntos. Sin IA (fase 3B).
 */
export async function POST(req: Request) {
  return handle(async ({ supabase, id }) => getGeneration(supabase, await runGeneration(supabase, id, await readJson(req))), 201)
}
