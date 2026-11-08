'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { AREAS, PHOTO_KINDS } from '@/lib/profile/areas'
import { buildAreaPayload } from '@/lib/profile/questionnaire'
import { GARMENT_FIELDS } from '@/lib/profile/summary'
import { QualitySchema } from '@/lib/photos/quality'
import { OUTFITS, RATINGS } from '@/lib/style/references'
import { styleById } from '@/lib/style/catalog'
import { buildIdentity } from '@/lib/style/identity'
import { styleProfileOf } from '@/lib/style/dna'
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
const done = () => revalidatePath('/', 'layout')
const back = (area: string, flag: string) => {
  const a = AREAS.find((x) => x.id === area)
  redirect(a ? `/profile/${a.slug}?${flag}=1` : '/profile')
}

export async function saveArea(formData: FormData) {
  const { id, supabase } = await me()
  const area = AREAS.find((a) => a.id === formData.get('area'))
  if (!area) redirect('/profile')
  const { rows, measures, warnings } = buildAreaPayload(area.id, formData)
  const now = new Date().toISOString()
  const errors: string[] = []

  for (const [table, row] of Object.entries(rows) as [string, Record<string, unknown>][]) {
    const payload: Record<string, unknown> = table === 'profiles' ? { id, ...row, updated_at: now } : { user_id: id, ...row, updated_at: now }
    const { error } = await supabase.from(table).upsert(payload)
    if (error) errors.push(error.message)
  }
  if (measures.length) {
    // Historial: solo se inserta lo que ha cambiado respecto a la ultima medida; nunca se sobrescribe.
    const { data } = await supabase.from('body_measurements').select('key,value_cm').order('measured_at', { ascending: false })
    const latest = new Map<string, number>()
    for (const r of data ?? []) if (!latest.has(r.key)) latest.set(r.key, Number(r.value_cm))
    const fresh = measures.filter((m) => latest.get(m.key) !== m.value_cm).map((m) => ({ ...m, user_id: id, source: 'manual' }))
    if (fresh.length) {
      const { error } = await supabase.from('body_measurements').insert(fresh)
      if (error) errors.push(error.message)
    }
  }
  done()
  if (errors.length) {
    const hint = errors.some((e) => /column|schema cache|does not exist/i.test(e)) ? ' ¿Has ejecutado la migración 0002 en Supabase?' : ''
    redirect(`/profile/${area.slug}?error=${encodeURIComponent('No se pudo guardar.' + hint + ' Detalle: ' + errors[0])}`)
  }
  redirect(`/profile/${area.slug}?saved=1${warnings.length ? `&warn=${encodeURIComponent(warnings.join(' '))}` : ''}`)
}

export async function toggleValidated(formData: FormData) {
  const { id, supabase } = await me()
  const area = String(formData.get('area'))
  const next = formData.get('next') === '1'
  await supabase.from('area_states').upsert({ user_id: id, area, validated: next, validated_at: next ? new Date().toISOString() : null })
  done()
  back(area, next ? 'validated' : 'unvalidated')
}

export async function registerPhoto(kind: string, path: string, quality?: unknown) {
  const { id, supabase } = await me()
  if (!(PHOTO_KINDS as readonly string[]).includes(kind) || !path.startsWith(id + '/')) throw new Error('Ruta no valida')
  const { data: prof } = await supabase.from('profiles').select('photo_consent_at').eq('id', id).maybeSingle()
  if (!prof?.photo_consent_at) {
    await supabase.storage.from('profile-private').remove([path])
    throw new Error('Antes de subir fotos tienes que aceptar cómo se tratan')
  }
  const q = QualitySchema.safeParse(quality)
  const { data: old } = await supabase.from('body_photos').select('id,storage_path').eq('kind', kind)
  if (old?.length) {
    await supabase.storage.from('profile-private').remove(old.map((o) => o.storage_path))
    await supabase.from('body_photos').delete().eq('kind', kind)
  }
  await supabase.from('body_photos').insert({ user_id: id, kind, storage_path: path, quality: q.success ? { client: q.data } : null })
  done()
}

/** Consentimiento explicito antes de la primera foto (README 15). */
export async function setPhotoConsent(formData: FormData) {
  const { id, supabase } = await me()
  const give = formData.get('consent') === 'on'
  if (give) await supabase.from('profiles').upsert({ id, photo_consent_at: new Date().toISOString() })
  done()
  redirect('/profile/cuerpo#fotos')
}

/** Prendas que ya le quedan bien, con sus medidas de prenda (no corporales). */
export async function addReferenceGarment(formData: FormData) {
  const { id, supabase } = await me()
  const category = String(formData.get('category') ?? '')
  const name = str(formData.get('name'))
  if (!GARMENT_FIELDS[category] || !name) redirect('/profile/prendas?error=' + encodeURIComponent('Indica el tipo de prenda y un nombre para reconocerla.'))
  const measurements = Object.fromEntries(GARMENT_FIELDS[category].map(([k]) => [k, num(formData.get(`m_${k}`))]).filter(([, v]) => v !== null && (v as number) > 0 && (v as number) < 200))
  const { error } = await supabase.from('reference_garments').insert({ user_id: id, category, name, measurements, notes: str(formData.get('notes')) })
  done()
  if (error) redirect('/profile/prendas?error=' + encodeURIComponent('No se pudo guardar la prenda. ¿Has ejecutado la migración 0002? Detalle: ' + error.message))
  redirect('/profile/prendas?saved=1#referencias')
}

export async function deleteReferenceGarment(formData: FormData) {
  const { supabase } = await me()
  await supabase.from('reference_garments').delete().eq('id', String(formData.get('id')))
  done()
  redirect('/profile/prendas#referencias')
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
  if (error || !bp) redirect('/blueprint?error=' + encodeURIComponent('No se pudo crear el diagnóstico: ' + (error?.message ?? '')))
  // Lo que ya revisaste en la version anterior se conserva si la conclusion no ha cambiado.
  const rows = carryReviews(b.blueprints.at(-1)?.findings ?? [], buildFindings(b)).map((x, i) => ({
    blueprint_id: bp.id, user_id: id, position: i, key: x.key, section: x.section, title: x.title, body: x.body,
    why: x.why, action: x.action, data_used: x.data_used, missing: x.missing, details: x.details ?? null,
    origin: x.origin, confidence: x.confidence, justification: x.justification, status: x.status, corrected_body: x.corrected_body,
  }))
  const { error: fe } = await supabase.from('assessment_findings').insert(rows)
  if (fe) {
    await supabase.from('blueprints').delete().eq('id', bp.id) // no dejar una version vacia
    redirect('/blueprint?error=' + encodeURIComponent(/column|schema cache/i.test(fe.message)
      ? 'No se pudo guardar el diagnóstico: ejecuta la migración 0003 en Supabase.'
      : 'No se pudieron guardar las conclusiones del diagnóstico: ' + fe.message))
  }
  done()
  redirect(`/blueprint?v=${version}`)
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

// ── Style DNA: descubrimiento visual y referencias propias ──
const RATING_IDS = RATINGS.map((r) => r.id) as string[]

/** Valora un conjunto de la galeria (o quita la valoracion con rating vacio). Con «element», guarda que elementos le gustan. */
export async function rateReference(referenceId: string, rating: string | null, likedElements: string[] = []) {
  const { id, supabase } = await me()
  const o = OUTFITS.find((x) => x.id === referenceId)
  if (!o) throw new Error('Referencia no valida')
  if (rating === null) await supabase.from('style_reference_ratings').delete().eq('reference_id', referenceId)
  else {
    if (!RATING_IDS.includes(rating)) throw new Error('Valoracion no valida')
    const liked_elements = rating === 'element' ? likedElements.filter((e) => (o.elements as string[]).includes(e)) : []
    const { error } = await supabase.from('style_reference_ratings').upsert({ user_id: id, reference_id: referenceId, rating, liked_elements, rated_at: new Date().toISOString() })
    if (error) throw new Error(/schema cache|does not exist|check constraint|liked_elements/i.test(error.message) ? 'Ejecuta la migración 0005 en Supabase' : error.message)
  }
  done()
}

// ── Identidad estetica declarada (BIS 1) ──
const identityError = (msg: string) => redirect('/estilos/identidad?error=' + encodeURIComponent(/column|schema cache/i.test(msg) ? 'Ejecuta la migración 0005 en Supabase.' : msg))

async function writeIdentity(id: string, supabase: Awaited<ReturnType<typeof me>>['supabase'], data: { influences: unknown[]; liked?: string[]; rejected?: string[]; brands?: string[] }) {
  const { data: cur } = await supabase.from('style_preferences').select('identity_version').eq('user_id', id).maybeSingle()
  const influences = data.influences as { style: string; weight: number }[]
  const row: Record<string, unknown> = {
    user_id: id, influences,
    styles: [...influences].sort((a, z) => z.weight - a.weight).map((i) => styleById(i.style)!.name), // compatibilidad
    identity_version: (cur?.identity_version ?? 0) + 1, identity_updated_at: new Date().toISOString(),
  }
  if (data.liked) row.liked_elements = data.liked
  if (data.rejected) row.rejected_elements = data.rejected
  if (data.brands) row.brand_refs = data.brands
  return supabase.from('style_preferences').upsert(row)
}

/** Guarda la identidad hibrida: influencias (rol y %), elementos preferidos/rechazados y marcas. Cada guardado es una version. */
export async function saveIdentity(formData: FormData) {
  const { id, supabase } = await me()
  const v = buildIdentity(formData)
  const { error } = await writeIdentity(id, supabase, v)
  done()
  if (error) identityError('No se pudo guardar tu identidad: ' + error.message)
  redirect('/estilos/identidad?saved=1' + (v.warnings.length ? '&warn=' + encodeURIComponent(v.warnings.join(' ')) : ''))
}

/** Añade un estilo del catalogo a la identidad declarada (desde su ficha). */
export async function addInfluence(formData: FormData) {
  const { id, supabase } = await me()
  const styleId = String(formData.get('style'))
  const role = String(formData.get('role') ?? 'influencia')
  if (!styleById(styleId)) redirect('/estilos')
  const b = await loadBundle(supabase, id)
  const p = styleProfileOf(b)
  // Si aun no hay identidad declarada, se parte de la propuesta inferida para no perderla.
  const base = p.declared.influences.length ? p.declared.influences : p.identity.influences
  if (p.declared.influences.some((i) => i.style === styleId)) redirect(`/estilos/${styleId}?already=1`)
  const left = Math.max(0, 100 - base.filter((i) => i.style !== styleId).reduce((a, i) => a + i.weight, 0))
  const influences = [...base.filter((i) => i.style !== styleId).map((i) => (role === 'principal' && i.role === 'principal' ? { ...i, role: 'secundario' } : i)),
    { style: styleId, role: ['principal', 'secundario', 'influencia'].includes(role) ? role : 'influencia', weight: left || 10 }]
  const { error } = await writeIdentity(id, supabase, { influences })
  done()
  if (error) identityError('No se pudo añadir: ' + error.message)
  redirect(`/estilos/${styleId}?added=1`)
}

/** Adopta la identidad propuesta a partir de las valoraciones como punto de partida editable. */
export async function adoptProposal() {
  const { id, supabase } = await me()
  const p = styleProfileOf(await loadBundle(supabase, id))
  if (!p.inferred.proposal.length) redirect('/estilos/identidad?error=' + encodeURIComponent('Aún no hay suficientes valoraciones para proponerte una identidad.'))
  const influences = p.identity.source === 'propuesta' ? p.identity.influences
    : p.inferred.proposal.map((x, i) => ({ style: x.style, role: i === 0 ? 'principal' : x.weight >= 20 ? 'secundario' : 'influencia', weight: x.weight }))
  const { error } = await writeIdentity(id, supabase, { influences })
  done()
  if (error) identityError('No se pudo guardar: ' + error.message)
  redirect('/estilos/identidad?adopted=1')
}

/** Registra una referencia visual propia ya subida al bucket privado references-private. */
export async function registerStyleReference(path: string, sourceUrl: string, note: string) {
  const { id, supabase } = await me()
  if (!path.startsWith(id + '/')) throw new Error('Ruta no valida')
  const url = sourceUrl.trim()
  const { error } = await supabase.from('style_references').insert({
    user_id: id, storage_path: path, source_url: /^https?:\/\//.test(url) ? url.slice(0, 500) : null, note: note.trim().slice(0, 300) || null,
  })
  if (error) {
    await supabase.storage.from('references-private').remove([path])
    throw new Error(/schema cache|does not exist/i.test(error.message) ? 'Ejecuta la migración 0004 en Supabase' : error.message)
  }
  done()
}

export async function rateStyleReference(formData: FormData) {
  const { supabase } = await me()
  const rating = String(formData.get('rating') ?? '')
  await supabase.from('style_references').update({ rating: RATING_IDS.includes(rating) ? rating : null }).eq('id', String(formData.get('id')))
  done()
  redirect('/profile/estilo#referencias')
}

export async function deleteStyleReference(formData: FormData) {
  const { supabase } = await me()
  const rid = String(formData.get('id'))
  const { data } = await supabase.from('style_references').select('storage_path').eq('id', rid).maybeSingle()
  if (data) await supabase.storage.from('references-private').remove([data.storage_path])
  await supabase.from('style_references').delete().eq('id', rid)
  done()
  redirect('/profile/estilo#referencias')
}

// ── Conservacion de fotos corporales (README 15) ──
export async function setPhotoRetention(formData: FormData) {
  const { id, supabase } = await me()
  const del = formData.get('delete_after') === 'on'
  const { error } = await supabase.from('profiles').upsert({ id, delete_photos_after_analysis: del })
  done()
  if (error) redirect('/profile/cuerpo?error=' + encodeURIComponent('No se pudo guardar la preferencia. ¿Has ejecutado la migración 0004? Detalle: ' + error.message) + '#fotos')
  redirect('/profile/cuerpo?retention=' + (del ? 'delete' : 'keep') + '#fotos')
}

/** Borra todas las fotos corporales (ficheros y filas). Los resultados del analisis se conservan. */
export async function deleteAllPhotos() {
  const { supabase } = await me()
  const { data } = await supabase.from('body_photos').select('id,storage_path')
  if (data?.length) {
    await supabase.storage.from('profile-private').remove(data.map((p) => p.storage_path))
    await supabase.from('body_photos').delete().in('id', data.map((p) => p.id))
  }
  done()
  redirect('/profile/cuerpo?deleted=1#fotos')
}
