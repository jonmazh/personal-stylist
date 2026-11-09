import Link from 'next/link'
import { getUser } from '@/lib/supabase/server'
import { listProducts } from '@/lib/shopping/catalog-service'
import { AVAILABILITY, PRODUCT_STATUSES, SOURCE_KINDS, label } from '@/lib/shopping/catalog/taxonomy'

type Row = Record<string, any>

/** Catálogo de productos candidatos: lo que estás pensando comprar (separado de tu armario). */
export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams
  const user = (await getUser())!
  const products = await listProducts(user.supabase, { need_id: sp.need, status: sp.status })
  const groups = new Map<string, { title: string; items: Row[] }>()
  for (const p of products) { const k = p.shopping_needs?.id ?? '-'; if (!groups.has(k)) groups.set(k, { title: p.shopping_needs?.title ?? 'Sin necesidad asociada', items: [] }); groups.get(k)!.items.push(p) }
  return (
    <main className="wide shop">
      <p className="eyebrow"><Link href="/compras">Compras</Link> · Candidatos · <Link href="/compras/buscar">Buscar</Link> · <Link href="/compras/importar">Importar</Link> · <Link href="/compras/fuentes">Fuentes</Link></p>
      <h1 className="display">Productos candidatos</h1>
      <p className="m">Productos reales que estás considerando. No forman parte de tu armario. Precios y tallas tienen fecha: se vuelven a comprobar antes de decidir.</p>
      {sp.deleted && <p className="note" role="status">Producto eliminado.</p>}
      <p className="chips">
        <Link className="chip" href="/compras/productos" aria-current={!sp.status ? 'page' : undefined}>Activos</Link>
        {([['saved', 'Guardados'], ['discarded', 'Descartados'], ['all', 'Todos']] as const).map(([st, t]) => <Link key={st} className="chip" href={`/compras/productos?status=${st}`} aria-current={sp.status === st ? 'page' : undefined}>{t}</Link>)}
      </p>
      {!products.length && <p className="m">Aún no hay productos. <Link href="/compras/buscar">Busca</Link> para una necesidad o <Link href="/compras/importar">importa uno</Link> que hayas visto.</p>}
      {[...groups.values()].map((g) => (
        <section key={g.title} className="osec"><h2>{g.title} <span className="m small">· {g.items.length}</span></h2>
          <div className="combos">{g.items.map((p) => (
            <Link key={p.id} href={`/compras/productos/${p.id}`} className="need">
              <span className="st">{p.retailers?.name ?? p.brand ?? 'Tienda'} · {label(SOURCE_KINDS, p.source_kind)} · {label(PRODUCT_STATUSES, p.status)}</span>
              <h3>{p.product_name}</h3>
              <p className="small">{p.current_price != null ? `${Number(p.current_price).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €` : 'Precio sin comprobar'} · {label(AVAILABILITY, p.availability_status)}{p.confirmed_composition ? ` · ${p.confirmed_composition}` : ' · composición desconocida'}</p>
              <p className={`small ${p.stale ? 'lvl-high' : 'm'}`}>{p.last_verified_at ? `Comprobado el ${new Date(p.last_verified_at).toLocaleDateString('es-ES')}` : 'Sin verificar'}{p.stale ? ' · verifica antes de decidir' : ''}</p>
            </Link>))}</div>
        </section>))}
    </main>
  )
}
