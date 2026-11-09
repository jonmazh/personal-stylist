'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { formToGarment } from '@/lib/wardrobe/schema'
import { WardrobeError, addImage, createGarment, deleteGarment, removeImage, setImageRole, updateGarment } from '@/lib/wardrobe/service'
import { analyzeGarment, confirmAnalysis } from '@/lib/wardrobe/ai-service'
import type { Decision } from '@/lib/wardrobe/analysis'

async function me() {
  const u = await getUser()
  if (!u) redirect('/login')
  return u
}
const msg = (e: unknown) => (e instanceof WardrobeError || e instanceof Error ? e.message : 'Error')
const done = () => revalidatePath('/armario', 'layout')

/** Alta desde la pantalla de incorporacion (se llama desde el cliente: luego sube las fotos con el id). */
export async function createGarmentAction(formData: FormData): Promise<{ id?: string; warnings?: string[]; error?: string }> {
  const { supabase, id } = await me()
  try {
    const r = await createGarment(supabase, id, formToGarment(formData), formData.get('status') === 'active' ? 'active' : 'draft')
    done()
    return r
  } catch (e) { return { error: msg(e) } }
}

export async function registerImageAction(garmentId: string, img: Record<string, unknown>): Promise<{ id?: string; duplicateOf?: string | null; error?: string }> {
  const { supabase, id } = await me()
  try { const r = await addImage(supabase, id, garmentId, img); done(); return r } catch (e) { return { error: msg(e) } }
}

export async function updateGarmentAction(formData: FormData) {
  const { supabase, id } = await me()
  const gid = String(formData.get('id'))
  let warn = ''
  try {
    const patch: Record<string, unknown> = formToGarment(formData)
    if (formData.get('status')) patch.wardrobe_status = String(formData.get('status'))
    const r = await updateGarment(supabase, id, gid, patch)
    warn = r.warnings.join(' ')
  } catch (e) { redirect(`/armario/${gid}?tab=caracteristicas&error=${encodeURIComponent(msg(e))}`) }
  done()
  redirect(`/armario/${gid}?tab=${formData.get('status') === 'active' ? 'resumen' : 'caracteristicas'}&saved=1${warn ? `&warn=${encodeURIComponent(warn)}` : ''}`)
}

export async function setStatusAction(formData: FormData) {
  const { supabase, id } = await me()
  const gid = String(formData.get('id')), status = String(formData.get('status'))
  try { await updateGarment(supabase, id, gid, { wardrobe_status: status }) } catch (e) { redirect(`/armario/${gid}?error=${encodeURIComponent(msg(e))}`) }
  done()
  redirect(`/armario/${gid}?status=${status}`)
}

export async function toggleFavoriteAction(formData: FormData) {
  const { supabase, id } = await me()
  const gid = String(formData.get('id'))
  await updateGarment(supabase, id, gid, { is_favorite: formData.get('value') === '1' }).catch(() => null)
  done()
  redirect(String(formData.get('back') || `/armario/${gid}`))
}

/** Eliminar definitivamente: solo desde la ficha y tras confirmarlo. */
export async function deleteGarmentAction(formData: FormData) {
  const { supabase } = await me()
  if (formData.get('confirm') !== 'on') redirect(`/armario/${formData.get('id')}?error=${encodeURIComponent('Marca la casilla para confirmar la eliminación.')}`)
  await deleteGarment(supabase, String(formData.get('id')))
  done()
  redirect('/armario?deleted=1')
}

export async function removeImageAction(formData: FormData) {
  const { supabase, id } = await me()
  const r = await removeImage(supabase, id, String(formData.get('image_id')))
  done()
  redirect(`/armario/${r.garmentId}?tab=resumen`)
}

export async function setImageRoleAction(formData: FormData) {
  const { supabase } = await me()
  await setImageRole(supabase, String(formData.get('image_id')), String(formData.get('role')))
  done()
  redirect(`/armario/${formData.get('garment_id')}?tab=resumen`)
}

// ── Garment AI (fase 2B) ──
/** Lanza el analisis desde el cliente (alta asistida o boton de la ficha). */
export async function analyzeGarmentAction(garmentId: string, force = false): Promise<{ cached?: boolean; error?: string }> {
  const { supabase, id } = await me()
  try { const r = await analyzeGarment(supabase, id, garmentId, { force }); done(); return { cached: r.cached } } catch (e) { return { error: msg(e) } }
}

/** Formulario de revision: por cada campo propuesto, d_<campo> = accept | reject | correct y v_<campo> = valor corregido. */
export async function confirmAnalysisAction(formData: FormData) {
  const { supabase, id } = await me()
  const gid = String(formData.get('id')), aid = String(formData.get('analysis_id'))
  const decisions: Record<string, Decision> = {}
  for (const [k, v] of formData.entries()) {
    if (!k.startsWith('d_')) continue
    const field = k.slice(2), action = String(v) as Decision['action']
    if (action === 'correct') {
      const raw = formData.getAll(`v_${field}`).map(String).filter(Boolean)
      const value = ['secondary_colors', 'seasons'].includes(field) ? raw : field === 'formality_level' ? (raw[0] ? Number(raw[0]) : null) : raw[0] ?? null
      decisions[field] = { action, value }
    } else decisions[field] = { action }
  }
  let q = ''
  try {
    const r = await confirmAnalysis(supabase, id, gid, aid, decisions, { activate: formData.get('activate') === '1' })
    q = `reviewed=${r.status}&a=${r.accepted}&c=${r.corrected}&r=${r.rejected}${r.warnings.length ? `&warn=${encodeURIComponent(r.warnings.join(' '))}` : ''}`
  } catch (e) { redirect(`/armario/${gid}?tab=analisis&error=${encodeURIComponent(msg(e))}`) }
  done()
  redirect(`/armario/${gid}?tab=analisis&${q}`)
}
