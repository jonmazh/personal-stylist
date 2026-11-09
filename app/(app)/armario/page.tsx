import Link from 'next/link'
import { getUser } from '@/lib/supabase/server'
import { GROUPS } from '@/lib/wardrobe/taxonomy'
import { listGarments, wardrobeSummary, WardrobeError, type ListQuery } from '@/lib/wardrobe/service'
import { garmentSubtitle, garmentTitle } from '@/lib/wardrobe/display'
import { toggleFavoriteAction } from './actions'

const SORTS = [['recent', 'Más recientes'], ['updated', 'Última modificación'], ['name', 'Nombre'], ['category', 'Categoría'], ['price', 'Precio']] as const
const STATUS_TABS = [['active', 'En el armario'], ['draft', 'Borradores'], ['archived', 'Archivadas'], ['all', 'Todas']] as const

export default async function WardrobePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams
  const user = (await getUser())!
  const query: ListQuery = { q: sp.q, category: sp.category, status: (sp.status as ListQuery['status']) ?? 'active', favorite: sp.favorite === '1', sort: (sp.sort as ListQuery['sort']) ?? 'recent' }
  let items: Awaited<ReturnType<typeof listGarments>> = [], summary: Awaited<ReturnType<typeof wardrobeSummary>> | null = null, error = ''
  try { [items, summary] = await Promise.all([listGarments(user.supabase, query), wardrobeSummary(user.supabase)]) }
  catch (e) { error = e instanceof WardrobeError ? e.message : 'No se pudo cargar el armario' }
  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ q: sp.q, category: sp.category, status: sp.status, favorite: sp.favorite, sort: sp.sort, ...patch }).filter(([, v]) => v) as [string, string][])
    return `/armario${p.size ? `?${p}` : ''}`
  }
  const filtered = !!(sp.q || sp.category || sp.favorite)

  return (
    <main className="wide">
      <p className="eyebrow">Armario digital</p>
      <h1 className="display">Mi armario</h1>
      {sp.deleted && <p className="note" role="status">Prenda eliminada definitivamente.</p>}
      {error && <p className="note warn" role="alert">{error}</p>}

      {summary && (
        <div className="stats">
          <div><b>{summary.active}</b><span>Prendas</span></div>
          <div><b>{summary.incomplete + summary.drafts}</b><span>Por revisar</span></div>
          <div><b>{summary.favorites}</b><span>Favoritas</span></div>
          <div><b>{summary.archived}</b><span>Archivadas</span></div>
        </div>
      )}
      <div className="btns"><Link className="btn primary" href="/armario/nueva">Añadir prenda</Link></div>

      <nav className="chips catnav" aria-label="Categorías">
        <Link href={href({ category: undefined })} className="chip" aria-current={!sp.category ? 'page' : undefined}>Todo</Link>
        {GROUPS.filter((g) => g.primary || (summary?.byCategory[g.id] ?? 0) > 0).map((g) => (
          <Link key={g.id} href={href({ category: g.id })} className="chip" aria-current={sp.category === g.id ? 'page' : undefined}>{g.label}{summary ? ` · ${summary.byCategory[g.id] ?? 0}` : ''}</Link>
        ))}
      </nav>

      <form className="filters" method="get" action="/armario">
        {sp.category && <input type="hidden" name="category" value={sp.category} />}
        <label>Buscar<input name="q" defaultValue={sp.q ?? ''} placeholder="Marca, color, material, notas…" /></label>
        <label>Estado<select name="status" defaultValue={query.status}>{STATUS_TABS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label>Ordenar<select name="sort" defaultValue={query.sort}>{SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="inline"><input type="checkbox" name="favorite" value="1" defaultChecked={query.favorite} /> Solo favoritas</label>
        <button className="btn">Aplicar</button>
        {filtered && <Link className="btn quiet" href={href({ q: undefined, category: undefined, favorite: undefined })}>Quitar filtros</Link>}
      </form>

      {items.length === 0 ? (
        <p className="m" style={{ margin: '28px 0' }}>{filtered || query.status !== 'active' ? 'No hay prendas con estos filtros.' : 'Tu armario está vacío. Empieza por las prendas que más usas.'}</p>
      ) : (
        <div className="wgrid">
          {items.map((g) => (
            <article key={g.id} className="wcard">
              <Link href={`/armario/${g.id}`} className="wimg" aria-label={garmentTitle(g)}>
                {g.thumb_url ? <img src={g.thumb_url} alt="" /> : <span className="m small">Sin foto</span>}
              </Link>
              <div className="wbody">
                <Link href={`/armario/${g.id}`}><b>{garmentTitle(g)}</b></Link>
                <span className="m small">{garmentSubtitle(g)}</span>
                <span className={`state ${g.wardrobe_status === 'draft' || !g.complete ? 'warn' : 'm'}`}>
                  {g.wardrobe_status === 'draft' ? 'Borrador' : g.wardrobe_status === 'archived' ? 'Archivada' : !g.complete ? 'Ficha incompleta' : 'Compatibilidad pendiente'}
                </span>
              </div>
              <form action={toggleFavoriteAction} className="fav">
                <input type="hidden" name="id" value={g.id} /><input type="hidden" name="value" value={g.is_favorite ? '0' : '1'} /><input type="hidden" name="back" value={href({})} />
                <button aria-label={g.is_favorite ? 'Quitar de favoritas' : 'Marcar como favorita'} aria-pressed={g.is_favorite}>{g.is_favorite ? '★' : '☆'}</button>
              </form>
            </article>
          ))}
        </div>
      )}
      <p className="m small">{items.length} {items.length === 1 ? 'prenda' : 'prendas'} en esta vista.</p>
    </main>
  )
}
