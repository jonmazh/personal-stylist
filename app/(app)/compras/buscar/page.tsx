import Link from 'next/link'
import { getUser } from '@/lib/supabase/server'
import { channel3Configured, getSearchForDisplay, searchConfigured } from '@/lib/shopping/catalog-service'
import { listNeeds } from '@/lib/shopping/service'
import { AVAILABILITY, SOURCE_KINDS, label } from '@/lib/shopping/catalog/taxonomy'
import { label as tlabel } from '@/lib/shopping/taxonomy'
import { PendingButton } from '@/components/outfits/pending-button'
import { searchAction } from '../product-actions'
import { HitCard } from '@/components/shopping/hit-card'
import { groupHits } from '@/lib/shopping/intelligence/rank'

type Row = Record<string, any>
const fmt = (p: number | null, c = 'EUR') => (p == null ? 'Precio sin comprobar' : `${p.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c === 'EUR' ? '€' : c}`)

/** Product Discovery: buscar productos reales en fuentes autorizadas para una necesidad o una descripción. */
export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams
  const user = (await getUser())!
  const [needs, search] = await Promise.all([listNeeds(user.supabase).catch(() => []), sp.s ? getSearchForDisplay(user.supabase, user.id, sp.s).catch(() => null) : Promise.resolve(null)])
  const provider = searchConfigured() || channel3Configured()
  const need = search?.need_id ? needs.find((n: Row) => n.id === search.need_id) : null
  return (
    <main className="wide shop">
      <p className="eyebrow"><Link href="/compras">Compras</Link> · Buscar productos · <Link href="/compras/productos">Candidatos</Link> · <Link href="/compras/fuentes">Fuentes</Link></p>
      <h1 className="display">Buscar productos</h1>
      <p className="m">Busco en tus fuentes autorizadas (feeds), en las tiendas con catálogo oficial (UCP) y, si están configurados, en Channel3 (catálogo multimarca) y en un buscador que solo enlaza a las páginas de las tiendas. Las fuentes solo encuentran productos: lo que te favorece lo decide la evaluación. Parto de tu perfil: busco el tipo de prenda (no solo las palabras que escribes) y también en los colores que te favorecen y te faltan; después evalúo cada producto con tu colorimetría, tu ajuste, tu estilo y tu armario. Nunca ordeno por precio ni por popularidad.</p>
      {sp.error && <p className="note warn" role="alert">{sp.error}</p>}
      {!provider && <p className="note">No hay buscador de productos ni Channel3 configurados: solo se busca en tus feeds y en las tiendas con catálogo oficial. También puedes <Link href="/compras/importar">importar un producto por URL o a mano</Link>.</p>}

      <form action={searchAction} className="osec">
        <label>Para la necesidad<select name="need_id" defaultValue={search?.need_id ?? sp.need ?? ''}><option value="">— Búsqueda libre —</option>{needs.map((n: Row) => <option key={n.id} value={n.id}>{n.title}</option>)}</select></label>
        <label>O describe qué buscas<input name="text" maxLength={200} placeholder="Pantalón gris recto hasta 80 €" defaultValue={!search?.need_id ? search?.query_text ?? '' : ''} /></label>
        <div className="btns"><PendingButton label="Buscar" pending="Buscando en las fuentes autorizadas…" />{search && <button className="btn small" name="force" value="1">Buscar de nuevo (sin caché)</button>}</div>
      </form>

      {search && (() => {
        const results = search.results as Row[]
        const g = groupHits(results)
        const q = search.query as Row
        const card = (i: number, compact = false) => <HitCard key={i} h={results[i]} index={i} searchId={search.id} compact={compact} />
        return (<section className="osec">
          <h2>{need ? `Para «${need.title}»` : `«${search.query_text}»`} <span className="m small">· {search.result_count} candidato{search.result_count === 1 ? '' : 's'} evaluado{search.result_count === 1 ? '' : 's'} con tu perfil · {new Date(search.created_at).toLocaleString('es-ES')}</span></h2>
          <div className="srcs">{(search.sources as Row[]).map((s, i) => <span key={i} className={s.status === 'ok' ? '' : 'm'}>{s.label}: {s.status === 'ok' ? `${s.count} resultado${s.count === 1 ? '' : 's'}` : s.status === 'empty' ? 'sin resultados' : s.message}</span>)}</div>
          {q?.plan && <p className="m small">Búsquedas: {(q.plan as string[]).map((t) => `«${t}»`).join(', ')}. {(q.notes as string[] ?? []).join(' ')}</p>}
          {q?.known && (!q.known.color || !q.known.fit || !q.known.style || q.known.color_confidence === 'baja') && <p className="note">{[!q.known.color ? 'No conozco tu colorimetría: no afirmo que un color te favorezca' : q.known.color_confidence === 'baja' ? 'Tu colorimetría es una estimación sin validar: tómala como orientación' : null, !q.known.fit ? 'no conozco tus preferencias de ajuste' : null, !q.known.style ? 'no conozco tu identidad estética' : null].filter(Boolean).join('; ')}. Esos criterios quedan neutros (no cuentan en contra). <Link href="/profile">Completar el perfil</Link></p>}
          {!results.length && <p className="verdict">No he encontrado productos de este tipo en tus fuentes. Puedes <Link href={`/compras/importar${search.need_id ? `?need=${search.need_id}` : ''}`}>importar uno que hayas visto</Link>.</p>}
          {results.length > 0 && !g.recommended.length && <p className="verdict"><b>Ninguno me convence.</b> Ninguno de los candidatos encaja lo suficiente contigo y con tu armario; esperar también es una opción.</p>}
          {g.recommended.length > 0 && <><h3>Recomendados para ti</h3><p className="m small">Mayor compatibilidad personal (color, corte, estética, armario, necesidad y calidad).</p><div className="combos">{g.recommended.map((i) => card(i))}</div></>}
          {g.best_wardrobe != null && !g.recommended.slice(0, 1).includes(g.best_wardrobe) && <><h3>Mejor aportación a tu armario</h3><div className="combos">{card(g.best_wardrobe)}</div></>}
          {g.best_need != null && !g.recommended.slice(0, 1).includes(g.best_need) && g.best_need !== g.best_wardrobe && <><h3>Mejor opción para tu necesidad</h3><div className="combos">{card(g.best_need)}</div></>}
          {g.alternatives.length > 0 && <><h3>Alternativas interesantes</h3><div className="combos">{g.alternatives.filter((i) => i !== g.best_wardrobe && i !== g.best_need).map((i) => card(i, true))}</div></>}
          {g.not_recommended.length > 0 && <details className="howto"><summary>No recomendados ({g.not_recommended.length}) y por qué</summary><div className="combos">{g.not_recommended.map((i) => card(i))}</div></details>}
          {g.unevaluated.length > 0 && <details className="howto"><summary>Sin evaluar ({g.unevaluated.length})</summary><div className="combos">{g.unevaluated.map((i) => card(i, true))}</div></details>}
        </section>)
      })()}
    </main>
  )
}
