import { handle } from '@/lib/wardrobe/http'
import { syncSource } from '@/lib/shopping/catalog-service'

type P = { params: Promise<{ id: string }> }
/** POST /api/shopping/sources/:id/sync — descarga el feed desde su URL, o usa el contenido enviado (texto o multipart «file»). */
export async function POST(req: Request, { params }: P) {
  const { id } = await params
  return handle(async ({ supabase, id: uid }) => {
    const ct = req.headers.get('content-type') ?? ''
    let text: string | null = null
    if (ct.includes('multipart/form-data')) { const f = (await req.formData()).get('file'); if (f && typeof f !== 'string') text = await f.text() }
    else if (ct.includes('application/json')) { const b = await req.json().catch(() => ({})); text = typeof b.text === 'string' ? b.text : null }
    else if (ct.startsWith('text/')) text = await req.text()
    return syncSource(supabase, uid, id, text)
  })
}
