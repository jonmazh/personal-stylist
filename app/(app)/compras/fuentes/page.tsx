import Link from 'next/link'
import { getUser } from '@/lib/supabase/server'
import { listRetailers, listSources, searchConfigured } from '@/lib/shopping/catalog-service'
import { URL_POLICIES, label } from '@/lib/shopping/catalog/taxonomy'
import { addRetailerAction, createSourceAction, deleteRetailerAction, deleteSourceAction, syncSourceAction } from '../product-actions'

type Row = Record<string, any>

/** Fuentes comerciales: tiendas con su política de acceso, feeds autorizados y buscador. */
export default async function SourcesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams
  const user = (await getUser())!
  const [retailers, sources] = await Promise.all([listRetailers(user.supabase), listSources(user.supabase)])
  const provider = searchConfigured()
  return (
    <main className="wide shop">
      <p className="eyebrow"><Link href="/compras">Compras</Link> · Fuentes · <Link href="/compras/buscar">Buscar</Link></p>
      <h1 className="display">Tiendas y fuentes</h1>
      <p className="m">No rastreo tiendas. Solo uso fuentes autorizadas (feeds o APIs que te cede una marca o un programa de afiliación), un buscador que enlaza páginas, la lectura de una página a petición tuya cuando la tienda lo permite, y tus datos.</p>
      {sp.error && <p className="note warn" role="alert">{sp.error}</p>}
      {(sp.retailer || sp.source || sp.synced || sp.removed) && <p className="note" role="status">{sp.synced || sp.source ? 'Fuente guardada y sincronizada.' : sp.removed ? 'Eliminado.' : 'Tienda añadida.'}</p>}

      <section className="osec"><h2>Buscador de productos</h2>
        <p>{provider ? 'Configurado: las búsquedas incluyen enlaces a páginas de producto de tus tiendas.' : 'Sin configurar. Se activa con las variables SHOPPING_SEARCH_PROVIDER=brave y SHOPPING_SEARCH_KEY en el servidor. Mientras tanto se busca solo en tus feeds.'}</p>
      </section>

      <section className="osec"><h2>Feeds autorizados <span className="m small">· {sources.length}</span></h2>
        {sources.map((s: Row) => (
          <div key={s.id} className="pattern">
            <b>{s.name}</b> <span className="m small">· {s.retailers?.name ?? 'varias tiendas'} · {s.item_count} productos{s.last_sync_at ? ` · sincronizado el ${new Date(s.last_sync_at).toLocaleString('es-ES')}` : ''}</span>
            <p className="m small">Autorización: {s.authorization_note}</p>
            {s.status === 'error' && <p className="note warn">{s.last_error}</p>}
            <form action={syncSourceAction} className="btns"><input type="hidden" name="id" value={s.id} />
              {!s.feed_url && <label>Archivo<input type="file" name="file" accept=".csv,.tsv,.json,.xml,text/*,application/json,application/xml" /></label>}
              <button className="btn small">Sincronizar</button></form>
            <form action={deleteSourceAction}><input type="hidden" name="id" value={s.id} /><button className="btn small">Eliminar fuente</button></form>
          </div>))}
        <details className="howto"><summary>Añadir un feed</summary>
          <form action={createSourceAction} encType="multipart/form-data">
            <label>Nombre<input name="name" required maxLength={80} placeholder="Catálogo COS (afiliación)" /></label>
            <label>Quién te autoriza<input name="authorization_note" required maxLength={300} placeholder="Programa de afiliación de…" /></label>
            <label>Tienda (opcional)<select name="retailer_id" defaultValue=""><option value="">Varias / deducir del enlace</option>{retailers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
            <label>URL del feed<input name="feed_url" type="url" maxLength={1000} placeholder="https://…" /></label>
            <label>O súbelo (CSV, JSON o XML, máx. 4 MB)<input type="file" name="file" accept=".csv,.tsv,.json,.xml,text/*,application/json,application/xml" /></label>
            <label>Formato<select name="format" defaultValue=""><option value="">Detectar</option><option value="csv">CSV</option><option value="json">JSON</option><option value="xml">XML</option></select></label>
            <div className="btns"><button className="btn primary">Guardar y sincronizar</button></div>
          </form>
        </details>
      </section>

      <section className="osec"><h2>Tiendas <span className="m small">· {retailers.length}</span></h2>
        <div className="combos">{retailers.map((r) => (
          <div key={r.id} className="pattern">
            <span className="st">{r.user_id ? 'Añadida por ti' : r.group_name} · {label(URL_POLICIES, r.url_policy)}</span>
            <h3 style={{ margin: '4px 0' }}>{r.name}</h3>
            <p className="m small">{r.domains.join(', ')}</p>
            {r.policy_note && <p className="small">{r.policy_note}</p>}
            {r.user_id && <form action={deleteRetailerAction}><input type="hidden" name="id" value={r.id} /><button className="btn small">Quitar</button></form>}
          </div>))}</div>
        <details className="howto"><summary>Añadir una tienda</summary>
          <form action={addRetailerAction}>
            <label>Nombre<input name="name" required maxLength={80} /></label>
            <label>Dominios (separados por comas)<input name="domains" required maxLength={300} placeholder="tienda.com" /></label>
            <label>Lectura de páginas<select name="url_policy" defaultValue="manual_only">{URL_POLICIES.map((x) => <option key={x.id} value={x.id}>{x.label} — {x.help}</option>)}</select></label>
            <p className="m small">Elige «solo metadatos» únicamente si has comprobado que sus condiciones lo permiten.</p>
            <label>Nota (opcional)<input name="policy_note" maxLength={400} /></label>
            <div className="btns"><button className="btn primary">Añadir tienda</button></div>
          </form>
        </details>
      </section>
    </main>
  )
}
