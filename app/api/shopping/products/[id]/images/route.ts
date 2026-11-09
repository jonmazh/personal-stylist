import { handle, readJson } from '@/lib/wardrobe/http'
import { addProductImage, removeProductImage } from '@/lib/shopping/catalog-service'

type P = { params: Promise<{ id: string }> }
/** POST /api/shopping/products/:id/images — {storage_path} de una captura ya subida a shopping-private/<tu id>/<producto>/. */
export async function POST(req: Request, { params }: P) { const { id } = await params; return handle(async ({ supabase, id: uid }) => { await addProductImage(supabase, uid, id, String((await readJson(req)).storage_path ?? '')); return { id } }, 201) }
/** DELETE /api/shopping/products/:id/images?path= */
export async function DELETE(req: Request, { params }: P) { const { id } = await params; const path = new URL(req.url).searchParams.get('path') ?? ''; return handle(async ({ supabase, id: uid }) => { await removeProductImage(supabase, uid, id, path); return { id, removed: path } }) }
