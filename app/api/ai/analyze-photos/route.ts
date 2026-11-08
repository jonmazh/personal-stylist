import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/server'
import { configError, MODEL_VISION, providerId } from '@/lib/ai/client'
import { effectiveModel, generateStructured } from '@/lib/ai/structured'
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

  const { data: photos } = await supabase.from('body_photos').select('id,kind,storage_path,quality')
  if (!photos?.length) return NextResponse.json({ error: 'Sube al menos una foto' }, { status: 400 })

  // Las fotos se descargan en el servidor (RLS) y se envian como data URL base64:
  // funciona con todos los proveedores (incluido Ollama local) y no expone URLs.
  const used: { id: string; kind: string; dataUrl: string; warnings: string[]; quality: any }[] = []
  for (const p of photos.slice(0, MAX_PHOTOS)) {
    const { data: blob } = await supabase.storage.from('profile-private').download(p.storage_path)
    if (!blob) continue
    const b64 = Buffer.from(await blob.arrayBuffer()).toString('base64')
    const warnings: string[] = (p.quality?.client?.issues ?? []).map((i: { message: string }) => i.message)
    used.push({ id: p.id, kind: p.kind, quality: p.quality, warnings, dataUrl: `data:${blob.type || 'image/jpeg'};base64,${b64}` })
  }
  if (!used.length) return NextResponse.json({ error: 'No se pudieron preparar las fotos' }, { status: 500 })

  try {
    const parsed = await generateStructured({
      kind: 'vision',
      model: MODEL_VISION(),
      schema: ObservationsSchema,
      system: PHOTO_ANALYSIS,
      user: [
        { type: 'text', text: `Fotos en este orden: ${used.map((p) => p.kind).join(', ')}.\n${used.map((p) => `Avisos de calidad de ${p.kind}: ${p.warnings.join(' ') || 'ninguno'}`).join('\n')}\nResponde en JSON.` },
        ...used.map((p) => ({ type: 'image_url' as const, image_url: { url: p.dataUrl } })),
      ],
    })

    // Veredicto de calidad de la IA por foto; sin veredicto se considera utilizable.
    const verdict = new Map(parsed.photo_quality.map((q) => [q.source_photo.toLowerCase(), q]))
    const unusable = new Set(used.filter((p) => verdict.get(p.kind)?.usable === false).map((p) => p.kind))
    for (const p of used) {
      const v = verdict.get(p.kind)
      if (v) await supabase.from('body_photos').update({ quality: { ...(p.quality ?? {}), ai: { usable: v.usable, issues: v.issues } } }).eq('id', p.id)
    }
    const kept = parsed.observations.filter((o) => !unusable.has(o.source_photo.toLowerCase()))

    const { data: run } = await supabase.from('ai_runs').insert({ user_id: id, kind: 'photo_analysis', model: `${providerId()}:${effectiveModel('vision', MODEL_VISION())}`,
      meta: { photos: used.map((p) => p.kind), unusable: [...unusable], discarded: parsed.observations.length - kept.length } }).select('id').single()
    // Se guardan como OBSERVACIONES (propuesta), nunca como dato confirmado.
    if (kept.length) await supabase.from('observations').insert(kept.map((o) => ({ ...o, user_id: id, run_id: run?.id })))
    // Modo «borrar tras el analisis»: se eliminan las imagenes y se conservan solo los resultados estructurados.
    const { data: prof } = await supabase.from('profiles').select('delete_photos_after_analysis').eq('id', id).maybeSingle()
    let deleted = false
    if (prof?.delete_photos_after_analysis) {
      const { error: re } = await supabase.storage.from('profile-private').remove(photos.map((p) => p.storage_path))
      if (!re) { await supabase.from('body_photos').delete().in('id', photos.map((p) => p.id)); deleted = true }
    }
    return NextResponse.json({ count: kept.length, unusable: [...unusable], deleted })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error de IA' }, { status: 502 })
  }
}
