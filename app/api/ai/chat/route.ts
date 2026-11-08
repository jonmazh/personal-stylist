import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getUser } from '@/lib/supabase/server'
import { configError, MODEL_CHAT, providerId } from '@/lib/ai/client'
import { effectiveModel, generateText } from '@/lib/ai/structured'
import { STYLIST_PERSONA } from '@/lib/ai/prompts'
import { buildContext } from '@/lib/ai/context'
import { loadBundle } from '@/lib/profile/data'

const Body = z.object({ messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) })).min(1).max(30) })

export async function POST(req: Request) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const cfg = configError()
  if (cfg) return NextResponse.json({ error: cfg }, { status: 503 })
  const body = Body.safeParse(await req.json().catch(() => null))
  if (!body.success) return NextResponse.json({ error: 'Mensaje no valido' }, { status: 400 })

  const bundle = await loadBundle(user.supabase, user.id) // solo datos del usuario (RLS)
  const ctx = buildContext(bundle)
  try {
    const text = await generateText(MODEL_CHAT(), `${STYLIST_PERSONA}\n\n${ctx.text}`, body.data.messages.slice(-12))
    await user.supabase.from('ai_runs').insert({ user_id: user.id, kind: 'chat', model: `${providerId()}:${effectiveModel('chat', MODEL_CHAT())}`, meta: { validated: ctx.hasValidated } })
    return NextResponse.json({ text: text || 'No he podido generar una respuesta. Prueba a reformular la pregunta.' })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error de IA' }, { status: 502 })
  }
}
