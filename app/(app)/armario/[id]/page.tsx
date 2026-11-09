import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { getGarment, WardrobeError } from '@/lib/wardrobe/service'
import { ATTRIBUTES, COMPOSITION_SOURCES, CONDITIONS, IMAGE_ROLES, OCCASIONS, SEASONS, STATUSES, familyOf, groupOf, subOf } from '@/lib/wardrobe/taxonomy'
import { garmentTitle } from '@/lib/wardrobe/display'
import { STYLE_CATALOG, styleName } from '@/lib/style/catalog'
import { GarmentFields } from '@/components/wardrobe/garment-fields'
import { AddPhotos } from '@/components/wardrobe/add-photos'
import { deleteGarmentAction, removeImageAction, setImageRoleAction, setStatusAction, toggleFavoriteAction, updateGarmentAction } from '../actions'

const TABS = [['resumen', 'Resumen'], ['caracteristicas', 'Características'], ['compatibilidad', 'Compatibilidad'], ['ajuste', 'Fit Assessment'], ['combinaciones', 'Combinaciones'], ['historial', 'Historial']] as const
const FIELD: Record<string, string> = {
  name: 'Nombre', category: 'Categoría', subcategory: 'Tipo', brand: 'Marca', size_label: 'Talla de etiqueta', size_fit: 'Talla que te funciona', primary_color: 'Color principal',
  secondary_colors: 'Colores secundarios', cut: 'Corte', silhouette: 'Silueta', pattern: 'Estampado', apparent_material: 'Material aparente', confirmed_composition: 'Composición',
  composition_source: 'Origen de la composición', attributes: 'Características técnicas', formality_level: 'Formalidad', seasons: 'Temporadas', occasions: 'Ocasiones', style_tags: 'Estilo',
  condition: 'Conservación', location: 'Ubicación', purchase_price: 'Precio', purchase_date: 'Fecha de compra', store: 'Tienda', estimated_uses: 'Usos estimados', notes: 'Notas',
  wardrobe_status: 'Estado', is_favorite: 'Favorita',
}
const EVENT: Record<string, string> = { created: 'Incorporada', updated: 'Ficha editada', status: 'Cambio de estado', favorite: 'Favorita', image_added: 'Foto añadida', image_removed: 'Foto quitada', archived: 'Archivada', restored: 'Recuperada del archivo' }
const label = (xs: { id: string; label: string }[], id?: string | null) => xs.find((x) => x.id === id)?.label ?? id
const fmt = (iso: string) => new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const show = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : Array.isArray(v) ? v.join(', ') || '—' : typeof v === 'object' ? Object.entries(v as object).map(([k, x]) => `${k}: ${x}`).join('; ') || '—' : String(v))

export default async function GarmentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params
  const sp = await searchParams
  const user = (await getUser())!
  let g: Record<string, any> & { images: Record<string, any>[]; events: Record<string, any>[]; complete: boolean; missing: string[] }
  try { g = await getGarment(user.supabase, id) } catch (e) { if (e instanceof WardrobeError && e.status === 404) notFound(); throw e }
  const tab = TABS.some(([t]) => t === sp.tab) ? sp.tab! : 'resumen'
  const family = familyOf(g.subcategory, g.category)
  const attrs = ATTRIBUTES[family].filter((d) => g.attributes?.[d.key])

  return (
    <main className="wide">
      <p className="eyebrow">{groupOf(g.category)?.label}{g.subcategory ? ` · ${subOf(g.subcategory)?.label}` : ''}</p>
      <h1 className="display">{garmentTitle(g)}</h1>
      <p className={`state ${g.wardrobe_status === 'active' && g.complete ? 'ok' : 'warn'}`}>
        {label(STATUSES, g.wardrobe_status)}{g.wardrobe_status !== 'archived' && !g.complete ? ` · falta: ${g.missing.join(', ').toLowerCase()}` : ''}{g.is_favorite ? ' · ★ favorita' : ''}
      </p>
      {sp.nuevo && <p className="note" role="status">Prenda creada{g.wardrobe_status === 'draft' ? ' como borrador' : ' en tu armario'}. Revisa la ficha cuando quieras.</p>}
      {sp.saved && <p className="note" role="status">Guardado.</p>}
      {sp.status && <p className="note" role="status">{sp.status === 'archived' ? 'Archivada: ya no cuenta en tu armario activo. Puedes recuperarla cuando quieras.' : sp.status === 'active' ? 'La prenda está en tu armario.' : 'Estado actualizado.'}</p>}
      {sp.dup && <p className="note warn" role="status">Alguna de estas fotos ya estaba en tu armario: puede que sea la misma prenda.</p>}
      {sp.warn && <p className="note warn" role="status">{sp.warn}</p>}
      {sp.error && <p className="note warn" role="alert">{sp.error}</p>}

      <nav className="tabs-g" aria-label="Secciones de la ficha">
        {TABS.map(([t, l]) => <Link key={t} href={`/armario/${id}?tab=${t}`} aria-current={tab === t ? 'page' : undefined}>{l}</Link>)}
      </nav>

      {tab === 'resumen' && (<>
        <div className="wimgs">
          {g.images.map((im) => (
            <figure key={im.id}>
              <a href={im.url ?? '#'} target="_blank" rel="noreferrer"><img src={im.thumb_url ?? im.url ?? ''} alt={`${garmentTitle(g)}: ${label(IMAGE_ROLES, im.role)}`} /></a>
              <form action={setImageRoleAction} className="rolef">
                <input type="hidden" name="image_id" value={im.id} /><input type="hidden" name="garment_id" value={id} />
                <select name="role" defaultValue={im.role} aria-label="Qué muestra esta foto">{IMAGE_ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
                <button className="btn quiet small">Guardar</button>
              </form>
              <form action={removeImageAction}><input type="hidden" name="image_id" value={im.id} /><button className="btn quiet small">Quitar foto</button></form>
            </figure>
          ))}
          {!g.images.length && <p className="m">Sin fotografías todavía.</p>}
        </div>
        <section className="addphotos"><h3>Añadir fotografías</h3><AddPhotos uid={user.id} garmentId={id} roles={IMAGE_ROLES} /></section>

        <dl className="kv">
          <dt>Color</dt><dd>{show([g.primary_color, ...(g.secondary_colors ?? [])].filter(Boolean))}</dd>
          <dt>Corte · silueta</dt><dd>{show([g.cut, g.silhouette].filter(Boolean))}</dd>
          <dt>Estampado</dt><dd>{show(g.pattern)}</dd>
          {attrs.map((d) => [<dt key={`t${d.key}`}>{d.label}</dt>, <dd key={`d${d.key}`}>{g.attributes[d.key]}</dd>])}
          <dt>Material aparente</dt><dd>{show(g.apparent_material)}</dd>
          <dt>Composición</dt><dd>{g.confirmed_composition ? `${g.confirmed_composition} · confirmada (${label(COMPOSITION_SOURCES, g.composition_source)?.toString().toLowerCase()})` : 'Sin confirmar'}</dd>
          <dt>Formalidad</dt><dd>{g.formality_level ? `${g.formality_level}/5` : '—'}</dd>
          <dt>Temporadas</dt><dd>{show((g.seasons ?? []).map((x: string) => label(SEASONS, x)))}</dd>
          <dt>Ocasiones</dt><dd>{show((g.occasions ?? []).map((x: string) => label(OCCASIONS, x)))}</dd>
          <dt>Estilo</dt><dd>{show((g.style_tags ?? []).map(styleName))}</dd>
          <dt>Marca · tienda</dt><dd>{show([g.brand, g.store].filter(Boolean))}</dd>
          <dt>Talla</dt><dd>{g.size_label ? `Etiqueta ${g.size_label}` : '—'}{g.size_fit ? ` · te funciona: ${g.size_fit}` : ''}</dd>
          <dt>Compra</dt><dd>{show([g.purchase_price != null ? `${g.purchase_price} €` : null, g.purchase_date].filter(Boolean))}</dd>
          <dt>Conservación · usos</dt><dd>{label(CONDITIONS, g.condition)}{g.estimated_uses != null ? ` · ${g.estimated_uses} usos estimados` : ''}</dd>
          <dt>Ubicación</dt><dd>{show(g.location)}</dd>
          {g.notes && (<><dt>Notas</dt><dd>{g.notes}</dd></>)}
        </dl>

        <div className="btns">
          {g.wardrobe_status !== 'active' && <form action={setStatusAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="active" /><button className="btn primary">{g.wardrobe_status === 'archived' ? 'Recuperar al armario' : 'Confirmar y guardar en el armario'}</button></form>}
          {g.wardrobe_status !== 'archived' && <form action={setStatusAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="archived" /><button className="btn">Archivar</button></form>}
          <form action={toggleFavoriteAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="value" value={g.is_favorite ? '0' : '1'} /><button className="btn quiet">{g.is_favorite ? 'Quitar de favoritas' : 'Marcar como favorita'}</button></form>
          <Link className="btn quiet" href={`/armario/${id}?tab=caracteristicas`}>Editar ficha</Link>
        </div>
        <details className="howto"><summary>Eliminar definitivamente</summary>
          <form action={deleteGarmentAction}>
            <input type="hidden" name="id" value={id} />
            <p className="m small">Se borran la ficha, su historial y sus fotos. Si solo ya no la usas, mejor archívala.</p>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--ink)' }}><input type="checkbox" name="confirm" /> Entiendo que no se puede deshacer</label>
            <div className="btns"><button className="btn">Eliminar prenda</button></div>
          </form>
        </details>
      </>)}

      {tab === 'caracteristicas' && (
        <form action={updateGarmentAction}>
          <input type="hidden" name="id" value={id} />
          <GarmentFields initial={g} styles={STYLE_CATALOG.map((s) => ({ id: s.id, name: s.name }))} />
          <div className="btns">
            <button className="btn primary">Guardar cambios</button>
            {g.wardrobe_status === 'draft' && <button className="btn" name="status" value="active">Guardar y confirmar en el armario</button>}
          </div>
          <p className="m small">Cada cambio queda en el historial con su origen y fecha. Los datos que introduces tú constan como confirmados por ti.</p>
        </form>
      )}

      {tab === 'compatibilidad' && (
        <div className="pending"><p className="state warn">Pendiente · fase 2C</p>
          <p>Aquí verás la compatibilidad personal de la prenda con tu Style Blueprint: estilo, armonía cromática con tu temperatura validada, corte frente a tus preferencias y proporciones, y utilidad en tus actividades. Una puntuación que no pueda calcularse aparecerá como «pendiente», nunca como cero.</p></div>
      )}
      {tab === 'ajuste' && (
        <div className="pending"><p className="state warn">Pendiente · fase 2C</p>
          <p>El ajuste real solo se valora con fotos tuyas llevándola. Ya puedes subirlas con la función «Llevándola puesta» ({g.images.filter((i) => i.role === 'worn').length} por ahora): las usaremos en el Fit Assessment.</p></div>
      )}
      {tab === 'combinaciones' && (
        <div className="pending"><p className="state warn">Pendiente</p><p>Las combinaciones con el resto del armario llegarán con el motor de estilismo (Outfit Studio).</p></div>
      )}
      {tab === 'historial' && (
        <ul className="events">
          {g.events.map((e) => (
            <li key={e.id}><b>{EVENT[e.kind] ?? e.kind}</b> <span className="m small">· {fmt(e.created_at)} · {e.source === 'usuario' ? 'por ti' : e.source}</span>
              {e.kind === 'updated' && e.changes && <ul className="m small">{Object.entries(e.changes as Record<string, [unknown, unknown]>).map(([k, [a, b]]) => <li key={k}>{FIELD[k] ?? k}: {show(a)} → {show(b)}</li>)}</ul>}
              {e.kind !== 'updated' && e.changes && (e.changes as Record<string, unknown>).role ? <span className="m small"> · {label(IMAGE_ROLES, String((e.changes as Record<string, unknown>).role))}</span> : null}
            </li>
          ))}
          {Object.keys(g.field_sources ?? {}).length > 0 && <li className="m small">Origen actual de los datos: {Object.entries(g.field_sources).map(([k, v]) => `${FIELD[k] ?? k} (${(v as { source: string }).source === 'usuario' ? 'tú' : (v as { source: string }).source})`).join(', ')}.</li>}
        </ul>
      )}
      <p className="m small" style={{ marginTop: 28 }}><Link href="/armario">← Volver al armario</Link></p>
    </main>
  )
}
