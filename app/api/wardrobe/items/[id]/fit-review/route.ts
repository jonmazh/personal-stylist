import { z } from 'zod'
import { handle, readJson } from '@/lib/wardrobe/http'
import { assessFit, saveFitReview } from '@/lib/wardrobe/eval-service'
import { dimensionsFor } from '@/lib/wardrobe/fit'
import { WardrobeError } from '@/lib/wardrobe/service'

const Body = z.union([
  z.object({ mode: z.literal('ai') }),
  z.object({
    mode: z.literal('manual').default('manual'),
    proposal_id: z.string().uuid().optional(),
    notes: z.string().max(1000).optional(),
    dimensions: z.array(z.object({ key: z.string(), score: z.number().int().min(1).max(10).nullable(), note: z.string().max(300).default(''), fixable: z.boolean().default(false) })).min(1),
  }),
])

/**
 * POST /api/wardrobe/items/:id/fit-review
 * - {mode: "ai"}: propuesta de la IA con las fotos «llevándola puesta» (queda pendiente de confirmar).
 * - {dimensions: [{key, score 1-10|null, note, fixable}], proposal_id?, notes?}: registra (o confirma) la evaluación.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return handle(async ({ supabase, id: uid }) => {
    const b = Body.safeParse(await readJson(req))
    if (!b.success) throw new WardrobeError('Evaluación no válida')
    if (b.data.mode === 'ai') return assessFit(supabase, uid, id)
    const body = b.data
    const { data: g } = await supabase.from('garments').select('*').eq('id', id).maybeSingle()
    if (!g) throw new WardrobeError('Prenda no encontrada', 404)
    const defs = dimensionsFor(g)
    const unknown = body.dimensions.filter((d) => !defs.some((x) => x.key === d.key)).map((d) => d.key)
    if (unknown.length) throw new WardrobeError(`Dimensiones que no aplican a esta prenda: ${unknown.join(', ')}`)
    const dims = defs.map((def) => { const d = body.dimensions.find((x) => x.key === def.key); return { key: def.key, label: def.label, score: d?.score ?? null, note: d?.note ?? '', fixable: !!d?.fixable && d.score !== null, confidence: null } })
    return saveFitReview(supabase, uid, id, { dims, notes: body.notes, proposalId: body.proposal_id })
  }, 201)
}
