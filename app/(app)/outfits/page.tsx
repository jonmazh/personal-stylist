import Link from 'next/link'
import { getUser } from '@/lib/supabase/server'
import { listOutfits, outfitTags, type OutfitQuery } from '@/lib/outfits/service'
import { OUTFIT_OCCASIONS, occasionLabel } from '@/lib/outfits/taxonomy'
import { SEASONS } from '@/lib/wardrobe/taxonomy'
import { WardrobeError } from '@/lib/wardrobe/service'
import { Collage } from '@/components/outfits/collage'
import { startStylistAction, toggleOutfitFavoriteAction } from './actions'
import { listSessions } from '@/lib/outfits/stylist/service'
import { learningView } from '@/lib/outfits/feedback-service'
import { PendingButton } from '@/components/outfits/pending-button'
import { configError } from '@/lib/ai/client'

const STATUS = [['active', 'Activos'], ['saved', 'Guardados'], ['draft', 'Borradores'], ['archived', 'Archivados'], ['all', 'Todos']] as const

/** Outfit Studio · vista principal: tus conjuntos guardados, con filtros. La generación y el chat llegan en 3B y 3C. */
export default async function OutfitsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams
  const user = (await getUser())!
  const q: OutfitQuery = { status: sp.status ?? 'active', occasion: sp.occasion, formality: Number(sp.formality) || undefined, season: sp.season, tag: sp.tag, favorite: sp.favorite === '1', q: sp.q }
  let items: Awaited<ReturnType<typeof listOutfits>> = [], tags: string[] = [], error = ''
  const sessions = await listSessions(user.supabase, 5).catch(() => [])
  const lv = await learningView(user.supabase).catch(() => null)
  const metrics = lv?.metrics
  const wornBy = new Map<string, number>(); for (const w of lv?.wears ?? []) wornBy.set(w.outfit_id, (wornBy.get(w.outfit_id) ?? 0) + 1)
  const aiMissing = configError()
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
      {sp.error && <p className="note warn" role="alert">{sp.error}</p>}
      <form action={startStylistAction} className="askbox">
        <label><span className="st">¿Qué necesitas hoy? Describe la ocasión</span>
          <textarea name="message" rows={3} maxLength={1200} required placeholder="Tengo una cena el viernes y quiero ir elegante, pero sin traje. Hará frío." /></label>
        <p className="m small">Usar mi armario completo · activado. Solo te propondré prendas que tienes registradas.{aiMissing ? ' Sin IA configurada interpretaré lo esencial por palabras clave.' : ''}</p>
        <div className="btns"><PendingButton label="Generar propuestas" pending="El estilista está preparando tus propuestas…" /><Link className="btn quiet" href="/outfits/generar">Con filtros detallados</Link></div>
      </form>
      {sessions.length > 0 && <p className="m small">Conversaciones recientes: {sessions.map((x: Record<string, any>, i: number) => <span key={x.id}>{i ? ' · ' : ''}<Link href={`/outfits/estilista/${x.id}`}>{x.title}</Link></span>)}</p>}
      <div className="btns"><Link className="btn" href="/outfits/nuevo">Crear conjunto a mano</Link><Link className="btn quiet" href="/outfits/evaluar">Evaluar un conjunto</Link></div>
      <div className="ozones">
        <Link href="/outfits/formulas"><span className="st">Mis fórmulas de estilo</span><span className="m small">Estructuras que funcionan y puedes repetir</span></Link>
        <Link href="/outfits/aprendizaje"><span className="st">Lo que he aprendido de ti</span><span className="m small">{metrics ? `${metrics.liked}/${metrics.rated} te gustan · ${metrics.wornOutfits} puestos · ${metrics.repeat} repetirías` : 'Valora conjuntos para que aprenda'}</span></Link>
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
              {wornBy.get(o.id) ? <span className="m small">Puesto {wornBy.get(o.id)} {wornBy.get(o.id) === 1 ? 'vez' : 'veces'}</span> : null}
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
