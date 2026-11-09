import { handle, readJson } from '@/lib/wardrobe/http'
import { deleteProduct, getProduct, updateProduct } from '@/lib/shopping/catalog-service'

type P = { params: Promise<{ id: string }> }
/** GET /api/shopping/products/:id — ficha con procedencia de cada dato, variantes, historial de precios y fecha de verificación. */
export async function GET(_req: Request, { params }: P) { const { id } = await params; return handle(({ supabase }) => getProduct(supabase, id)) }
/** PATCH /api/shopping/products/:id — corregir datos (pasan a «tú»), vincular a una necesidad, {status, discard_reason}. */
export async function PATCH(req: Request, { params }: P) { const { id } = await params; return handle(async ({ supabase, id: uid }) => updateProduct(supabase, uid, id, await readJson(req))) }
/** DELETE /api/shopping/products/:id — borra el producto y tus capturas. */
export async function DELETE(_req: Request, { params }: P) { const { id } = await params; return handle(async ({ supabase }) => { await deleteProduct(supabase, id); return { id, deleted: true } }) }
