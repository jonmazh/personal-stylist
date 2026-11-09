import { z } from 'zod'
import { handle, readJson } from '@/lib/wardrobe/http'
import { decideFinding } from '@/lib/wardrobe/audit-service'
import { WardrobeError } from '@/lib/wardrobe/service'

/** POST /api/wardrobe/audit/findings/:id — {action: accept|reject}. Aprobar una decisión propuesta la registra como tuya. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return handle(async ({ supabase, id: uid }) => {
    const b = z.object({ action: z.enum(['accept', 'reject']) }).safeParse(await readJson(req))
    if (!b.success) throw new WardrobeError('Acción no válida')
    return decideFinding(supabase, uid, id, b.data.action)
  })
}
