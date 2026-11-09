import { handle } from '@/lib/wardrobe/http'
import { verifyProduct } from '@/lib/shopping/catalog-service'

type P = { params: Promise<{ id: string }> }
/** POST /api/shopping/products/:id/verify — vuelve a comprobar precio, disponibilidad y tallas; o {price, availability, sizes} si lo confirmas tú. */
export async function POST(req: Request, { params }: P) { const { id } = await params; return handle(async ({ supabase, id: uid }) => verifyProduct(supabase, uid, id, await req.json().catch(() => null))) }
