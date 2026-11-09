import { handle, readJson } from '@/lib/wardrobe/http'
import { createGarment, listGarments, type ListQuery } from '@/lib/wardrobe/service'

/** GET /api/wardrobe/items?q=&category=&status=active|draft|archived|all&favorite=1&sort=recent|updated|name|category|price */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams
  return handle(async ({ supabase }) => ({
    items: await listGarments(supabase, {
      q: p.get('q') ?? undefined, category: p.get('category') ?? undefined, status: (p.get('status') as ListQuery['status']) ?? undefined,
      favorite: p.get('favorite') === '1', sort: (p.get('sort') as ListQuery['sort']) ?? undefined,
    }),
  }))
}

/** POST /api/wardrobe/items  body: ficha (categoria obligatoria) + status opcional (draft | active) */
export async function POST(req: Request) {
  return handle(async ({ supabase, id }) => {
    const body = await readJson(req)
    return createGarment(supabase, id, body, body?.status === 'active' ? 'active' : 'draft')
  }, 201)
}
