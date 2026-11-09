import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/server'
import { WardrobeError } from './service'

/** Envoltorio comun de las rutas REST del armario: autenticacion y errores legibles. */
export async function handle<T>(fn: (u: NonNullable<Awaited<ReturnType<typeof getUser>>>) => Promise<T>, okStatus = 200) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  try {
    return NextResponse.json(await fn(user), { status: okStatus })
  } catch (e) {
    if (e instanceof WardrobeError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}
export const readJson = async (req: Request) => req.json().catch(() => { throw new WardrobeError('JSON no válido') })
