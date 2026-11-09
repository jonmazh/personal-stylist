import { handle } from '@/lib/wardrobe/http'
import { getGeneration } from '@/lib/outfits/generate-service'

/** GET /api/outfits/generations/:id — petición, contexto resuelto, estadísticas y propuestas. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return handle(({ supabase }) => getGeneration(supabase, id))
}
