import { handle, readJson } from '@/lib/wardrobe/http'
import { createManualProduct, importFromUrl } from '@/lib/shopping/catalog-service'

/**
 * POST /api/shopping/import — {url, need_id?}: importación por URL (solo metadatos públicos, si la tienda y robots.txt lo permiten;
 * si no, responde ok:false con el motivo) · {manual: {product_name, product_url?, retailer_id?, price?, subcategory?, color?, composition?, sizes?, need_id?}}: importación asistida.
 */
export async function POST(req: Request) {
  return handle(async ({ supabase, id }) => { const b = await readJson(req); return b?.manual ? { ok: true, id: await createManualProduct(supabase, id, b.manual) } : importFromUrl(supabase, id, b) }, 201)
}
