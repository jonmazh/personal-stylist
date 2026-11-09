import { handle, readJson } from '@/lib/wardrobe/http'
import { deleteGarment, getGarment, updateGarment } from '@/lib/wardrobe/service'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_: Request, { params }: Ctx) {
  const { id } = await params
  return handle(({ supabase }) => getGarment(supabase, id))
}

/** PATCH: cualquier campo de la ficha. Cada cambio queda en el historial con su origen (usuario) y fecha. */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params
  return handle(async ({ supabase, id: uid }) => updateGarment(supabase, uid, id, await readJson(req)))
}

/** DELETE: archiva por defecto (reversible). ?mode=permanent elimina ficha y fotos. Nada se borra automaticamente. */
export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params
  const permanent = new URL(req.url).searchParams.get('mode') === 'permanent'
  return handle(async ({ supabase, id: uid }) => {
    if (permanent) { await deleteGarment(supabase, id); return { id, deleted: true } }
    return { ...(await updateGarment(supabase, uid, id, { wardrobe_status: 'archived' })), archived: true }
  })
}
