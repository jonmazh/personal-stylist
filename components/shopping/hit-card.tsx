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
  return (
    <div className={`hit ${e ? `v-${e.verdict}` : ''}`}>
      <span className="st">{h.retailer?.name ?? h.brand ?? 'Tienda'} · {h.source_label ?? label(SOURCE_KINDS, h.source_kind)}</span>
      <h3>{h.product_name}</h3>
      <span className="small">{fmt(h.current_price, h.currency)}{h.raw_attributes?.previous_price ? ` (antes ${fmt(h.raw_attributes.previous_price.amount, h.currency)})` : ''}{h.availability_status && h.availability_status !== 'unknown' ? ` · ${label(AVAILABILITY, h.availability_status)}` : ''}{h.confirmed_composition ? ` · ${h.confirmed_composition}` : ''}</span>
      {e ? (<>
        <p className="score-line"><b>{e.score}/100</b> · {v?.label} · confianza {e.confidence} ({e.confidence_score}/100) · datos {Math.round(e.completeness * 100)} %</p>
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
      </>) : <p className="m small">Sin evaluar (faltan datos para compararlo con tu perfil).</p>}
      <div className="btns">
        {h.product_url && <a className="btn small" href={h.product_url} target="_blank" rel="noopener noreferrer nofollow">Ver en la tienda</a>}
        <form action={saveResultAction}><input type="hidden" name="search_id" value={searchId} /><input type="hidden" name="index" value={index} /><button className="btn small primary">Guardar como candidato</button></form>
      </div>
    </div>
  )
}
