import { FeedbackForm } from './feedback-form'
import { saveResultAction } from '@/app/(app)/compras/product-actions'

type Row = Record<string, any>
const DEC: Record<string, string> = { eleccion: 'Elección del estilista', buena_opcion: 'Buena opción', con_reservas: 'Con reservas', no_recomendado: 'No lo recomiendo', no_elegible: 'No disponible para ti' }
const money = (p: number | null, c = 'EUR') => (p == null ? 'Precio sin comprobar' : `${p.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c === 'EUR' ? '€' : c}`)

/**
 * Producto de la selección del estilista: imagen (solo del CDN de Channel3, pensado para mostrarse; las de las tiendas
 * se enlazan), producto y marca, precio, tienda, tu talla disponible, 4C y confianza, oportunidad que desarrolla, por
 * qué mejora tu estilo, con qué prendas combina, conjuntos nuevos e inconvenientes; y tu valoración.
 */
export function CuratedCard({ h, index, searchId, opportunity, current, compact = false }: { h: Row; index: number; searchId: string; opportunity: Row; current?: string | null; compact?: boolean }) {
  const e = h.evaluation as Row | null, s = h.strategic as Row | null, el = h.eligibility as Row | null
  const c3 = h.raw_attributes?.provider === 'channel3'
  const img = c3 ? (h.images as Row[] | undefined)?.[0]?.url : null
  const store = h.retailer?.name ?? h.raw_attributes?.domain ?? 'Tienda'
  const link = c3 ? `/api/shopping/channel3/offer?search=${searchId}&i=${index}` : h.product_url
  const size = el?.size?.size
  const drawbacks = [...((s?.flags ?? []) as string[]), ...((e?.risks ?? []) as string[]).slice(0, 2)]
  return (
    <div className={`hit curated ${s?.decision ? `d-${s.decision}` : ''}`}>
      {img && !compact && <img className="pimg" src={img} alt={h.product_name} loading="lazy" referrerPolicy="no-referrer" />}
      <span className="st">{store}{h.brand && h.brand !== store ? ` · ${h.brand}` : ''} · {DEC[s?.decision ?? ''] ?? 'Sin evaluar'}{s?.price_tier ? ` · precio ${s.price_tier}` : ''}</span>
      <h3>{h.product_name}</h3>
      <p className="small"><b>{money(h.current_price, h.currency)}</b>{size ? ` · talla ${size.original}${size.system === 'eu_num' || size.system === 'shoe_eu' ? ' EU' : ''} disponible (${size.role === 'principal' ? 'tu talla principal' : 'alternativa'})` : ` · ${el?.label ?? 'talla sin comprobar'}`}{el?.size?.fit_confidence ? ` · ajuste: confianza ${el.size.fit_confidence}` : ''}</p>
      {s && <p className="score-line">Valor estratégico <b>{s.value ?? '—'}/100</b>{e ? ` · compatibilidad personal (4C) ${e.score}/100 · confianza ${e.confidence}` : ''}</p>}
      <p className="small"><b>Desarrolla:</b> «{opportunity.title}»{h.facets?.length ? ` · encontrado en ${(h.facets as string[]).map((f) => f.replace(/^color:/, '').replace(/^material:/, '').replace('base', 'propuesta base').replace('sinonimo', 'variante')).join(', ').toLowerCase()}` : ''}</p>
      {s && <p className="small"><b>Por qué mejora tu estilo:</b> {s.decision_text}</p>}
      {!compact && (<>
        {(s?.components as Row[] | undefined)?.find((c) => c.key === 'wardrobe')?.reasons?.length > 0 && <p className="m small">Qué aporta: {(s!.components as Row[]).find((c) => c.key === 'wardrobe')!.reasons.join(' · ')}</p>}
        {(e?.combines_with as Row[] | undefined)?.length ? <p className="small"><b>Combina con:</b> {(e!.combines_with as Row[]).slice(0, 5).map((g) => g.title).join(', ')}</p> : null}
        {e?.wva?.new_outfits ? <p className="small"><b>Conjuntos nuevos:</b> {e.wva.new_outfits}{e.wva.outfit_samples?.[0] ? ` · p. ej. ${e.wva.outfit_samples[0].titles.join(' + ')}` : ''}</p> : null}
        {drawbacks.length > 0 && <p className="m small">Inconvenientes: {drawbacks.join(' · ')}</p>}
      </>)}
      <div className="btns">
        {link && <a className="btn small" href={link} target="_blank" rel="noopener noreferrer nofollow">{c3 ? 'Ver oferta actual' : 'Ver en la tienda'}</a>}
        <form action={saveResultAction}><input type="hidden" name="search_id" value={searchId} /><input type="hidden" name="index" value={index} /><button className="btn small">Guardar como candidato</button></form>
      </div>
      <FeedbackForm kind="producto" target={h.canonical_url ?? `${searchId}:${index}`} current={current} back="seleccion"
        context={{ name: h.product_name, brand: h.brand, element: opportunity.target?.element, cut: h.cut ?? h.silhouette, mode: opportunity.mode, opportunity_key: opportunity.key, trend_key: opportunity.market?.signal_id ?? null }} />
    </div>
  )
}
