import Link from 'next/link'
import { getUser } from '@/lib/supabase/server'
import { loadBundle } from '@/lib/profile/data'
import { STYLE_CATALOG, STYLE_GROUPS, styleName } from '@/lib/style/catalog'
import { outfitSvg, outfitsOf } from '@/lib/style/references'
import { styleProfileOf } from '@/lib/style/dna'

/** Catalogo ampliado de estilos (BIS 1): explorar por grupos, con referencias visuales. */
export default async function StylesPage() {
  const user = (await getUser())!
  const b = await loadBundle(user.supabase, user.id)
  const p = styleProfileOf(b)
  const rated = new Set(b.refRatings.map((r) => r.reference_id))
  const weightOf = (id: string) => p.identity.influences.find((i) => i.style === id)

  return (
    <main className="wide">
      <p className="eyebrow">Identidad estética · Capítulo 04</p>
      <h1 className="display">Catálogo de estilos</h1>
      <p className="lead">{STYLE_CATALOG.length} estilos para explorar y combinar. No tienes que elegir uno: tu identidad puede ser una mezcla, y cada conjunto que valoras me ayuda a entenderla.</p>
      <div className="note">
        {p.identity.source === 'ninguna'
          ? <>Aún no tienes identidad estética. Entra en los estilos que te llamen y valora sus conjuntos, o <Link href="/estilos/identidad">constrúyela directamente</Link>.</>
          : <>Tu identidad{p.identity.source === 'propuesta' ? ' (propuesta a partir de tus valoraciones)' : ''}: <b>{p.identity.influences.map((i) => `${styleName(i.style)} ${i.weight} %`).join(' · ')}</b>. <Link href="/estilos/identidad">Editar mi identidad</Link></>}
      </div>
      {STYLE_GROUPS.map((g) => (
        <section key={g.id}>
          <p className="eyebrow part">{g.name}</p>
          <div className="stylegrid">
            {STYLE_CATALOG.filter((s) => s.group === g.id).map((s) => {
              const os = outfitsOf(s.id), w = weightOf(s.id), n = os.filter((o) => rated.has(o.id)).length
              return (
                <Link key={s.id} href={`/estilos/${s.id}`} className="stylecard">
                  <span className="refart" dangerouslySetInnerHTML={{ __html: outfitSvg(os[0]) }} />
                  <span><b>{s.name}</b><p>{s.description}</p>
                    <p className={w ? (p.identity.source === 'declarada' ? 'ok' : 'warn') : ''}>{w ? `${p.identity.source === 'declarada' ? 'En tu identidad' : 'En tu propuesta'} · ${w.weight} %` : n ? `${n} de ${os.length} conjuntos valorados` : `${os.length} conjuntos`}</p></span>
                </Link>
              )
            })}
          </div>
        </section>
      ))}
      <div className="btns"><Link className="btn primary" href="/estilos/identidad">Construir mi identidad</Link><Link className="btn quiet" href="/profile/estilo">Volver al capítulo 04</Link></div>
    </main>
  )
}
