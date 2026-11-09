import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getUser } from '@/lib/supabase/server'
import { configError, MODEL_CHAT, providerId } from '@/lib/ai/client'
import { effectiveModel, generateStructured, generateText, newUsage } from '@/lib/ai/structured'
import { TASTE_HINT, TastesSchema, TASTE_EXTRACTOR, extractorPrompt, isEmpty, learnedSentence, normalizeTastes, recordTastes, type Learned } from '@/lib/profile/tastes'
import { garmentTitle } from '@/lib/wardrobe/display'
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
    // Perfil de gustos: solo si el mensaje expresa un gusto o un rechazo se extrae (una llamada mas) y se guarda
    const last = body.data.messages.filter((m) => m.role === 'user').at(-1)?.content ?? ''
    let learned: Learned[] = []
    if (TASTE_HINT.test(last)) {
      try {
        const inventory = new Map(bundle.garments.map((g) => [g.id as string, { title: garmentTitle(g) }]))
        const usage = newUsage()
        const d = await generateStructured({ kind: 'chat', model: MODEL_CHAT(), schema: TastesSchema, system: TASTE_EXTRACTOR, usage, user: extractorPrompt(last, [...inventory].map(([id, g]) => ({ id, title: g.title }))) })
        await user.supabase.from('ai_runs').insert({ user_id: user.id, kind: 'taste_extract', model: `${providerId()}:${effectiveModel('chat', MODEL_CHAT())}`, meta: { usage } })
        const n = normalizeTastes(d, inventory)
        if (!isEmpty(n)) learned = await recordTastes(user.supabase, user.id, n, { inventory, source: 'chat', message: last })
      } catch { /* si falla la extraccion, la respuesta del chat sigue valiendo */ }
    }
    const reply = text || 'No he podido generar una respuesta. Prueba a reformular la pregunta.'
    return NextResponse.json({ text: learned.length ? `${reply}\n\n${learnedSentence(learned)}` : reply, learned })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error de IA' }, { status: 502 })
  }
}
