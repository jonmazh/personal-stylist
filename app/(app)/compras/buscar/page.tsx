import Link from 'next/link'
import { getUser } from '@/lib/supabase/server'
import { getSearch, searchConfigured } from '@/lib/shopping/catalog-service'
import { listNeeds } from '@/lib/shopping/service'
import { AVAILABILITY, SOURCE_KINDS, label } from '@/lib/shopping/catalog/taxonomy'
import { label as tlabel } from '@/lib/shopping/taxonomy'
import { PendingButton } from '@/components/outfits/pending-button'
import { saveResultAction, searchAction } from '../product-actions'

type Row = Record<string, any>
const fmt = (p: number | null, c = 'EUR') => (p == null ? 'Precio sin comprobar' : `${p.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c === 'EUR' ? '€' : c}`)

/** Product Discovery: buscar productos reales en fuentes autorizadas para una necesidad o una descripción. */
export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams
  const user = (await getUser())!
  const [needs, search] = await Promise.all([listNeeds(user.supabase).catch(() => []), sp.s ? getSearch(user.supabase, sp.s).catch(() => null) : Promise.resolve(null)])
  const provider = searchConfigured()
  const need = search?.need_id ? needs.find((n: Row) => n.id === search.need_id) : null
  return (
    <main className="wide shop">
      <p className="eyebrow"><Link href="/compras">Compras</Link> · Buscar productos · <Link href="/compras/productos">Candidatos</Link> · <Link href="/compras/fuentes">Fuentes</Link></p>
      <h1 className="display">Buscar productos</h1>
      <p className="m">Busco en tus fuentes autorizadas (feeds) y, si está configurado, en un buscador de productos que solo enlaza a las páginas de las tiendas. Ordeno por cuánto se parece a lo que buscas, no por precio ni popularidad. Esto todavía no es una recomendación de compra.</p>
      {sp.error && <p className="note warn" role="alert">{sp.error}</p>}
      {!provider && <p className="note">No hay buscador de productos configurado: solo se busca en tus feeds. También puedes <Link href="/compras/importar">importar un producto por URL o a mano</Link>.</p>}

      <form action={searchAction} className="osec">
        <label>Para la necesidad<select name="need_id" defaultValue={search?.need_id ?? sp.need ?? ''}><option value="">— Búsqueda libre —</option>{needs.map((n: Row) => <option key={n.id} value={n.id}>{n.title}</option>)}</select></label>
        <label>O describe qué buscas<input name="text" maxLength={200} placeholder="Pantalón gris recto hasta 80 €" defaultValue={!search?.need_id ? search?.query_text ?? '' : ''} /></label>
        <div className="btns"><PendingButton label="Buscar" pending="Buscando en las fuentes autorizadas…" />{search && <button className="btn small" name="force" value="1">Buscar de nuevo (sin caché)</button>}</div>
      </form>

      {search && (<section className="osec">
        <h2>{need ? `Para «${need.title}»` : `«${search.query_text}»`} <span className="m small">· {search.result_count} resultado{search.result_count === 1 ? '' : 's'} · {new Date(search.created_at).toLocaleString('es-ES')}</span></h2>
        <div className="srcs">{(search.sources as Row[]).map((s, i) => <span key={i} className={s.status === 'ok' ? '' : 'm'}>{s.label}: {s.status === 'ok' ? `${s.count} resultado${s.count === 1 ? '' : 's'}` : s.status === 'empty' ? 'sin resultados' : s.message}</span>)}</div>
        {!(search.results as Row[]).length && <p className="verdict">No he encontrado productos que encajen en tus fuentes. Puedes <Link href={`/compras/importar${search.need_id ? `?need=${search.need_id}` : ''}`}>importar uno que hayas visto</Link>.</p>}
        <div className="combos">{(search.results as Row[]).map((h, i) => (
          <div key={i} className="hit">
            <span className="st">{h.retailer?.name ?? h.brand ?? 'Tienda'} · {tlabel(SOURCE_KINDS, h.source_kind)}</span>
            <h3>{h.product_name}</h3>
            <span className="small">{fmt(h.current_price, h.currency)}{h.availability_status !== 'unknown' ? ` · ${label(AVAILABILITY, h.availability_status)}` : ''}{h.confirmed_composition ? ` · ${h.confirmed_composition}` : ''}</span>
            <span className="small">Coincidencia {h.match.score}/100{h.match.matches.length ? ` · ${h.match.matches.join(' · ')}` : ''}</span>
            {h.match.unknown.length > 0 && <span className="m small">Sin confirmar: {h.match.unknown.join(', ').toLowerCase()}</span>}
            {h.source_kind === 'search' && <span className="m small">Del buscador: solo nombre y enlace; impórtalo para ver sus datos{h.retailer?.url_policy === 'manual_only' ? ' (en esta tienda, a mano)' : ''}.</span>}
            <div className="btns">
              {h.product_url && <a className="btn small" href={h.product_url} target="_blank" rel="noopener noreferrer nofollow">Ver en la tienda</a>}
              <form action={saveResultAction}><input type="hidden" name="search_id" value={search.id} /><input type="hidden" name="index" value={i} /><button className="btn small primary">Guardar como candidato</button></form>
            </div>
          </div>))}</div>
      </section>)}
    </main>
  )
}
