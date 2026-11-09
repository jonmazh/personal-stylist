'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { WardrobeError } from '@/lib/wardrobe/service'
import { createOutfit, deleteOutfit, setOutfitStatus, updateOutfit } from '@/lib/outfits/service'

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
