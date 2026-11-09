import { handle, readJson } from '@/lib/wardrobe/http'
import { searchProducts } from '@/lib/shopping/catalog-service'

/** POST /api/shopping/search — {need_id} o {text}; {force:true} ignora la caché de 24 h. Busca en feeds autorizados y el buscador configurado. */
export async function POST(req: Request) { return handle(async ({ supabase, id }) => searchProducts(supabase, id, await readJson(req))) }
