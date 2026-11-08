import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/server'
import { configError, MODEL_VISION, providerId } from '@/lib/ai/client'
import { effectiveModel, generateStructured } from '@/lib/ai/structured'
import { ReferenceTagsSchema } from '@/lib/ai/schemas'
import { REFERENCE_ANALYSIS } from '@/lib/ai/prompts'
import { STYLES } from '@/lib/profile/areas'
import { COLOR_NAMES } from '@/lib/profile/questionnaire'

const MAX = 5 // varios proveedores gratuitos aceptan pocas imagenes por peticion

/** Analiza las referencias propias aun sin analizar y guarda sus patrones (ai_tags). */
export async function POST() {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const cfg = configError()
  if (cfg) return NextResponse.json({ error: cfg }, { status: 503 })
  const { supabase, id } = user

  const { data: refs, error } = await supabase.from('style_references').select('id,storage_path').is('ai_tags', null).order('created_at').limit(MAX)
  if (error) return NextResponse.json({ error: 'Ejecuta la migración 0004 en Supabase' }, { status: 500 })
  if (!refs?.length) return NextResponse.json({ error: 'No hay referencias nuevas que analizar' }, { status: 400 })

  const imgs: { id: string; url: string }[] = []
  for (const r of refs) {
    const { data: blob } = await supabase.storage.from('references-private').download(r.storage_path)
    if (blob) imgs.push({ id: r.id, url: `data:${blob.type || 'image/jpeg'};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}` })
  }
  if (!imgs.length) return NextResponse.json({ error: 'No se pudieron preparar las imágenes' }, { status: 500 })

  try {
    const parsed = await generateStructured({
      kind: 'vision', model: MODEL_VISION(), schema: ReferenceTagsSchema, system: REFERENCE_ANALYSIS,
      user: [{ type: 'text', text: `Referencias en este orden: ${imgs.length}. Responde en JSON.` }, ...imgs.map((i) => ({ type: 'image_url' as const, image_url: { url: i.url } }))],
    })
    let count = 0
    for (const t of parsed.references) {
      const img = imgs[t.index - 1]
      if (!img) continue
      // Se normaliza a las etiquetas conocidas: nada fuera del catalogo entra en el Style DNA.
      const tags = {
        style: (STYLES as readonly string[]).includes(t.style) ? t.style : null,
        fit: t.fit, structure: t.structure, formality: t.formality,
        colors: t.colors.filter((c) => (COLOR_NAMES as readonly string[]).includes(c)),
        garments: t.garments, patterns: t.patterns,
      }
      await supabase.from('style_references').update({ ai_tags: tags }).eq('id', img.id)
      count++
    }
    await supabase.from('ai_runs').insert({ user_id: id, kind: 'reference_analysis', model: `${providerId()}:${effectiveModel('vision', MODEL_VISION())}`, meta: { images: imgs.length, tagged: count } })
    return NextResponse.json({ count })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error de IA' }, { status: 502 })
  }
}
