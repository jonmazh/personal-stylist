import Link from 'next/link'
import { VERDICTS } from '@/lib/shopping/evaluate'

type Row = Record<string, any>
const vlabel = (id: string) => VERDICTS.find((v) => v.id === id)?.label ?? id

/** Veredicto, puntuación explicada, indicadores independientes y redundancia de una evaluación de compra. */
export function EvaluationView({ e }: { e: Row }) {
  const i = e.indicators
  return (<>
    <p className={`verdict v-${e.verdict}`}><b>{vlabel(e.verdict)} · {e.score}/100</b> <span className="m small">· confianza {e.confidence}{e.indicators?.confidence?.text ? ` (${e.indicators.confidence.text})` : ''}</span><br />{e.verdict_text}</p>
    {e.limitations.length > 0 && <div className="note warn"><b>Ten en cuenta</b><ul className="small">{(e.limitations as string[]).map((x) => <li key={x}>{x}</li>)}</ul></div>}
    <div className="combos">
      <div className="need"><span className="st">Compatibilidad con tu perfil</span><h3>{i.profile.text}</h3></div>
      <div className="need"><span className="st">Combinaciones</span><h3>{i.combinations.count}</h3><p className="m small">{i.combinations.text}</p></div>
      <div className="need"><span className="st">Riesgo de duplicidad</span><h3>{i.duplicity.level === 'alta' ? 'Alto' : i.duplicity.level === 'media' ? 'Medio' : 'Bajo'}</h3><p className="m small">{i.duplicity.text}</p></div>
      <div className="need"><span className="st">Tallas</span><p className="small">{i.sizes.text}</p></div>
      <div className="need"><span className="st">Precio</span><h3>{i.price.text}</h3>{i.price.cpw != null && <p className="m small">~{i.price.cpw.toLocaleString('es-ES')} € por uso (estimado)</p>}</div>
      <div className="need"><span className="st">Confianza</span><h3>{e.confidence}</h3><p className="m small">{i.confidence.text}</p></div>
    </div>
    {e.wva && (<><h3>Qué aporta a tu armario</h3>
      <p className="small"><b>Wardrobe Value Added {e.wva.score}/100.</b> {(e.wva.reasons as string[]).join(' ')}</p>
      {e.combines_with?.length > 0 && <p className="small">Combina con: {(e.combines_with as Row[]).map((g) => <Link key={g.id} href={`/armario/${g.id}`}>{g.title} </Link>)}</p>}
      {e.wva.outfit_samples?.length > 0 && <ul className="small">{(e.wva.outfit_samples as Row[]).map((o, i) => <li key={i}>{(o.titles as string[]).join(' + ')} <span className="m">({o.score}/100)</span></li>)}</ul>}
      <p className="m small">Conjuntos generados y validados por el Outfit Engine con prendas reales de tu armario.</p></>)}
    {e.color && <p className="small"><b>Color:</b> {e.color.personal?.reason} {(e.color.wardrobe?.reasons ?? []).join(' ')}</p>}
    {e.discard_reasons?.length > 0 && <p className="note warn"><b>Por qué no lo compraría:</b> {(e.discard_reasons as string[]).join(' ')}</p>}
    <h3>Puntuación de compra</h3>
    {(e.criteria as Row[]).map((c) => (
      <div key={c.key} className="pcrit"><b>{c.label}{c.confidence ? <span className="m small"> · confianza {c.confidence}</span> : null}</b><div><span className="bar"><i style={{ width: `${Math.round((c.value ?? 0.5) * 100)}%`, opacity: c.known === false ? 0.35 : 1 }} /></span><span className="m small">{c.known === false ? 'Sin datos: queda neutro (no cuenta en contra). ' : ''}{[...c.reasons, ...c.missing.map((m: string) => `Falta: ${m}`)].join(' ')}</span></div><span>{c.points}/{c.weight}</span></div>
    ))}
    {e.redundancy.garments.length > 0 && (<><h3>Lo que ya tienes parecido</h3>
      <ul className="small">{(e.redundancy.garments as Row[]).map((g) => <li key={g.id}><Link href={`/armario/${g.id}`}>{g.title}</Link> — {g.similarity} % parecido{g.diffs.length ? `; diferencias: ${g.diffs.join('; ')}` : ''}</li>)}</ul>
      {(e.redundancy.adds as string[]).map((a) => <p key={a} className="small">{a}</p>)}</>)}
    {e.risks.length > 0 && <><h3>Riesgos</h3><ul className="small">{(e.risks as string[]).map((r) => <li key={r}>{r}</li>)}</ul></>}
    <p className="m small">Evaluado con {e.engine_version} el {new Date(e.created_at).toLocaleString('es-ES')}. No ordena por precio, popularidad ni tendencia.</p>
  </>)
}
