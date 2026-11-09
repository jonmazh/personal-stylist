import Link from 'next/link'
import { getUser } from '@/lib/supabase/server'
import { listOutfits, outfitTags, type OutfitQuery } from '@/lib/outfits/service'
import { OUTFIT_OCCASIONS, occasionLabel } from '@/lib/outfits/taxonomy'
import { SEASONS } from '@/lib/wardrobe/taxonomy'
import { WardrobeError } from '@/lib/wardrobe/service'
import { Collage } from '@/components/outfits/collage'
import { toggleOutfitFavoriteAction } from './actions'

const STATUS = [['active', 'Activos'], ['saved', 'Guardados'], ['draft', 'Borradores'], ['archived', 'Archivados'], ['all', 'Todos']] as const

/** Outfit Studio · vista principal: tus conjuntos guardados, con filtros. La generación y el chat llegan en 3B y 3C. */
export default async function OutfitsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams
  const user = (await getUser())!
  const q: OutfitQuery = { status: sp.status ?? 'active', occasion: sp.occasion, formality: Number(sp.formality) || undefined, season: sp.season, tag: sp.tag, favorite: sp.favorite === '1', q: sp.q }
  let items: Awaited<ReturnType<typeof listOutfits>> = [], tags: string[] = [], error = ''
  try { [items, tags] = await Promise.all([listOutfits(user.supabase, q), outfitTags(user.supabase)]) } catch (e) { error = e instanceof WardrobeError ? e.message : 'No se pudieron cargar los conjuntos' }
  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][])
    return `/outfits${p.size ? `?${p}` : ''}`
  }
  const filtered = !!(sp.q || sp.occasion || sp.formality || sp.season || sp.tag || sp.favorite)
  return (
    <main className="wide">
      <p className="eyebrow">Outfit Studio</p>
      <h1 className="display">Tus conjuntos</h1>
      <p className="m">Conjuntos construidos con prendas reales de tu armario. Créalos tú o pide propuestas para una ocasión: el motor combina solo tu ropa real y explica cada puntuación.</p>
      {sp.deleted && <p className="note" role="status">Conjunto eliminado. Las prendas siguen en tu armario.</p>}
      {error && <p className="note warn" role="alert">{error}</p>}
      <div className="btns"><Link className="btn primary" href="/outfits/generar">Generar propuestas</Link><Link className="btn" href="/outfits/nuevo">Crear conjunto</Link><Link className="btn quiet" href="/stylist">Hablar con mi estilista</Link></div>
      <div className="ozones">
        <div><span className="st">Pedírselo al estilista en tus palabras</span><span className="m small">Pendiente · fase 3C</span></div>
        <div><span className="st">Fórmulas de estilo</span><span className="m small">Pendiente · fase 3D</span></div>
      </div>

      <form className="filters ofilters" method="get" action="/outfits">
        <label>Buscar<input name="q" defaultValue={sp.q ?? ''} placeholder="Nombre, prenda, etiqueta…" /></label>
        <label>Estado<select name="status" defaultValue={q.status}>{STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label>Ocasión<select name="occasion" defaultValue={sp.occasion ?? ''}><option value="">Todas</option>{OUTFIT_OCCASIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
        <label>Formalidad<select name="formality" defaultValue={sp.formality ?? ''}><option value="">Todas</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}/5</option>)}</select></label>
        <label>Temporada<select name="season" defaultValue={sp.season ?? ''}><option value="">Todas</option>{SEASONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
        {tags.length > 0 && <label>Etiqueta<select name="tag" defaultValue={sp.tag ?? ''}><option value="">Todas</option>{tags.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>}
        <label className="inline"><input type="checkbox" name="favorite" value="1" defaultChecked={q.favorite} /> Favoritos</label>
        <button className="btn">Aplicar</button>
        {filtered && <Link className="btn quiet" href="/outfits">Quitar filtros</Link>}
      </form>

      {items.length === 0 ? (
        <p className="m" style={{ margin: '28px 0' }}>{filtered || q.status !== 'active' ? 'No hay conjuntos con estos filtros.' : 'Aún no tienes conjuntos. Crea el primero con tus prendas favoritas.'}</p>
      ) : (
        <div className="ogrid">{items.map((o) => (
          <article key={o.id} className="ocard">
            <Link href={`/outfits/${o.id}`} aria-label={o.name}><Collage items={o.items} /></Link>
            <div className="wbody">
              <Link href={`/outfits/${o.id}`}><b>{o.name}</b></Link>
              <span className="m small">{[o.occasion ? occasionLabel(o.occasion) : null, o.formality_level ? `formalidad ${o.formality_level}/5` : null, `${o.items.length} prenda${o.items.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}</span>
              {o.compatibility_score != null && <span className="m small">Compatibilidad {Math.round(Number(o.compatibility_score))}/100 · confianza {o.confidence_level}</span>}
              <span className={`state ${o.status === 'saved' && !o.problems.length ? 'm' : 'warn'}`}>{o.status === 'draft' ? 'Borrador' : o.status === 'archived' ? 'Archivado' : 'Guardado'}{o.problems.length ? ` · ${o.problems.length} aviso${o.problems.length === 1 ? '' : 's'}` : ''}</span>
              {(o.tags ?? []).length > 0 && <span className="m small">{o.tags.map((t: string) => `#${t}`).join(' ')}</span>}
            </div>
            <form action={toggleOutfitFavoriteAction} className="fav">
              <input type="hidden" name="id" value={o.id} /><input type="hidden" name="value" value={o.is_favorite ? '0' : '1'} /><input type="hidden" name="back" value={href({})} />
              <button aria-label={o.is_favorite ? 'Quitar de favoritos' : 'Marcar como favorito'} aria-pressed={o.is_favorite}>{o.is_favorite ? '★' : '☆'}</button>
            </form>
          </article>
        ))}</div>
      )}
      <p className="m small">{items.length} {items.length === 1 ? 'conjunto' : 'conjuntos'} en esta vista.</p>
    </main>
  )
}
