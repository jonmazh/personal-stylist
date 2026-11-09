import { listGarments, type Sb } from '@/lib/wardrobe/service'
import { garmentSubtitle, garmentTitle } from '@/lib/wardrobe/display'
import type { PickG } from './builder'

/** Prendas activas para el selector del constructor (solo los campos que necesita). */
export async function pickableGarments(sb: Sb): Promise<PickG[]> {
  const gs = await listGarments(sb, { status: 'active', sort: 'category' })
  return gs.map((g) => ({ id: g.id, title: garmentTitle(g), subtitle: garmentSubtitle(g), category: g.category, subcategory: g.subcategory, primary_color: g.primary_color, thumb_url: g.thumb_url, wardrobe_status: g.wardrobe_status, decision: g.decision ?? null }))
}
