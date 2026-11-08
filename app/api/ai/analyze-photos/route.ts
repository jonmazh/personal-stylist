import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/server'
import { configError, MODEL_VISION, providerId } from '@/lib/ai/client'
import { generateStructured } from '@/lib/ai/structured'
import { ObservationsSchema } from '@/lib/ai/schemas'
import { PHOTO_ANALYSIS } from '@/lib/ai/prompts'

// Limite prudente: varios proveedores gratuitos (p. ej. Groq) aceptan pocas imagenes por peticion.
const MAX_PHOTOS = 5

export async function POST() {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const cfg = configError()
  if (cfg) return NextResponse.json({ error: cfg }, { status: 503 })
  const { supabase, id } = user

  const { data: photos } = await supabase.from('body_photos').select('kind,storage_path')
  if (!photos?.length) return NextResponse.json({ error: 'Sube al menos una foto' }, { status: 400 })

  // Las fotos se descargan en el servidor (RLS) y se envian como data URL base64:
  // funciona con todos los proveedores (incluido Ollama local) y no expone URLs.
  const used: { kind: string; dataUrl: string }[] = []
  for (const p of photos.slice(0, MAX_PHOTOS)) {
    const { data: blob } = await supabase.storage.from('profile-private').download(p.storage_path)
    if (!blob) continue
    const b64 = Buffer.from(await blob.arrayBuffer()).toString('base64')
    used.push({ kind: p.kind, dataUrl: `data:${blob.type || 'image/jpeg'};base64,${b64}` })
  }
  if (!used.length) return NextResponse.json({ error: 'No se pudieron preparar las fotos' }, { status: 500 })

  try {
    const parsed = await generateStructured({
      model: MODEL_VISION(),
      schema: ObservationsSchema,
      system: PHOTO_ANALYSIS,
      user: [
        { type: 'text', text: `Fotos en este orden: ${used.map((p) => p.kind).join(', ')}. Responde en JSON.` },
        ...used.map((p) => ({ type: 'image_url' as const, image_url: { url: p.dataUrl } })),
      ],
    })

    const { data: run } = await supabase.from('ai_runs').insert({ user_id: id, kind: 'photo_analysis', model: `${providerId()}:${MODEL_VISION()}`, meta: { photos: used.map((p) => p.kind) } }).select('id').single()
    // Se guardan como OBSERVACIONES (propuesta), nunca como dato confirmado.
    await supabase.from('observations').insert(parsed.observations.map((o) => ({ ...o, user_id: id, run_id: run?.id })))
    return NextResponse.json({ count: parsed.observations.length })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error de IA' }, { status: 502 })
  }
}
