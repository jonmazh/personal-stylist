import { NextResponse } from 'next/server'
import { zodTextFormat } from 'openai/helpers/zod'
import { getUser } from '@/lib/supabase/server'
import { MODEL_VISION, openai } from '@/lib/ai/client'
import { ObservationsSchema } from '@/lib/ai/schemas'
import { PHOTO_ANALYSIS } from '@/lib/ai/prompts'

export async function POST() {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { supabase, id } = user

  const { data: photos } = await supabase.from('body_photos').select('kind,storage_path')
  if (!photos?.length) return NextResponse.json({ error: 'Sube al menos una foto' }, { status: 400 })

  // URLs firmadas de vida corta: la imagen solo es accesible para OpenAI unos minutos.
  const { data: signed, error: se } = await supabase.storage.from('profile-private').createSignedUrls(photos.map((p) => p.storage_path), 120)
  if (se || !signed) return NextResponse.json({ error: 'No se pudieron preparar las fotos' }, { status: 500 })
  const urlOf = new Map(signed.map((s) => [s.path, s.signedUrl]))
  const used = photos.filter((p) => urlOf.get(p.storage_path))

  try {
    const res = await openai().responses.parse({
      model: MODEL_VISION(),
      instructions: PHOTO_ANALYSIS,
      input: [{ role: 'user', content: [
        { type: 'input_text', text: `Fotos en este orden: ${used.map((p) => p.kind).join(', ')}.` },
        ...used.map((p) => ({ type: 'input_image' as const, image_url: urlOf.get(p.storage_path)!, detail: 'auto' as const })),
      ] }],
      text: { format: zodTextFormat(ObservationsSchema, 'observations') },
    })
    const parsed = res.output_parsed // ya validado contra el esquema Zod
    if (!parsed) return NextResponse.json({ error: 'La IA no devolvió un resultado válido' }, { status: 502 })

    const { data: run } = await supabase.from('ai_runs').insert({ user_id: id, kind: 'photo_analysis', model: MODEL_VISION(), meta: { photos: used.map((p) => p.kind) } }).select('id').single()
    // Se guardan como OBSERVACIONES (propuesta), nunca como dato confirmado.
    await supabase.from('observations').insert(parsed.observations.map((o) => ({ ...o, user_id: id, run_id: run?.id })))
    return NextResponse.json({ count: parsed.observations.length })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error de IA' }, { status: 502 })
  }
}
