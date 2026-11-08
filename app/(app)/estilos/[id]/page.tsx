import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { loadBundle } from '@/lib/profile/data'
import { STYLE_CATALOG, STYLE_GROUPS, elementLabel, styleById } from '@/lib/style/catalog'
import { outfitsOf } from '@/lib/style/references'
import { styleProfileOf } from '@/lib/style/dna'
import { raterInitial, raterItems, raterRatings } from '@/lib/style/view'
import { GARMENT_HEX } from '@/lib/style/references'
import { ReferenceRater } from '@/components/reference-rater'
import { addInfluence } from '../../profile/actions'

/** Ficha de un estilo: descripcion, rasgos, siluetas, prendas, calzado, paleta, relacionados y galeria valorable. */
export default async function StylePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ added?: string; already?: string }> }) {
  const { id } = await params
  const flags = await searchParams
  const s = styleById(id)
  if (!s) notFound()
  const user = (await getUser())!
  const b = await loadBundle(user.supabase, user.id)
  const p = styleProfileOf(b)
  const declared = p.declared.influences.find((i) => i.style === s.id)
  const proposed = !declared && p.identity.source === 'propuesta' ? p.identity.influences.find((i) => i.style === s.id) : undefined
  const os = outfitsOf(s.id)
  const i = STYLE_CATALOG.indexOf(s), prev = STYLE_CATALOG[i - 1], next = STYLE_CATALOG[i + 1]
  const ROLE: Record<string, string> = { principal: 'estilo principal', secundario: 'estilo secundario', influencia: 'influencia' }

  return (
    <main className="wide">
      <p className="eyebrow">{STYLE_GROUPS.find((g) => g.id === s.group)!.name}</p>
      <h1 className="display">{s.name}</h1>
      <p className="lead">{s.description}</p>
      {flags.added && <p className="note" role="status">Añadido a tu identidad. Ajusta su peso en <Link href="/estilos/identidad">Mi identidad</Link>.</p>}
      {flags.already && <p className="note" role="status">Ya forma parte de tu identidad.</p>}

      {declared ? (
        <p className="state ok">En tu identidad como {ROLE[declared.role]} · {declared.weight} % · <Link href="/estilos/identidad">editar</Link></p>
      ) : (<>
        {proposed && <p className="state warn">En la propuesta de tus valoraciones como {ROLE[proposed.role]} · {proposed.weight} % (sin confirmar)</p>}
        <form action={addInfluence} className="btns">
          <input type="hidden" name="style" value={s.id} />
          <select name="role" defaultValue={proposed?.role ?? 'influencia'} aria-label="Papel en tu identidad" className="inline-select">
            <option value="principal">Como estilo principal</option><option value="secundario">Como estilo secundario</option><option value="influencia">Como influencia</option>
          </select>
          <button className="btn primary">Añadir a mi identidad</button>
        </form>
      </>)}

      <div className="facts">
        <div><h3>Características</h3><ul>{s.traits.map((t) => <li key={t}>{t}</li>)}</ul></div>
        <div><h3>Siluetas habituales</h3><ul>{s.silhouettes.map((t) => <li key={t}>{t}</li>)}</ul></div>
        <div><h3>Prendas características</h3><ul>{s.garments.map((t) => <li key={t}>{t}</li>)}</ul></div>
        <div><h3>Calzado y complementos</h3><ul>{s.footwear.map((t) => <li key={t}>{t}</li>)}</ul></div>
      </div>
      <h3>Paleta frecuente</h3>
      <div className="swatches">{s.palette.map((c) => <span key={c} className="swatch"><i style={{ background: GARMENT_HEX[c] }} />{c}</span>)}</div>
      <h3>Elementos visuales</h3>
      <div className="chips">{s.elements.map((e) => <span key={e} className="chip">{elementLabel(e)}</span>)}</div>
      <h3>Estilos relacionados</h3>
      <div className="chips">{s.related.map((r) => <Link key={r} href={`/estilos/${r}`} className="chip">{styleById(r)?.name}</Link>)}</div>

      <h2>Galería</h2>
      <p className="m">Valora cada conjunto. «Me gusta, pero no me lo pondría» distingue admirar una estética de querer vestirla; con «Me gusta algún elemento» puedes quedarte solo con lo que te interesa.</p>
      <ReferenceRater items={raterItems(os)} ratings={raterRatings()} initial={raterInitial(b.refRatings.filter((r) => os.some((o) => o.id === r.reference_id)))} revealStyle={false} />

      <nav className="pager" aria-label="Estilos">
        {prev ? <Link href={`/estilos/${prev.id}`}>← Anterior<b>{prev.name}</b></Link> : <Link href="/estilos">← Volver<b>Catálogo</b></Link>}
        {next ? <Link href={`/estilos/${next.id}`} style={{ textAlign: 'right' }}>Siguiente →<b>{next.name}</b></Link> : <Link href="/estilos/identidad" style={{ textAlign: 'right' }}>Siguiente →<b>Mi identidad</b></Link>}
      </nav>
    </main>
  )
}
