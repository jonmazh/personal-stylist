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
import { analyzeProductAction, deleteProductAction, evaluateProductAction, productEditAction, productStatusAction, referenceMeasuresAction, sizeChartAction, verifyAction } from '../../product-actions'
import { latestAnalysis, latestEvaluation, referenceGarments } from '@/lib/shopping/evaluator-service'
import { measureSet } from '@/lib/shopping/sizing'
import { EvaluationView } from '@/components/shopping/evaluation'
import { garmentTitle } from '@/lib/wardrobe/display'

type Row = Record<string, any>
const eur = (x: unknown) => (x == null ? null : `${Number(x).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`)

export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const user = (await getUser())!
  const p = await getProduct(user.supabase, id).catch(() => null)
  if (!p) notFound()
  const [needs, analysis, evaluation, refs] = await Promise.all([listNeeds(user.supabase, { status: 'all' }).catch(() => []), latestAnalysis(user.supabase, id).catch(() => null), latestEvaluation(user.supabase, id).catch(() => null), referenceGarments(user.supabase, p).catch(() => [])])
  const mset = measureSet(p.subcategory, p.category)
  const { data: sameFamily } = mset ? await user.supabase.from('garments').select('id, name, brand, category, subcategory, primary_color').eq('wardrobe_status', 'active') : { data: [] as Row[] }
  const candidatesRef = (sameFamily ?? []).filter((g: Row) => measureSet(g.subcategory, g.category) === mset)
  const size = (evaluation?.size ?? null) as Row
  const na = analysis?.normalized as Row | undefined
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

      <section className="osec" id="analisis"><h2>Análisis del producto</h2>
        {sp.analyzed && <p className="note" role="status">Análisis hecho. Los datos que aporta quedan marcados como «Foto» o «IA» y no sustituyen a los de la tienda ni a los tuyos.</p>}
        <p className="m small">La IA lee la descripción de la tienda y tus capturas{p.source_kind === 'feed' ? ' y las imágenes del feed autorizado' : ''} para identificar corte, silueta, tejido aparente, formalidad, temporada y estilo. No rellena composición, tallas ni precio.</p>
        {na ? (<>
          <p className="small">{na.style_tags?.length ? `Estilo: ${na.style_tags.map((t: Row) => t.name).join(', ')}. ` : ''}{na.model_photos ? 'Hay fotos con modelo: su ajuste no es el tuyo.' : ''}</p>
          <div className="combos">
            <div className="need"><span className="st">Calidad documentada</span><ul className="small">{na.quality.documented.length ? na.quality.documented.map((q: string) => <li key={q}>{q}</li>) : <li>Nada documentado por la tienda.</li>}</ul></div>
            <div className="need"><span className="st">Calidad aparente (fotos)</span><ul className="small">{na.quality.apparent.length ? na.quality.apparent.map((q: string) => <li key={q}>{q}</li>) : <li>Sin fotos analizadas.</li>}</ul></div>
            <div className="need"><span className="st">Desconocido</span><ul className="small">{na.quality.unknown.map((q: string) => <li key={q}>{q}</li>)}</ul></div>
          </div>
          {na.observations?.length > 0 && <p className="small">Observaciones: {na.observations.join(' · ')}</p>}
          {na.discarded?.length > 0 && <p className="m small">Descartado por no ajustarse a la taxonomía o no estar documentado: {na.discarded.join(' · ')}</p>}
          <p className="m small">{analysis!.model_id} · {analysis!.prompt_version} · {new Date(analysis!.created_at).toLocaleString('es-ES')} · {(analysis!.images_used as Row[]).length} imagen(es)</p>
        </>) : <p className="m">Aún sin analizar.</p>}
        <form action={analyzeProductAction} className="btns"><input type="hidden" name="id" value={p.id} />{na && <input type="hidden" name="force" value="1" />}<PendingButton className="btn small" label={na ? 'Volver a analizar' : 'Analizar con IA'} pending="Analizando el producto…" /></form>
      </section>

      <section className="osec" id="evaluacion"><h2>¿Merece la pena?</h2>
        {sp.evaluated && <p className="note" role="status">Evaluación actualizada.</p>}
        {evaluation ? <EvaluationView e={evaluation} /> : <p className="m">Evalúo este producto con tu perfil, tu armario, tus necesidades y lo que ya tienes. {!na ? 'Conviene analizarlo antes.' : ''}</p>}
        <form action={evaluateProductAction} className="btns"><input type="hidden" name="id" value={p.id} />{size?.reference && <input type="hidden" name="reference_id" value={size.reference.id} />}<PendingButton className="btn small primary" label={evaluation ? 'Volver a evaluar' : 'Evaluar la compra'} pending="Evaluando con tu armario…" /></form>
      </section>

      {mset && (<section className="osec" id="talla"><h2>Talla</h2>
        {size?.size ? <p className="verdict"><b>Talla {size.size}</b> · confianza {size.confidence}{size.available === false ? ' · agotada' : ''}{size.reference ? ` · comparada con «${size.reference.title}»` : ''}</p> : size ? <p className="m">{size.notes?.[0]}</p> : null}
        {size?.notes?.length > 0 && size.size && <ul className="small">{(size.notes as string[]).map((n) => <li key={n}>{n}</li>)}</ul>}
        {size?.table?.length > 0 && <div className="cmpwrap"><table className="cmp"><thead><tr><th>Talla</th>{mset.map((m) => <th key={m.key}>{m.label}</th>)}</tr></thead><tbody>
          {size.reference && <tr><td>Tu referencia</td>{mset.map((m) => <td key={m.key}>{(refs.find((r) => r.id === size.reference.id)?.measurements as Row)?.[m.key] ?? '—'}</td>)}</tr>}
          {(size.table as Row[]).map((t) => <tr key={t.size}><td>{t.size}{t.size === size.size ? ' ★' : ''}</td>{mset.map((m) => { const d = (t.diffs as Row[]).find((x) => x.key === m.key); return <td key={m.key}>{d ? `${d.cand} (${d.diff > 0 ? '+' : ''}${d.diff})` : '—'}</td> })}</tr>)}
        </tbody></table></div>}
        <details className="howto"><summary>Medidas de una prenda tuya que te queda bien</summary>
          <form action={referenceMeasuresAction}>
            <input type="hidden" name="id" value={p.id} />
            <label>Prenda<select name="garment_id" required defaultValue={refs[0]?.id ?? ''}><option value="" disabled>Elige</option>{candidatesRef.map((g: Row) => <option key={g.id} value={g.id}>{garmentTitle(g)}</option>)}</select></label>
            <p className="m small">Mídela en plano, igual que la guía de la tienda, en cm.</p>
            <div className="sizegrid">{mset.map((m) => <label key={m.key}>{m.label}<input name={`m_${m.key}`} inputMode="decimal" defaultValue={(refs[0]?.measurements as Row)?.[m.key] ?? ''} /></label>)}</div>
            <div className="btns"><button className="btn small">Guardar medidas y comparar</button></div>
          </form>
        </details>
        <details className="howto"><summary>Guía de medidas de la tienda</summary>
          <form action={sizeChartAction}>
            <input type="hidden" name="id" value={p.id} />{size?.reference && <input type="hidden" name="reference_id" value={size.reference.id} />}
            <p className="m small">Cópiala de la web de la tienda (en cm). Queda marcada como introducida por ti.</p>
            {[0, 1, 2, 3, 4, 5].map((i) => { const v = (p.variants as Row[])[i]; return (
              <div key={i} className="sizegrid"><label>Talla<input name={`size_${i}`} maxLength={30} defaultValue={v?.size ?? ''} /></label>{mset.map((m) => <label key={m.key}>{m.label}<input name={`r${i}_${m.key}`} inputMode="decimal" defaultValue={v?.measurements?.[m.key] ?? ''} /></label>)}</div>) })}
            <div className="btns"><button className="btn small">Guardar guía y comparar</button></div>
          </form>
        </details>
      </section>)}

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
