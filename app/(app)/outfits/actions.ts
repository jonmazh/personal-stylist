'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { WardrobeError } from '@/lib/wardrobe/service'
import { createOutfit, deleteOutfit, setOutfitStatus, updateOutfit } from '@/lib/outfits/service'
import { dismissProposal, runGeneration, saveProposal } from '@/lib/outfits/generate-service'
import { sendMessage, startSession } from '@/lib/outfits/stylist/service'

async function me() {
  const u = await getUser()
  if (!u) redirect('/login')
  return u
}
const msg = (e: unknown) => (e instanceof WardrobeError || e instanceof Error ? e.message : 'Error')
const done = () => { revalidatePath('/outfits', 'layout'); revalidatePath('/armario', 'layout') }

/** Guardado desde el constructor (cliente): crea o actualiza datos y prendas de una vez. */
export async function saveOutfitAction(payload: { id?: string; meta: Record<string, unknown>; items: { id?: string; garment_id: string | null; role: string }[] }): Promise<{ id?: string; warnings?: string[]; error?: string }> {
  const { supabase, id } = await me()
  try {
    const r = payload.id ? await updateOutfit(supabase, id, payload.id, payload.meta, payload.items) : await createOutfit(supabase, id, payload.meta, payload.items)
    done()
    return r
  } catch (e) { return { error: msg(e) } }
}

export async function setOutfitStatusAction(formData: FormData) {
  const { supabase } = await me()
  const oid = String(formData.get('id')), status = String(formData.get('status')) as 'draft' | 'saved' | 'archived'
  try { await setOutfitStatus(supabase, oid, status) } catch (e) { redirect(`/outfits/${oid}?error=${encodeURIComponent(msg(e))}`) }
  done()
  redirect(`/outfits/${oid}?status=${status}`)
}

export async function toggleOutfitFavoriteAction(formData: FormData) {
  const { supabase, id } = await me()
  const oid = String(formData.get('id'))
  await updateOutfit(supabase, id, oid, { is_favorite: formData.get('value') === '1' }).catch(() => null)
  done()
  redirect(String(formData.get('back') || `/outfits/${oid}`))
}

/** Eliminar definitivamente: solo tras confirmarlo. Las prendas del armario no se tocan. */
export async function deleteOutfitAction(formData: FormData) {
  const { supabase } = await me()
  const oid = String(formData.get('id'))
  if (formData.get('confirm') !== 'on') redirect(`/outfits/${oid}?error=${encodeURIComponent('Marca la casilla para confirmar la eliminación.')}`)
  await deleteOutfit(supabase, oid)
  done()
  redirect('/outfits?deleted=1')
}

// ── Motor de combinaciones (3B) ──
const list = (f: FormData, k: string) => f.getAll(k).map(String).filter(Boolean)
const one = (f: FormData, k: string) => { const v = f.get(k); return typeof v === 'string' && v ? v : null }
/** Formulario de generación → petición estructurada (las mismas claves que POST /api/outfits/generate). */
export async function generateAction(formData: FormData) {
  const { supabase, id } = await me()
  let gid = ''
  try {
    gid = await runGeneration(supabase, id, {
      occasion: one(formData, 'occasion'), dress_code: one(formData, 'dress_code'), time_of_day: one(formData, 'time_of_day'), environment: one(formData, 'environment'),
      weather: one(formData, 'weather'), formality: one(formData, 'formality'), comfort_priority: one(formData, 'comfort_priority'), preferred_style: one(formData, 'preferred_style'),
      restrictions: list(formData, 'restrictions'), exclude_categories: list(formData, 'exclude_categories'), required_garment_ids: list(formData, 'required_garment_ids'),
      number_of_outfits: Number(formData.get('number_of_outfits')) || 3,
    })
  } catch (e) { redirect(`/outfits/generar?error=${encodeURIComponent(msg(e))}`) }
  done()
  redirect(`/outfits/generar?g=${gid}`)
}

export async function proposalAction(formData: FormData) {
  const { supabase, id } = await me()
  const rid = String(formData.get('result_id')), gid = String(formData.get('generation_id'))
  if (formData.get('action') === 'dismiss') {
    try { await dismissProposal(supabase, rid) } catch (e) { redirect(`/outfits/generar?g=${gid}&error=${encodeURIComponent(msg(e))}`) }
    done(); redirect(formData.get('back') ? `${formData.get('back')}?dismissed=1#r-${rid}` : `/outfits/generar?g=${gid}&dismissed=1#r-${rid}`)
  }
  let oid = ''
  try { oid = (await saveProposal(supabase, id, rid, one(formData, 'name'))).id } catch (e) { redirect(`/outfits/generar?g=${gid}&error=${encodeURIComponent(msg(e))}`) }
  done()
  redirect(`/outfits/${oid}?saved=1`)
}

// ── Estilista con IA (3C) ──
export async function startStylistAction(formData: FormData) {
  const { supabase, id } = await me()
  const overrides: Record<string, unknown> = {}
  for (const k of ['occasion', 'dress_code', 'time_of_day', 'weather']) { const v = one(formData, k); if (v) overrides[k] = v }
  const n = Number(formData.get('number_of_outfits')); if (n) overrides.number_of_outfits = n
  let sid = ''
  try { sid = await startSession(supabase, id, String(formData.get('message') ?? ''), overrides as never) } catch (e) { redirect(`/outfits?error=${encodeURIComponent(msg(e))}`) }
  done()
  redirect(`/outfits/estilista/${sid}`)
}

export async function stylistMessageAction(formData: FormData) {
  const { supabase, id } = await me()
  const sid = String(formData.get('session_id'))
  try { await sendMessage(supabase, id, sid, String(formData.get('message') ?? '')) } catch (e) { redirect(`/outfits/estilista/${sid}?error=${encodeURIComponent(msg(e))}`) }
  done()
  redirect(`/outfits/estilista/${sid}?m=${Date.now()}#fin`)
}
