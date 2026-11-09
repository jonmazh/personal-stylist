import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { getProduct } from '@/lib/shopping/catalog-service'
import { listNeeds } from '@/lib/shopping/service'
import { AVAILABILITY, PRODUCT_STATUSES, SOURCE_KINDS, STALE_DAYS, label } from '@/lib/shopping/catalog/taxonomy'
import { GARMENT_COLORS, GROUPS, SUBS, subOf } from '@/lib/wardrobe/taxonomy'
import { Src } from '@/components/shopping/provenance'
import { ScreenshotUpload } from '@/components/shopping/screenshot-upload'
import { PendingButton } from '@/components/outfits/pending-button'
import { deleteProductAction, productEditAction, productStatusAction, verifyAction } from '../../product-actions'

type Row = Record<string, any>
const eur = (x: unknown) => (x == null ? null : `${Number(x).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`)

export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const user = (await getUser())!
  const p = await getProduct(user.supabase, id).catch(() => null)
  if (!p) notFound()
  const needs = await listNeeds(user.supabase, { status: 'all' }).catch(() => [])
  const fs = p.field_sources as Record<string, { source: string; at?: string }>
  const storeImgs = (p.images as Row[]).filter((i) => i.origin === 'store'), mine = (p.images as Row[]).filter((i) => i.origin === 'user')
  const manualOnly = p.retailers?.url_policy === 'manual_only'
  const Field = ({ k, name, children }: { k: string; name: string; children: React.ReactNode }) => <><dt>{name}</dt><dd>{children}<Src fs={fs} k={k} /></dd></>
  return (
    <main className="wide shop">
      <p className="eyebrow"><Link href="/compras/productos">Candidatos</Link> · {p.retailers?.name ?? p.brand ?? 'Tienda'}</p>
      <h1 className="display">{p.product_name}</h1>
      {sp.error && <p className="note warn" role="alert">{sp.error}</p>}
      {(sp.imported || sp.saved || sp.created) && <p className="note" role="status">{sp.imported ? 'Producto importado.' : sp.saved ? 'Guardado como candidato.' : 'Producto guardado con tus datos.'} {p.verify_note}</p>}
      {sp.verified && <p className="note" role="status">{sp.verified}</p>}
      {sp.edited && <p className="note" role="status">Corrección guardada: queda marcada como tuya y no se sobrescribe al reimportar.</p>}
      {sp.status && <p className="note" role="status">Estado: {label(PRODUCT_STATUSES, sp.status)}.</p>}

      <p className="chips">
        <span className="chip">{label(PRODUCT_STATUSES, p.status)}</span><span className="chip">{label(SOURCE_KINDS, p.source_kind)}</span>
        {p.shopping_needs && <Link className="chip" href={`/compras/necesidades/${p.shopping_needs.id}`}>Para: {p.shopping_needs.title}</Link>}
      </p>
      <p className={p.stale ? 'note warn' : 'm small'}>{p.last_verified_at ? `Datos comprobados el ${new Date(p.last_verified_at).toLocaleString('es-ES')}` : 'Datos sin verificar en la tienda'}{p.stale ? `: tienen más de ${STALE_DAYS} días o no se han verificado. Verifica precio y tallas antes de decidir.` : '.'}{p.verify_note ? ` ${p.verify_note}` : ''}</p>
      {p.status === 'discarded' && <p className="verdict">Descartado{p.discard_reason ? `: «${p.discard_reason}»` : ''}.</p>}

      <section className="osec"><h2>Datos</h2>
        <p className="m small">Cada dato indica de dónde sale: tienda, feed, buscador, deducido por reglas o tú. No se completa nada que la tienda no publique.</p>
        <dl className="pfields">
          <Field k="product_name" name="Nombre">{p.product_name}</Field>
          <Field k="brand" name="Marca">{p.brand ?? '—'}</Field>
          <Field k="subcategory" name="Tipo">{p.subcategory ? subOf(p.subcategory)?.label : 'Sin identificar'}</Field>
          <Field k="primary_color" name="Color">{p.colors?.length ? p.colors.join(', ') : 'Sin indicar'}</Field>
          <Field k="confirmed_composition" name="Composición">{p.confirmed_composition ?? 'Composición desconocida'}</Field>
          <Field k="current_price" name="Precio">{eur(p.current_price) ?? 'Sin comprobar'}</Field>
          <Field k="availability_status" name="Disponibilidad">{label(AVAILABILITY, p.availability_status)}</Field>
          <Field k="description" name="Descripción">{p.description ?? '—'}</Field>
          <dt>Enlace</dt><dd>{p.product_url ? <a href={p.product_url} target="_blank" rel="noopener noreferrer nofollow">Ver en la tienda</a> : '—'}</dd>
          <dt>Tienda</dt><dd>{p.retailers?.name ?? 'Desconocida'}{p.retailers?.policy_note ? <span className="m small"> · {p.retailers.policy_note}</span> : null}</dd>
        </dl>
        {p.variants.length > 0 && (<><h3>Tallas</h3><p className="small">{(p.variants as Row[]).map((v) => `${v.size ?? '—'}${v.color ? ` (${v.color})` : ''}: ${label(AVAILABILITY, v.availability).toLowerCase()}`).join(' · ')}</p><p className="m small">Comprobadas el {new Date(p.variants[0].checked_at).toLocaleDateString('es-ES')}.</p></>)}
        {storeImgs.length > 0 && <p className="small">Imágenes de la tienda: {storeImgs.map((i: Row, k: number) => <a key={k} href={i.url} target="_blank" rel="noopener noreferrer nofollow">{`imagen ${k + 1}`} </a>)} <span className="m">(solo enlazadas: no se copian)</span></p>}
      </section>

      <section className="osec"><h2>Verificar precio y tallas</h2>
        {!manualOnly && p.source_kind !== 'manual' && (p.product_url || p.source_kind === 'feed') && <form action={verifyAction}><input type="hidden" name="id" value={p.id} /><PendingButton className="btn small" label="Volver a comprobar en la fuente" pending="Comprobando…" /></form>}
        <form action={verifyAction} className="btns">
          <input type="hidden" name="id" value={p.id} /><input type="hidden" name="manual" value="1" />
          <label>Precio que ves (€)<input name="price" inputMode="decimal" defaultValue={p.current_price ?? ''} /></label>
          <label>Disponibilidad<select name="availability" defaultValue={p.availability_status}>{AVAILABILITY.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
          <label>Tallas disponibles<input name="sizes" maxLength={200} placeholder="46, 48" /></label>
          <button className="btn small">Lo he comprobado yo</button>
        </form>
        {p.history.length > 0 && <p className="m small">Historial: {(p.history as Row[]).map((h) => `${eur(h.price) ?? '—'} ${label(AVAILABILITY, h.availability).toLowerCase()} (${new Date(h.observed_at).toLocaleDateString('es-ES')}, ${label(SOURCE_KINDS, h.source_kind).toLowerCase()})`).join(' · ')}</p>}
      </section>

      <section className="osec"><h2>Capturas y fotos</h2>
        <p className="m small">Privadas: solo tú las ves. Servirán para analizar la prenda (fase 4C).</p>
        {mine.length > 0 && <div className="shots">{mine.map((i: Row) => i.signed_url && <img key={i.storage_path} src={i.signed_url} alt="Captura del producto" />)}</div>}
        <ScreenshotUpload uid={user.id} productId={p.id} />
      </section>

      <section className="osec"><h2>Decidir</h2>
        <div className="btns">
          {p.status !== 'saved' && <form action={productStatusAction}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="status" value="saved" /><button className="btn small primary">Guardar</button></form>}
          {p.status !== 'candidate' && <form action={productStatusAction}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="status" value="candidate" /><button className="btn small">Volver a candidato</button></form>}
        </div>
        {p.status !== 'discarded' && <form action={productStatusAction} className="btns"><input type="hidden" name="id" value={p.id} /><input type="hidden" name="status" value="discarded" />
          <label>Motivo para descartar<input name="discard_reason" required maxLength={300} placeholder="Demasiado caro, no me gusta el tejido…" /></label><button className="btn small">Descartar</button></form>}
      </section>

      <details className="howto osec"><summary>Corregir datos</summary>
        <form action={productEditAction}>
          <input type="hidden" name="id" value={p.id} />
          <label>Nombre<input name="product_name" required maxLength={200} defaultValue={p.product_name} /></label>
          <label>Marca<input name="brand" maxLength={80} defaultValue={p.brand ?? ''} /></label>
          <label>Tipo<select name="subcategory" defaultValue={p.subcategory ?? ''}><option value="">Sin identificar</option>{GROUPS.map((g) => <optgroup key={g.id} label={g.label}>{SUBS.filter((x) => x.group === g.id).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</optgroup>)}</select></label>
          <label>Color principal<select name="primary_color" defaultValue={p.primary_color ?? ''}><option value="">Sin indicar</option>{GARMENT_COLORS.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label>Composición<input name="confirmed_composition" maxLength={300} defaultValue={p.confirmed_composition ?? ''} /></label>
          <label>Para la necesidad<select name="need_id" defaultValue={p.need_id ?? ''}><option value="">—</option>{needs.map((n: Row) => <option key={n.id} value={n.id}>{n.title}</option>)}</select></label>
          <div className="btns"><button className="btn primary">Guardar correcciones</button></div>
        </form>
      </details>
      <details className="howto osec"><summary>Eliminar</summary>
        <form action={deleteProductAction}><input type="hidden" name="id" value={p.id} /><p className="m small">Se borra el producto y tus capturas.</p><button className="btn small">Eliminar producto</button></form>
      </details>
    </main>
  )
}
