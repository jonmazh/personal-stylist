import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { getOutfit } from '@/lib/outfits/service'
import { occasionLabel, roleLabel } from '@/lib/outfits/taxonomy'
import { SEASONS } from '@/lib/wardrobe/taxonomy'
import { WardrobeError } from '@/lib/wardrobe/service'
import { Collage } from '@/components/outfits/collage'
import { deleteOutfitAction, setOutfitStatusAction, toggleOutfitFavoriteAction } from '../actions'

const fmt = (iso: string) => new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const STATE: Record<string, string> = { archived: 'Archivada en tu armario', draft: 'Borrador del armario', missing: 'Ya no está en tu armario' }

/** Ficha de un conjunto: prendas reales con su función, datos, avisos y estado. */
export default async function OutfitPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params
  const sp = await searchParams
  const user = (await getUser())!
  let o: Awaited<ReturnType<typeof getOutfit>>
  try { o = await getOutfit(user.supabase, id) } catch (e) { if (e instanceof WardrobeError && e.status === 404) notFound(); throw e }
  const seasons = (o.seasons ?? []).map((s: string) => SEASONS.find((x) => x.id === s)?.label ?? s)
  return (
    <main className="wide">
      <p className="eyebrow"><Link href="/outfits">Outfit Studio</Link>{o.occasion ? ` · ${occasionLabel(o.occasion)}` : ''}</p>
      <h1 className="display">{o.name}</h1>
      <p className={`state ${o.status === 'saved' ? 'ok' : 'warn'}`}>{o.status === 'draft' ? 'Borrador' : o.status === 'archived' ? 'Archivado' : 'Guardado'}{o.is_favorite ? ' · ★ favorito' : ''} · creado a mano</p>
      {sp.saved && <p className="note" role="status">Conjunto guardado.</p>}
      {sp.status && <p className="note" role="status">{sp.status === 'archived' ? 'Archivado: no aparece entre tus conjuntos activos. Puedes recuperarlo cuando quieras.' : 'Estado actualizado.'}</p>}
      {sp.warn && <p className="note warn" role="status">{sp.warn}</p>}
      {sp.error && <p className="note warn" role="alert">{sp.error}</p>}

      <Collage items={o.items} max={6} big />
      <p className="m small">{[o.formality_level ? `Formalidad ${o.formality_level}/5` : null, seasons.length ? seasons.join(', ') : null, (o.tags ?? []).length ? o.tags.map((t: string) => `#${t}`).join(' ') : null].filter(Boolean).join(' · ') || 'Sin ocasión, formalidad ni temporada indicadas.'}</p>
      {o.description && <p>{o.description}</p>}

      {o.problems.length > 0 && <ul className="oprob">{o.problems.map((p, i) => <li key={i} className={p.level === 'error' ? 'err' : 'warn'}>{p.text}</li>)}</ul>}

      <h3>Composición del conjunto</h3>
      <ol className="oitems view">{o.items.map((it) => (
        <li key={it.id} className={it.state !== 'active' ? 'missing' : ''}>
          <span className="oth">{it.thumb_url ? <img src={it.thumb_url} alt={it.title} /> : <span className="m small">Sin foto</span>}</span>
          <div className="oinfo">
            <span className="st">{roleLabel(it.role)}</span>
            {it.garment ? <Link href={`/armario/${it.garment_id}`}><b>{it.title}</b></Link> : <b>{it.title}</b>}
            <span className="m small">{[it.snapshot?.primary_color, it.snapshot?.cut, it.snapshot?.formality_level ? `formalidad ${it.snapshot.formality_level}/5` : null].filter(Boolean).join(' · ')}</span>
            {it.state !== 'active' && <span className="state warn">{STATE[it.state]}</span>}
            {it.snapshot?.replaced && <span className="m small">Sustituye a: {it.snapshot.replaced}</span>}
          </div>
        </li>
      ))}</ol>
      <p className="m small">Cada prenda guarda los datos que tenía al incluirla en el conjunto, para entenderlo aunque después cambies su ficha. Creado {fmt(o.created_at)} · actualizado {fmt(o.updated_at)}.</p>

      <div className="btns">
        <Link className="btn primary" href={`/outfits/${id}/editar`}>Editar o sustituir prendas</Link>
        {o.status === 'draft' && <form action={setOutfitStatusAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="saved" /><button className="btn">Guardar (dejar de ser borrador)</button></form>}
        {o.status !== 'archived'
          ? <form action={setOutfitStatusAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="archived" /><button className="btn">Archivar</button></form>
          : <form action={setOutfitStatusAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="saved" /><button className="btn">Recuperar</button></form>}
        <form action={toggleOutfitFavoriteAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="value" value={o.is_favorite ? '0' : '1'} /><button className="btn quiet">{o.is_favorite ? 'Quitar de favoritos' : 'Marcar como favorito'}</button></form>
      </div>
      <details className="howto"><summary>Eliminar definitivamente</summary>
        <form action={deleteOutfitAction}>
          <input type="hidden" name="id" value={id} />
          <p className="m small">Se borra el conjunto. Las prendas siguen en tu armario. Si solo ya no lo usas, mejor archívalo.</p>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--ink)' }}><input type="checkbox" name="confirm" /> Entiendo que no se puede deshacer</label>
          <div className="btns"><button className="btn">Eliminar conjunto</button></div>
        </form>
      </details>
      <p className="m small" style={{ marginTop: 28 }}><Link href="/outfits">← Volver a tus conjuntos</Link></p>
    </main>
  )
}
