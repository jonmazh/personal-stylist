'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { DIMS, GOALS, LIFE, MEASURES, PREFS, PHOTO_KINDS } from '@/lib/profile/areas'
import { loadBundle } from '@/lib/profile/data'
import { buildFindings } from '@/lib/profile/blueprint'
import { carryReviews } from '@/lib/profile/review'

async function me() {
  const u = await getUser()
  if (!u) redirect('/login')
  return u
}
const num = (v: FormDataEntryValue | null) => (v === null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)
const str = (v: FormDataEntryValue | null) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const done = () => revalidatePath('/profile')

export async function saveArea(formData: FormData) {
  const { id, supabase } = await me()
  const f = formData
  switch (f.get('area')) {
    case 'a1':
      await supabase.from('profiles').upsert({
        id, age: num(f.get('age')), height_cm: num(f.get('height_cm')), weight_kg: num(f.get('weight_kg')), city: str(f.get('city')),
        sizes: str(f.get('sizes')), brands: str(f.get('brands')), budget_max: num(f.get('budget_max')) ?? 80, fit_pref: str(f.get('fit_pref')),
        updated_at: new Date().toISOString(),
      })
      break
    case 'a2': {
      const { data } = await supabase.from('body_measurements').select('key,value_cm').order('measured_at', { ascending: false })
      const latest = new Map<string, number>()
      for (const r of data ?? []) if (!latest.has(r.key)) latest.set(r.key, Number(r.value_cm))
      const rows = MEASURES.map(([k]) => ({ key: k, value_cm: num(f.get(k)) }))
        .filter((r): r is { key: string; value_cm: number } => !!r.value_cm && r.value_cm > 0 && latest.get(r.key) !== r.value_cm)
        .map((r) => ({ ...r, user_id: id, source: 'manual' }))
      if (rows.length) await supabase.from('body_measurements').insert(rows) // historial: nunca se sobrescribe
      break
    }
    case 'a3':
      await supabase.from('color_profiles').upsert({ user_id: id, temperature: str(f.get('temperature')), depth: str(f.get('depth')),
        intensity: str(f.get('intensity')), contrast: str(f.get('contrast')), updated_at: new Date().toISOString() })
      break
    case 'a4':
      await supabase.from('style_preferences').upsert({ user_id: id, styles: f.getAll('styles').map(String),
        dims: Object.fromEntries(DIMS.map(([k]) => [k, num(f.get('d_' + k)) ?? 50])), updated_at: new Date().toISOString() })
      break
    case 'a5':
      await supabase.from('lifestyle_profiles').upsert({ user_id: id, constraints: f.getAll('constraints').map(String),
        life: Object.fromEntries(LIFE.map(([k]) => [k, num(f.get('l_' + k)) ?? 0])), updated_at: new Date().toISOString() })
      break
    case 'a6':
      await supabase.from('fit_preferences').upsert({ user_id: id,
        prefs: Object.fromEntries(Object.keys(PREFS).map((k) => [k, str(f.get('p_' + k))]).filter(([, v]) => v)), updated_at: new Date().toISOString() })
      break
    case 'a7':
      await supabase.from('style_goals').upsert({ user_id: id,
        answers: Object.fromEntries(GOALS.map((_, i) => [`g${i}`, str(f.get(`g${i}`)) ?? ''])), updated_at: new Date().toISOString() })
      break
  }
  done()
}

export async function toggleValidated(formData: FormData) {
  const { id, supabase } = await me()
  const area = String(formData.get('area'))
  const next = formData.get('next') === '1'
  await supabase.from('area_states').upsert({ user_id: id, area, validated: next, validated_at: next ? new Date().toISOString() : null })
  done()
}

export async function registerPhoto(kind: string, path: string) {
  const { id, supabase } = await me()
  if (!(PHOTO_KINDS as readonly string[]).includes(kind) || !path.startsWith(id + '/')) throw new Error('Ruta no valida')
  const { data: old } = await supabase.from('body_photos').select('id,storage_path').eq('kind', kind)
  if (old?.length) {
    await supabase.storage.from('profile-private').remove(old.map((o) => o.storage_path))
    await supabase.from('body_photos').delete().eq('kind', kind)
  }
  await supabase.from('body_photos').insert({ user_id: id, kind, storage_path: path })
  done()
}

export async function deletePhoto(formData: FormData) {
  const { supabase } = await me()
  const pid = String(formData.get('id'))
  const { data } = await supabase.from('body_photos').select('storage_path').eq('id', pid).maybeSingle()
  if (data) await supabase.storage.from('profile-private').remove([data.storage_path])
  await supabase.from('body_photos').delete().eq('id', pid)
  done()
}

export async function generateBlueprint() {
  const { id, supabase } = await me()
  const b = await loadBundle(supabase, id)
  const version = (b.blueprints.at(-1)?.version ?? 0) + 1
  const validated = Object.values(b.validated).filter(Boolean).length
  const { data: bp, error } = await supabase.from('blueprints').insert({ user_id: id, version, validated_areas: validated }).select('id').single()
  if (error || !bp) throw new Error('No se pudo crear el Blueprint')
  // Lo que ya revisaste en la version anterior se conserva si la conclusion no ha cambiado.
  const rows = carryReviews(b.blueprints.at(-1)?.findings ?? [], buildFindings(b)).map((x, i) => ({
    blueprint_id: bp.id, user_id: id, position: i, title: x.title, body: x.body, origin: x.origin, confidence: x.confidence,
    justification: x.justification, status: x.status, corrected_body: x.corrected_body,
  }))
  const { error: fe } = await supabase.from('assessment_findings').insert(rows)
  if (fe) {
    await supabase.from('blueprints').delete().eq('id', bp.id) // no dejar una version vacia
    throw new Error('No se pudieron guardar las conclusiones del Blueprint')
  }
  redirect(`/profile?v=${version}#blueprint`)
}

export async function reviewFinding(formData: FormData) {
  const { supabase } = await me()
  const fid = String(formData.get('id'))
  const text = str(formData.get('corrected'))
  const patch = formData.get('mode') === 'correct' && text ? { status: 'corrected', corrected_body: text } : { status: 'confirmed', corrected_body: null }
  // Solo la ultima version es editable; las anteriores quedan como historico.
  const { data: f } = await supabase.from('assessment_findings').select('blueprint_id').eq('id', fid).maybeSingle()
  const { data: last } = await supabase.from('blueprints').select('id').order('version', { ascending: false }).limit(1).maybeSingle()
  if (f && last && f.blueprint_id === last.id) await supabase.from('assessment_findings').update(patch).eq('id', fid)
  done()
}
