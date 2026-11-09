import { handle, readJson } from '@/lib/wardrobe/http'
import { addImage } from '@/lib/wardrobe/service'

/** POST: asocia una foto ya subida a Storage (wardrobe-originals/<usuario>/<prenda>/...) con su funcion y su hash. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return handle(async ({ supabase, id: uid }) => addImage(supabase, uid, id, await readJson(req)), 201)
}
