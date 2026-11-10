import { VERDICTS } from '@/lib/shopping/evaluate'
import { AVAILABILITY, SOURCE_KINDS, label } from '@/lib/shopping/catalog/taxonomy'
import { saveResultAction } from '@/app/(app)/compras/product-actions'

type Row = Record<string, any>
const fmt = (p: number | null, c = 'EUR') => (p == null ? 'Precio sin comprobar' : `${p.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c === 'EUR' ? '€' : c}`)
const COLOR_LABEL: Record<string, string> = {
  'favorable-poco-representado': 'Te favorece y te falta', 'equilibra-el-armario': 'Equilibra tu armario', redundante: 'Color ya saturado en tu armario',
  'poco-compatible': 'Color poco favorable para ti', neutro: 'Color correcto', 'sin-datos': 'Sin colorimetría: no puedo valorarlo',
}

/** Resultado de búsqueda evaluado con tu perfil: puntuación, confianza, por qué, qué aporta, qué combina y qué falta. */
export function HitCard({ h, index, searchId, compact = false }: { h: Row; index: number; searchId: string; compact?: boolean }) {
  const e = h.evaluation as Row | null
  const v = e ? VERDICTS.find((x) => x.id === e.verdict) : null
  const c3 = h.raw_attributes?.provider === 'channel3' ? h.raw_attributes as Row : null
  const el = h.eligibility as Row | null
  return (
    <div className={`hit ${e ? `v-${e.verdict}` : ''}`}>
      <span className="st">{h.retailer?.name ?? h.raw_attributes?.domain ?? h.brand ?? 'Tienda'} · {h.source_label ?? label(SOURCE_KINDS, h.source_kind)}</span>
      <h3>{h.product_name}</h3>
      {c3 && <span className="m small">{c3.foreign_market ? `Mercado: ${c3.market_name} · precio de otro mercado, no verificado para España` : `Mercado: ${c3.market_name}`} · {c3.refresh === 'failed' ? 'no se pudo actualizar: precio sin verificar' : c3.refresh === 'gone' ? 'ya no está en el catálogo' : `precio comprobado el ${new Date(c3.fetched_at).toLocaleString('es-ES')}`}</span>}
      <span className="small">{fmt(h.current_price, h.currency)}{h.raw_attributes?.previous_price ? ` (antes ${fmt(h.raw_attributes.previous_price.amount, h.currency)})` : ''}{h.availability_status && h.availability_status !== 'unknown' ? ` · ${label(AVAILABILITY, h.availability_status)}` : ''}{h.confirmed_composition ? ` · ${h.confirmed_composition}` : ''}</span>
      {h.opportunity_match && <p className="m small">{h.opportunity_match.fit === 'materializa' ? 'Materializa la oportunidad' : 'Encaja con la oportunidad, con datos por confirmar'}: {[...h.opportunity_match.matches, ...h.opportunity_match.unknown].join(' · ').toLowerCase()}{h.facets?.length ? ` · encontrado en: ${(h.facets as string[]).map((f: string) => f.replace(/^color:/, '').replace(/^material:/, '').replace('base', 'propuesta base').replace('sinonimo', 'variante')).join(', ').toLowerCase()}` : ''}</p>}
      {h.strategic && <StrategicLine s={h.strategic as Row} />}
      {el && <SizeLine el={el} />}
      {e ? (<>
        <p className="score-line">{h.strategic ? 'Compatibilidad personal (4C): ' : ''}<b>{e.score}/100</b> · {v?.label} · confianza {e.confidence} ({e.confidence_score}/100) · datos {Math.round(e.completeness * 100)} %</p>
        <p className="small">{e.verdict_text}</p>
        {!compact && (<>
          <div className="minibars">{(e.criteria as Row[]).map((c) => (
            <span key={c.key} title={[...c.reasons, ...c.missing.map((m: string) => `Falta: ${m}`)].join(' ')}><i style={{ width: `${Math.round((c.points / c.weight) * 100)}%` }} className={c.known ? '' : 'unknown'} />{c.label} {c.known ? `${c.points}/${c.weight}` : 'sin datos'}</span>
          ))}</div>
          {e.color && <p className="small">Color: {COLOR_LABEL[e.color.label] ?? e.color.label}</p>}
          {e.reasons.length > 0 && <p className="small">{e.reasons.join(' ')}</p>}
          <p className="small">Aporta: {e.wva.score}/100{e.wva.new_outfits ? ` · ${e.wva.new_outfits} conjunto${e.wva.new_outfits === 1 ? '' : 's'} nuevo${e.wva.new_outfits === 1 ? '' : 's'}` : ' · ningún conjunto nuevo'}{e.wva.gaps.length ? ` · resuelve: ${e.wva.gaps.join('; ')}` : ''}{e.wva.occasions_new.length ? ` · nuevas ocasiones: ${e.wva.occasions_new.join(', ').toLowerCase()}` : ''}</p>
          {e.combines_with.length > 0 && <p className="m small">Combina con: {(e.combines_with as Row[]).map((g) => g.title).join(', ')}</p>}
          {e.wva.outfit_samples.length > 0 && <p className="m small">Ejemplo: {e.wva.outfit_samples[0].titles.join(' + ')}</p>}
          {e.risks.length > 0 && <p className="small">Inconvenientes: {e.risks.join(' ')}</p>}
          {e.discard_reasons.length > 0 && <p className="small"><b>Por qué no:</b> {e.discard_reasons.join(' ')}</p>}
          {e.missing_info.length > 0 && <p className="m small">Falta información: {e.missing_info.join(', ').toLowerCase()}</p>}
        </>)}
      </>) : el?.excluded ? null : <p className="m small">Sin evaluar (faltan datos para compararlo con tu perfil).</p>}
      <div className="btns">
        {c3 ? <a className="btn small" href={`/api/shopping/channel3/offer?search=${searchId}&i=${index}`} target="_blank" rel="noopener noreferrer nofollow">Ver oferta actual</a>
          : h.product_url && <a className="btn small" href={h.product_url} target="_blank" rel="noopener noreferrer nofollow">Ver en la tienda</a>}
        <form action={saveResultAction}><input type="hidden" name="search_id" value={searchId} /><input type="hidden" name="index" value={index} /><button className="btn small primary">Guardar como candidato</button></form>
      </div>
    </div>
  )
}

const SYS: Record<string, string> = { alpha: '', eu_num: ' EU', waist_in: '', shoe_eu: ' EU', shoe_uk: ' UK', shoe_us: ' US', collar_cm: ' (cuello)' }
/** Talla y disponibilidad: solo se afirma lo que respaldan los datos (talla disponible ≠ ajuste garantizado). */
function SizeLine({ el }: { el: Row }) {
  const s = el.size as Row
  if (el.excluded || !el.ok) return <p className="small"><b>{el.label}.</b> {(el.reasons as string[]).join(' ')}</p>
  if (s.status === 'no_aplica') return null
  return (<>
    <p className="small"><b>Talla disponible: {s.size.original}{SYS[s.size.system] ?? ''}</b> · {s.size.role === 'principal' ? 'tu talla principal' : 'talla alternativa'}{s.size.also?.length ? ` (también ${s.size.also.join(', ')})` : ''} · disponibilidad confirmada{s.checked_at ? ` el ${new Date(s.checked_at).toLocaleString('es-ES')}` : ''}{s.selected_color ? ` (color ${s.selected_color})` : ''}</p>
    <p className="m small">Ajuste: confianza {s.fit_confidence}{s.basis === 'estimada' ? ' (estimada)' : ' (respaldada por tus datos)'}{s.equivalence ? ` · ${s.equivalence.source}` : ''}. Una talla disponible no garantiza el ajuste.</p>
  </>)
}

const DEC: Record<string, string> = { eleccion: 'Elección del estilista', buena_opcion: 'Buena opción', con_reservas: 'Con reservas', no_recomendado: 'No lo recomiendo', no_elegible: 'No disponible para ti' }
/** Valor estratégico (2.0F), separado del 4C: decisión, componentes, alertas y nivel de precio. */
function StrategicLine({ s }: { s: Row }) {
  return (<>
    <p className="score-line"><b>Valor estratégico {s.value ?? '—'}/100</b> · {DEC[s.decision]}{s.price_tier ? ` · precio ${s.price_tier}` : ''}</p>
    <p className="small">{s.decision_text}</p>
    {(s.flags as string[]).length > 0 && <p className="small"><b>Alertas:</b> {(s.flags as string[]).join(' · ')}</p>}
    <div className="minibars">{(s.components as Row[]).map((c) => <span key={c.key} title={(c.reasons as string[]).join(' · ')}><i style={{ width: `${Math.round((c.value ?? 0.5) * 100)}%` }} className={c.value == null ? 'unknown' : ''} />{c.label} {c.value == null ? 'sin datos' : `${Math.round(c.value * 100)}`}</span>)}</div>
    {(s.components as Row[]).filter((c) => c.reasons.length && c.value != null).slice(0, 2).map((c) => <p key={c.key} className="m small">{c.label}: {(c.reasons as string[]).join(' · ')}</p>)}
  </>)
}
