import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/server'
import { WardrobeError } from '@/lib/wardrobe/service'
import { channel3OfferUrl } from '@/lib/shopping/catalog-service'

/**
 * GET /api/shopping/channel3/offer?search=<id>&i=<índice> | ?product=<id> — enlace de compra ACTUAL de un producto de
 * Channel3. Se pide la ficha (gratis) en el momento del clic: los enlaces de oferta son temporales y no se guardan.
 */
export async function GET(req: Request) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const u = new URL(req.url)
  const i = u.searchParams.get('i')
  try {
    const url = await channel3OfferUrl(user.supabase, user.id, { search_id: u.searchParams.get('search'), index: i != null ? Number(i) : null, product_id: u.searchParams.get('product') })
    return NextResponse.redirect(url, 302)
  } catch (e) {
    const status = e instanceof WardrobeError ? e.status : 500
    return new NextResponse(`<!doctype html><meta charset="utf-8"><title>Oferta no disponible</title><p style="font-family:system-ui;padding:2rem">${(e as Error).message.replace(/[<>&]/g, '')}</p><p style="font-family:system-ui;padding:0 2rem"><a href="javascript:history.back()">Volver</a></p>`, { status, headers: { 'content-type': 'text/html; charset=utf-8' } })
  }
}
