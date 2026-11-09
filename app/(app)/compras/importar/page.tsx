import Link from 'next/link'
import { getUser } from '@/lib/supabase/server'
import { listRetailers } from '@/lib/shopping/catalog-service'
import { listNeeds } from '@/lib/shopping/service'
import { AVAILABILITY } from '@/lib/shopping/catalog/taxonomy'
import { GARMENT_COLORS, GROUPS, SUBS } from '@/lib/wardrobe/taxonomy'
import { PendingButton } from '@/components/outfits/pending-button'
import { importUrlAction, manualProductAction } from '../product-actions'

type Row = Record<string, any>

/** Importar un producto que has visto: por URL (metadatos públicos, si se permite) o asistida (tus datos y capturas). */
export default async function ImportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams
  const user = (await getUser())!
  const [needs, retailers] = await Promise.all([listNeeds(user.supabase).catch(() => []), listRetailers(user.supabase)])
  const NeedSel = () => <label>Para la necesidad (opcional)<select name="need_id" defaultValue={sp.need ?? ''}><option value="">—</option>{needs.map((n: Row) => <option key={n.id} value={n.id}>{n.title}</option>)}</select></label>
  return (
    <main className="wide shop">
      <p className="eyebrow"><Link href="/compras">Compras</Link> · Importar · <Link href="/compras/productos">Candidatos</Link></p>
      <h1 className="display">Importar un producto</h1>
      {sp.error && <p className="note warn" role="alert">{sp.error}</p>}

      <section className="osec"><h2>Por URL</h2>
        <p className="m small">Leo esa única página, solo si la tienda y su robots.txt lo permiten, y solo los datos de producto que publica para máquinas (schema.org u OpenGraph). En las tiendas de Inditex no se descarga nada: guardo el enlace y completas tú los datos.</p>
        <form action={importUrlAction}>
          <label>Dirección del producto<input name="url" type="url" required maxLength={1000} placeholder="https://…" defaultValue={sp.url ?? ''} /></label>
          <NeedSel />
          <div className="btns"><PendingButton label="Importar" pending="Leyendo la página del producto…" /></div>
        </form>
      </section>

      <section className="osec" id="asistida"><h2>Asistida: tus datos y capturas</h2>
        {sp.msg && <p className="note warn" role="status">{sp.msg}</p>}
        <p className="m small">Copia lo que ves en la tienda. Todo queda marcado como «introducido por ti»; si no conoces la composición, déjala vacía (no la inventaré). Después podrás añadir capturas o fotos en la ficha.</p>
        <form action={manualProductAction}>
          <label>Nombre<input name="product_name" required maxLength={200} /></label>
          <label>Enlace (opcional)<input name="product_url" type="url" maxLength={1000} defaultValue={sp.url ?? ''} /></label>
          <label>Tienda<select name="retailer_id" defaultValue={sp.retailer ?? ''}><option value="">Deducir del enlace</option>{retailers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
          <label>Precio (€)<input name="price" inputMode="decimal" /></label>
          <label>Tipo<select name="subcategory" defaultValue=""><option value="">Deducir del nombre</option>{GROUPS.map((g) => <optgroup key={g.id} label={g.label}>{SUBS.filter((x) => x.group === g.id).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</optgroup>)}</select></label>
          <label>Color<select name="color" defaultValue=""><option value="">Deducir del nombre</option>{GARMENT_COLORS.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label>Composición (tal como la indica la tienda)<input name="composition" maxLength={300} placeholder="98% algodón, 2% elastano" /></label>
          <label>Tallas disponibles<input name="sizes" maxLength={200} placeholder="46, 48, 50" /></label>
          <label>Disponibilidad<select name="availability" defaultValue="unknown">{AVAILABILITY.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
          <label>Descripción<input name="description" maxLength={4000} /></label>
          <NeedSel />
          <div className="btns"><button className="btn primary">Guardar producto</button></div>
        </form>
      </section>
    </main>
  )
}
