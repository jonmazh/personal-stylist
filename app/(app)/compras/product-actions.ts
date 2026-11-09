'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { WardrobeError } from '@/lib/wardrobe/service'
import {
  addProductImage, addRetailer, createManualProduct, createSource, deleteProduct, deleteRetailer, deleteSource, importFromUrl,
  saveSearchResult, searchProducts, syncSource, updateProduct, verifyProduct,
} from '@/lib/shopping/catalog-service'
import { analyzeProduct, evaluateProduct, setGarmentMeasurements, setSizeChart } from '@/lib/shopping/evaluator-service'

/** Acciones de Product Discovery (fase 4B). */
async function me() { const u = await getUser(); if (!u) redirect('/login'); return u }
const msg = (e: unknown) => (e instanceof WardrobeError || e instanceof Error ? e.message : 'Error')
const done = () => revalidatePath('/compras', 'layout')
const s = (f: FormData, k: string) => { const v = f.get(k); return typeof v === 'string' && v.trim() ? v.trim() : null }
const n = (f: FormData, k: string) => { const v = s(f, k); return v == null ? null : Number(v.replace(',', '.')) }
const go = (url: string, q: string) => redirect(`${url}${url.includes('?') ? '&' : '?'}${q}`)
const err = (url: string, e: unknown) => go(url, `error=${encodeURIComponent(msg(e))}`)

export async function searchAction(f: FormData) {
  const { supabase, id } = await me()
  let sid = ''
  try { sid = (await searchProducts(supabase, id, { need_id: s(f, 'need_id'), text: s(f, 'text'), force: f.get('force') === '1' })).id } catch (e) { err('/compras/buscar', e) }
  done(); redirect(`/compras/buscar?s=${sid}`)
}
export async function saveResultAction(f: FormData) {
  const { supabase, id } = await me()
  const sid = String(f.get('search_id'))
  let pid = ''
  try { pid = (await saveSearchResult(supabase, id, sid, Number(f.get('index')))).id } catch (e) { err(`/compras/buscar?s=${sid}`, e) }
  done(); redirect(`/compras/productos/${pid}?saved=1`)
}
export async function importUrlAction(f: FormData) {
  const { supabase, id } = await me()
  const need = s(f, 'need_id')
  let r: Awaited<ReturnType<typeof importFromUrl>> | null = null
  try { r = await importFromUrl(supabase, id, { url: s(f, 'url') ?? '', need_id: need }) } catch (e) { err(`/compras/importar${need ? `?need=${need}` : ''}`, e) }
  done()
  if (r?.ok) redirect(`/compras/productos/${r.id}?imported=1`)
  const q = new URLSearchParams({ url: r!.url, msg: r!.message, ...(need ? { need } : {}), ...(r!.retailer ? { retailer: r!.retailer.id } : {}) })
  redirect(`/compras/importar?${q}#asistida`)
}
export async function manualProductAction(f: FormData) {
  const { supabase, id } = await me()
  let pid = ''
  try {
    pid = await createManualProduct(supabase, id, {
      product_name: s(f, 'product_name') ?? '', product_url: s(f, 'product_url'), retailer_id: s(f, 'retailer_id'), brand: s(f, 'brand'), price: n(f, 'price'),
      subcategory: s(f, 'subcategory'), color: s(f, 'color'), composition: s(f, 'composition'), description: s(f, 'description'), sizes: s(f, 'sizes'),
      need_id: s(f, 'need_id'), availability: s(f, 'availability') ?? 'unknown',
    })
  } catch (e) { err('/compras/importar', e) }
  done(); redirect(`/compras/productos/${pid}?created=1`)
}
export async function productEditAction(f: FormData) {
  const { supabase, id } = await me()
  const pid = String(f.get('id'))
  const patch: Record<string, unknown> = {}
  for (const k of ['product_name', 'brand', 'subcategory', 'primary_color', 'confirmed_composition', 'description']) if (f.has(k)) patch[k] = s(f, k)
  if (f.has('current_price')) patch.current_price = n(f, 'current_price')
  if (f.has('need_id')) patch.need_id = s(f, 'need_id')
  try { await updateProduct(supabase, id, pid, patch) } catch (e) { err(`/compras/productos/${pid}`, e) }
  done(); go(`/compras/productos/${pid}`, 'edited=1')
}
export async function productStatusAction(f: FormData) {
  const { supabase, id } = await me()
  const pid = String(f.get('id'))
  try { await updateProduct(supabase, id, pid, { status: s(f, 'status'), ...(f.has('discard_reason') ? { discard_reason: s(f, 'discard_reason') } : {}) }) } catch (e) { err(`/compras/productos/${pid}`, e) }
  done(); go(`/compras/productos/${pid}`, `status=${f.get('status')}`)
}
export async function verifyAction(f: FormData) {
  const { supabase, id } = await me()
  const pid = String(f.get('id'))
  let note = ''
  try { note = (await verifyProduct(supabase, id, pid, f.get('manual') ? { price: n(f, 'price'), availability: s(f, 'availability'), sizes: s(f, 'sizes') } : null)).note } catch (e) { err(`/compras/productos/${pid}`, e) }
  done(); go(`/compras/productos/${pid}`, `verified=${encodeURIComponent(note)}`)
}
export async function deleteProductAction(f: FormData) {
  const { supabase } = await me()
  try { await deleteProduct(supabase, String(f.get('id'))) } catch (e) { err('/compras/productos', e) }
  done(); go('/compras/productos', 'deleted=1')
}
export async function registerProductImageAction(productId: string, storagePath: string) {
  const { supabase, id } = await me()
  try { await addProductImage(supabase, id, productId, storagePath); done(); return { ok: true } } catch (e) { return { error: msg(e) } }
}

// ── Tiendas y fuentes ──
export async function addRetailerAction(f: FormData) {
  const { supabase, id } = await me()
  try { await addRetailer(supabase, id, { name: s(f, 'name') ?? '', domains: (s(f, 'domains') ?? '').split(/[\s,]+/).filter(Boolean), url_policy: s(f, 'url_policy') ?? 'manual_only', policy_note: s(f, 'policy_note') }) } catch (e) { err('/compras/fuentes', e) }
  done(); go('/compras/fuentes', 'retailer=1')
}
export async function deleteRetailerAction(f: FormData) {
  const { supabase } = await me()
  try { await deleteRetailer(supabase, String(f.get('id'))) } catch (e) { err('/compras/fuentes', e) }
  done(); go('/compras/fuentes', 'removed=1')
}
export async function createSourceAction(f: FormData) {
  const { supabase, id } = await me()
  try {
    const sid = await createSource(supabase, id, { name: s(f, 'name') ?? '', feed_url: s(f, 'feed_url'), format: s(f, 'format'), retailer_id: s(f, 'retailer_id'), authorization_note: s(f, 'authorization_note') ?? '' })
    const file = f.get('file')
    const text = file && typeof file !== 'string' && file.size ? await file.text() : null
    if (text || s(f, 'feed_url')) await syncSource(supabase, id, sid, text)
  } catch (e) { err('/compras/fuentes', e) }
  done(); go('/compras/fuentes', 'source=1')
}
export async function syncSourceAction(f: FormData) {
  const { supabase, id } = await me()
  try { const file = f.get('file'); await syncSource(supabase, id, String(f.get('id')), file && typeof file !== 'string' && file.size ? await file.text() : null) } catch (e) { err('/compras/fuentes', e) }
  done(); go('/compras/fuentes', 'synced=1')
}
export async function deleteSourceAction(f: FormData) {
  const { supabase } = await me()
  try { await deleteSource(supabase, String(f.get('id'))) } catch (e) { err('/compras/fuentes', e) }
  done(); go('/compras/fuentes', 'removed=1')
}

// ── Fase 4C: análisis, evaluación, tallas ──
export async function analyzeProductAction(f: FormData) {
  const { supabase, id } = await me()
  const pid = String(f.get('id'))
  try { await analyzeProduct(supabase, id, pid, { force: f.get('force') === '1' }) } catch (e) { err(`/compras/productos/${pid}`, e) }
  done(); go(`/compras/productos/${pid}`, 'analyzed=1#analisis')
}
export async function evaluateProductAction(f: FormData) {
  const { supabase, id } = await me()
  const pid = String(f.get('id'))
  try { await evaluateProduct(supabase, id, pid, { reference_id: s(f, 'reference_id') }) } catch (e) { err(`/compras/productos/${pid}`, e) }
  done(); go(`/compras/productos/${pid}`, 'evaluated=1#evaluacion')
}
export async function referenceMeasuresAction(f: FormData) {
  const { supabase, id } = await me()
  const pid = String(f.get('id')), gid = String(f.get('garment_id'))
  const m = Object.fromEntries([...f.entries()].filter(([k, v]) => k.startsWith('m_') && String(v).trim()).map(([k, v]) => [k.slice(2), Number(String(v).replace(',', '.'))]))
  try { await setGarmentMeasurements(supabase, id, gid, { measurements: m }); await evaluateProduct(supabase, id, pid, { reference_id: gid }) } catch (e) { err(`/compras/productos/${pid}`, e) }
  done(); go(`/compras/productos/${pid}`, 'evaluated=1#talla')
}
export async function sizeChartAction(f: FormData) {
  const { supabase, id } = await me()
  const pid = String(f.get('id'))
  const rows = [0, 1, 2, 3, 4, 5].map((i) => ({ size: s(f, `size_${i}`), measurements: Object.fromEntries([...f.entries()].filter(([k, v]) => k.startsWith(`r${i}_`) && String(v).trim()).map(([k, v]) => [k.slice(`r${i}_`.length), Number(String(v).replace(',', '.'))])) }))
    .filter((r) => r.size && Object.keys(r.measurements).length)
  try { await setSizeChart(supabase, id, pid, rows); await evaluateProduct(supabase, id, pid, { reference_id: s(f, 'reference_id') }) } catch (e) { err(`/compras/productos/${pid}`, e) }
  done(); go(`/compras/productos/${pid}`, 'evaluated=1#talla')
}
