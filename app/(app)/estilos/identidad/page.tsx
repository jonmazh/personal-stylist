import Link from 'next/link'
import { getUser } from '@/lib/supabase/server'
import { loadBundle } from '@/lib/profile/data'
import { BRAND_UNIVERSES, ELEMENTS, ELEMENT_GROUPS, STYLE_CATALOG, STYLE_GROUPS, styleName } from '@/lib/style/catalog'
import { styleProfileOf } from '@/lib/style/dna'
import { IdentityEditor } from '@/components/identity-editor'
import { adoptProposal, saveIdentity } from '../../profile/actions'

const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '')

/** Identidad estetica hibrida: lo que declaras (editable) y, aparte, lo que infieren tus valoraciones. */
export default async function IdentityPage({ searchParams }: { searchParams: Promise<{ saved?: string; warn?: string; error?: string; adopted?: string }> }) {
  const flags = await searchParams
  const user = (await getUser())!
  const b = await loadBundle(user.supabase, user.id)
  const p = styleProfileOf(b)
  const d = p.declared, inf = p.inferred

  return (
    <main className="wide">
      <p className="eyebrow">Identidad estética · Capítulo 04</p>
      <h1 className="display">Mi identidad</h1>
      <p className="lead">No tienes que elegir un único estilo. Combina un estilo principal, otros secundarios e influencias, y dime qué elementos quieres y cuáles no.</p>
      {flags.saved && <p className="note" role="status">Guardado: versión {d.version} de tu identidad.</p>}
      {flags.adopted && <p className="note" role="status">He copiado la propuesta de tus valoraciones. Ajústala a tu gusto y guarda.</p>}
      {flags.warn && <p className="note warn" role="status">{flags.warn}</p>}
      {flags.error && <p className="note warn" role="alert">{flags.error}</p>}

      <section>
        <p className="eyebrow part">Lo que dicen tus valoraciones · inferido</p>
        {inf.enough ? (<>
          <p className="m">A partir de {inf.rated} valoraciones{inf.own ? ` (${inf.own} de tus referencias)` : ''}. Es una lectura de tus elecciones, no algo que hayas declarado.</p>
          <div className="bars">{inf.proposal.map((x) => <div key={x.style} className="bar"><span>{styleName(x.style)}</span><i style={{ width: `${x.weight}%` }} /><span>{x.weight} %</span></div>)}</div>
          {inf.patterns.length > 0 && <ul>{inf.patterns.slice(0, 8).map((x) => <li key={x.element}>{x.kind === 'prefiere' ? 'Prefieres' : 'Evitas'}: {x.label.toLowerCase()} <span className="m small">({x.evidence} conjuntos)</span></li>)}</ul>}
          {inf.admiredStyles.length > 0 && <p className="m small">Admiras sin querer llevarlo: {inf.admiredStyles.map(styleName).join(', ')}.</p>}
          {inf.rejectedStyles.length > 0 && <p className="m small">Descartas: {inf.rejectedStyles.map(styleName).join(', ')}.</p>}
          <form action={adoptProposal} className="btns"><button className="btn">{d.influences.length ? 'Sustituir mi identidad por esta propuesta' : 'Usar esta propuesta como punto de partida'}</button></form>
        </>) : (
          <p className="m">Valora al menos 4 conjuntos del <Link href="/estilos">catálogo</Link> y te propondré una identidad. Llevas {inf.rated}.</p>
        )}
      </section>

      <form action={saveIdentity}>
        <section>
          <p className="eyebrow part">Tu identidad · declarada por ti</p>
          {d.version > 0 && <p className="m small">Versión {d.version}{d.updatedAt ? ` · ${fmtDate(d.updatedAt)}` : ''}. Cada diagnóstico guarda una instantánea, así ves cómo evoluciona.</p>}
          <IdentityEditor
            styles={STYLE_CATALOG.map((s) => ({ id: s.id, name: s.name, group: s.group }))}
            groups={STYLE_GROUPS.map((g) => ({ id: g.id, name: g.name }))}
            initial={(d.influences.length ? p.identity.influences : []).map((i) => ({ style: i.style, role: i.role, weight: i.weight }))}
          />
          <p className="m small">Los porcentajes describen preferencias, no una clasificación objetiva, y no limitan las recomendaciones: sirven para saber qué pesa más.</p>
        </section>

        <section>
          <p className="eyebrow part">Elementos visuales</p>
          <p className="m">Marca lo que quieres ver en tu armario y lo que rechazas. Lo que declares aquí manda sobre lo que deduzca de tus valoraciones.</p>
          <div className="elpick">
            {ELEMENT_GROUPS.map((g) => (
              <fieldset key={g}><legend>{g}</legend>
                {ELEMENTS.filter((e) => e.group === g).map((e) => {
                  const inferred = p.elements.liked.find((x) => x.element === e.id && x.source === 'inferido') ? 'sueles elegirlo' : p.elements.rejected.find((x) => x.element === e.id && x.source === 'inferido') ? 'sueles evitarlo' : ''
                  return (
                    <div key={e.id} className="elrow"><span>{e.label}{inferred && <span className="m small"> · {inferred}</span>}</span>
                      <label><input type="checkbox" name="liked" value={e.id} defaultChecked={d.liked.includes(e.id)} />Quiero</label>
                      <label><input type="checkbox" name="rejected" value={e.id} defaultChecked={d.rejected.includes(e.id)} />Rechazo</label>
                    </div>
                  )
                })}
              </fieldset>
            ))}
          </div>
        </section>

        <section>
          <p className="eyebrow part">Marcas y universos de referencia</p>
          <p className="m">Si te resulta más fácil pensar en tiendas que en nombres de estilos, marca las que te inspiran. Una marca no es un estilo: tiene varias líneas. Solo uso los rasgos visuales que se le suelen asociar, y nunca por sí solos para deducir un patrón.</p>
          <div className="brands">{BRAND_UNIVERSES.map((br) => (
            <label key={br.id}><input type="checkbox" name="brands" value={br.id} defaultChecked={d.brands.includes(br.id)} />{br.name}<span>{br.description}</span></label>
          ))}</div>
        </section>
        <div className="btns"><button className="btn primary">Guardar mi identidad</button><Link className="btn quiet" href="/estilos">Explorar el catálogo</Link></div>
      </form>
    </main>
  )
}
