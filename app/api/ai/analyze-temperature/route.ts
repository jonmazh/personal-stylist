import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/server'
import { configError, MODEL_VISION, providerId } from '@/lib/ai/client'
import { effectiveModel, generateStructured } from '@/lib/ai/structured'
import { TemperatureSchema } from '@/lib/ai/schemas'
import { TEMPERATURE_ANALYSIS } from '@/lib/ai/prompts'
import { finalizeTemperature, temperatureLabel } from '@/lib/color/temperature'

/**
 * BIS 2 · Estima la temperatura cromatica (subtono) con la foto de rostro.
 * Solo se envia esa imagen. El resultado se guarda en color_analyses como propuesta:
 * el dato del perfil (color_profiles) solo cambia cuando el usuario confirma o corrige.
 */
export async function POST() {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const cfg = configError()
  if (cfg) return NextResponse.json({ error: cfg }, { status: 503 })
  const { supabase, id } = user

  const { data: prof } = await supabase.from('profiles').select('photo_consent_at,delete_photos_after_analysis').eq('id', id).maybeSingle()
  if (!prof?.photo_consent_at) return NextResponse.json({ error: 'Antes tienes que aceptar cómo se tratan tus fotos' }, { status: 403 })
  const { data: photo } = await supabase.from('body_photos').select('id,storage_path,quality').eq('kind', 'rostro').order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!photo) return NextResponse.json({ error: 'Sube primero una foto de tu rostro' }, { status: 400 })

  const { data: blob } = await supabase.storage.from('profile-private').download(photo.storage_path)
  if (!blob) return NextResponse.json({ error: 'No se pudo preparar la foto' }, { status: 500 })
  const dataUrl = `data:${blob.type || 'image/jpeg'};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`
  const client = photo.quality?.client ?? null
  const warnings: string[] = (client?.issues ?? []).map((i: { message: string }) => i.message)

  try {
    const ai = await generateStructured({
      kind: 'vision', model: MODEL_VISION(), schema: TemperatureSchema, system: TEMPERATURE_ANALYSIS,
      user: [{ type: 'text', text: `Foto de rostro para estimar la temperatura cromatica.\nAvisos del control de calidad previo: ${warnings.join(' ') || 'ninguno'}\nResponde en JSON.` },
        { type: 'image_url', image_url: { url: dataUrl } }],
    })
    const r = finalizeTemperature(ai, client)
    const model = `${providerId()}:${effectiveModel('vision', MODEL_VISION())}`
    const { data: row, error } = await supabase.from('color_analyses').insert({
      user_id: id, photo_id: photo.id, photo_path: photo.storage_path, temperature: r.temperature, secondary_tendency: r.secondary, confidence: r.confidence,
      explanation: r.explanation, observations: r.observations, limitations: r.limitations, image_quality: { suitable: r.suitable, issues: ai.image_quality.issues },
      client_quality: client, confidence_capped: r.capped, model,
    }).select('id').single()
    if (error) return NextResponse.json({ error: /schema cache|does not exist/i.test(error.message) ? 'Ejecuta la migración 0006 en Supabase' : error.message }, { status: 500 })
    await supabase.from('ai_runs').insert({ user_id: id, kind: 'temperature_analysis', model, meta: { analysis_id: row.id, suitable: r.suitable, temperature: r.temperature, confidence: r.confidence, capped: r.capped } })

    // Modo «borrar tras el analisis» (README 15): se elimina la foto y se conserva solo el resultado estructurado.
    let deleted = false
    if (prof.delete_photos_after_analysis) {
      const { error: re } = await supabase.storage.from('profile-private').remove([photo.storage_path])
      if (!re) { await supabase.from('body_photos').delete().eq('id', photo.id); deleted = true }
    }
    return NextResponse.json({ id: row.id, suitable: r.suitable, label: temperatureLabel(r.temperature, r.secondary), confidence: r.confidence, deleted })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error de IA' }, { status: 502 })
  }
}
