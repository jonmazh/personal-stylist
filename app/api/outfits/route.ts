import { handle, readJson } from '@/lib/wardrobe/http'
import { createOutfit, listOutfits } from '@/lib/outfits/service'

/** GET /api/outfits?status=active|draft|saved|archived|all&occasion=&formality=&season=&tag=&favorite=1&q= */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams
  return handle(({ supabase }) => listOutfits(supabase, {
    status: p.get('status') ?? undefined, occasion: p.get('occasion') ?? undefined, formality: Number(p.get('formality')) || undefined,
    season: p.get('season') ?? undefined, tag: p.get('tag') ?? undefined, favorite: p.get('favorite') === '1', q: p.get('q') ?? undefined,
  }))
}

/** POST /api/outfits — {name, description?, occasion?, formality_level?, seasons?, tags?, status?, items: [{garment_id, role}]} */
export async function POST(req: Request) {
  return handle(async ({ supabase, id }) => {
    const { items, ...meta } = await readJson(req)
    return createOutfit(supabase, id, meta, items ?? [])
  }, 201)
}
