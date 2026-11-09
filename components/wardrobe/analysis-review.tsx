import Link from 'next/link'
import { confirmAnalysisAction } from '@/app/(app)/armario/actions'
import { FIELD_LABEL, level, type NormalizedAnalysis, type ProposedField } from '@/lib/wardrobe/analysis'
import { ATTRIBUTES, CUTS, GARMENT_COLORS, GROUPS, IMAGE_ROLES, PATTERNS, SEASONS, SILHOUETTES, familyOf, groupOf, subOf } from '@/lib/wardrobe/taxonomy'
import { AnalyzeButton } from './analyze-button'

type Row = Record<string, any>
const STATUS: Record<string, string> = { proposed: 'Pendiente de revisar', accepted: 'Aceptado', partially_accepted: 'Aceptado en parte', rejected: 'Descartado', superseded: 'Sustituido por otro análisis' }
const LEVEL: Record<string, string> = { alta: 'Alta', media: 'Media', baja: 'Baja' }
const SOURCE: Record<string, string> = { usuario: 'puesto por ti', ia: 'propuesto por la IA y aceptado por ti', etiqueta: 'de la etiqueta', ficha: 'de la ficha comercial' }
const roleLabel = (r: string) => IMAGE_ROLES.find((x) => x.id === r)?.label ?? r
const fmt = (iso: string) => new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

function pretty(field: string, v: unknown): string {
  if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) return '—'
  if (field === 'category') return groupOf(String(v))?.label ?? String(v)
  if (field === 'subcategory') return subOf(String(v))?.label ?? String(v)
  if (field === 'seasons') return (v as string[]).map((x) => SEASONS.find((s) => s.id === x)?.label ?? x).join(', ')
  if (field === 'formality_level') return `${v}/5`
  return Array.isArray(v) ? v.join(', ') : String(v)
}

/** Valores permitidos para corregir cada campo (siempre de la taxonomia). null = texto libre. */
function options(f: ProposedField, g: Row, proposedCategory: string | null, proposedSub: string | null): { id: string; label: string }[] | null {
  const L = (xs: readonly string[]) => xs.map((x) => ({ id: x, label: x }))
  const cat = proposedCategory ?? g.category
  const fam = familyOf(proposedSub ?? g.subcategory, cat)
  if (f.field === 'category') return GROUPS.map((x) => ({ id: x.id, label: x.label }))
  if (f.field === 'subcategory') return (GROUPS.find((x) => x.id === cat)?.subs ?? []).map((x) => ({ id: x.id, label: x.label }))
  if (f.field === 'primary_color' || f.field === 'secondary_colors') return L(GARMENT_COLORS)
  if (f.field === 'pattern') return L(PATTERNS)
  if (f.field === 'silhouette') return L(SILHOUETTES)
  if (f.field === 'cut') return L(CUTS[fam])
  if (f.field === 'formality_level') return [1, 2, 3, 4, 5].map((n) => ({ id: String(n), label: `${n}/5` }))
  if (f.field === 'seasons') return SEASONS.map((s) => ({ id: s.id, label: s.label }))
  if (f.field.startsWith('attr:')) {
    const key = f.field.slice(5)
    for (const defs of Object.values(ATTRIBUTES)) { const d = defs.find((x) => x.key === key && x.options.includes(String(f.value))); if (d) return L(d.options) }
  }
  return null
}

function Correction({ f, g, cat, sub }: { f: ProposedField; g: Row; cat: string | null; sub: string | null }) {
  const opts = options(f, g, cat, sub)
  const name = `v_${f.field}`
  if (!opts) return <input name={name} defaultValue={String(f.value ?? '')} aria-label={`Corrección de ${f.label}`} />
  if (Array.isArray(f.value)) return (
    <span className="opts mini">{opts.map((o) => <label key={o.id}><input type="checkbox" name={name} value={o.id} defaultChecked={(f.value as string[]).includes(o.id)} />{o.label}</label>)}</span>
  )
  return <select name={name} defaultValue={String(f.value ?? '')} aria-label={`Corrección de ${f.label}`}><option value="">Sin indicar</option>{opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
}

/**
 * Pestaña «Análisis IA» de la ficha: la propuesta del Garment Analyst campo a campo, con su confianza y el valor actual,
 * para aceptar, corregir o descartar. Lo descartado no toca la ficha; lo aceptado queda con su origen.
 */
export function AnalysisReview({ g, analyses, flags }: { g: Row; analyses: Row[]; flags: Record<string, string | undefined> }) {
  const analyzable = g.images.filter((i: Row) => i.role !== 'worn').length
  const last = analyses[0]
  const pending = last?.status === 'proposed' ? last : null
  const n = pending?.normalized as NormalizedAnalysis | undefined
  const src = g.field_sources ?? {}
  const proposedCat = (n?.fields.find((f) => f.field === 'category')?.value as string) ?? null
  const proposedSub = (n?.fields.find((f) => f.field === 'subcategory')?.value as string) ?? null

  return (
    <div className="analysis">
      {flags.cached && <p className="note" role="status">Estas fotos ya se habían analizado: te muestro ese análisis en lugar de repetir la llamada a la IA. Si quieres otra opinión, usa «Repetir análisis».</p>}
      {flags.analyzed && <p className="note" role="status">Análisis listo. Revisa la propuesta: nada se guarda en la ficha hasta que lo confirmes.</p>}
      {flags.reviewed && <p className="note" role="status">Revisión guardada: {flags.a ?? 0} aceptados, {flags.c ?? 0} corregidos, {flags.r ?? 0} descartados. Cada dato queda con su origen en el historial.</p>}

      {!analyses.length && (<>
        <p>La IA puede identificar el tipo de prenda, el color, el estampado, el corte, la silueta y sus características técnicas a partir de las fotos. Te propone cada dato con su nivel de confianza y tú decides qué se guarda.</p>
        <p className="m small">No confirma la composición sin foto de la etiqueta, no inventa marcas ni tallas y no valora cómo te queda: eso requiere fotos tuyas llevándola.</p>
        {analyzable ? <AnalyzeButton garmentId={g.id} label="Analizar con IA" primary /> : <p className="note warn">Añade al menos una foto de la prenda (frontal, posterior, detalle o etiqueta) en <Link href={`/armario/${g.id}?tab=resumen#fotos`}>Resumen</Link> para poder analizarla.</p>}
      </>)}

      {pending && n && (
        <form action={confirmAnalysisAction}>
          <input type="hidden" name="id" value={g.id} /><input type="hidden" name="analysis_id" value={pending.id} />
          <p className="m small">Propuesta del {fmt(pending.created_at)} a partir de {pending.image_roles.map(roleLabel).join(', ').toLowerCase()}. Confianza global: {n.overall != null ? `${LEVEL[level(n.overall)].toLowerCase()} (${Math.round(n.overall * 100)} %)` : '—'}. Lo marcado como «Aceptar» se propone por tener confianza media o alta y no pisar un dato tuyo.</p>
          {n.fields.length ? (
            <div className="prop">
              {n.fields.map((f) => {
                const cur = f.field.startsWith('attr:') ? g.attributes?.[f.field.slice(5)] ?? null : g[f.field] ?? null
                const cs = src[f.field.startsWith('attr:') ? 'attributes' : f.field]?.source
                const same = JSON.stringify(cur) === JSON.stringify(f.value)
                const def = same ? 'reject' : f.preselect ? 'accept' : 'reject'
                return (
                  <fieldset key={f.field} className={`pf lv-${f.level}`}>
                    <legend>{f.label}</legend>
                    <div className="pv"><b>{pretty(f.field, f.value)}</b> <span className={`conf ${f.level}`}>Confianza {LEVEL[f.level].toLowerCase()} · {Math.round(f.confidence * 100)} %</span>
                      {f.note && <span className="m small"> · {f.note}</span>}</div>
                    <div className="m small">Ahora: {pretty(f.field, cur)}{cur !== null && cs ? ` (${SOURCE[cs] ?? cs})` : ''}{same ? ' · coincide con la propuesta' : ''}</div>
                    <div className="acts">
                      <label><input type="radio" name={`d_${f.field}`} value="accept" defaultChecked={def === 'accept'} />Aceptar</label>
                      <label><input type="radio" name={`d_${f.field}`} value="correct" />Corregir:</label> <Correction f={f} g={g} cat={proposedCat} sub={proposedSub} />
                      <label><input type="radio" name={`d_${f.field}`} value="reject" defaultChecked={def === 'reject'} />{same ? 'Dejar como está' : 'Descartar'}</label>
                    </div>
                  </fieldset>
                )
              })}
            </div>
          ) : <p className="note warn">La IA no ha podido identificar ningún dato con estas fotos.</p>}

          {(n.observations.length > 0 || n.inferences.length > 0) && (
            <div className="obs">
              {n.observations.length > 0 && <div><h4>Lo que se ve</h4><ul>{n.observations.map((o, i) => <li key={i}>{o}</li>)}</ul></div>}
              {n.inferences.length > 0 && <div><h4>Lo que deduce (no verificado)</h4><ul>{n.inferences.map((o, i) => <li key={i}>{o}</li>)}</ul></div>}
            </div>
          )}
          {(n.unknown.length > 0 || n.requested.length > 0) && (
            <div className="note"><b>Lo que no ha podido determinar</b>
              <ul>{n.unknown.map((u, i) => <li key={i}>{FIELD_LABEL[u.field] ?? u.field}: {u.reason}{u.photo ? ` → foto: ${roleLabel(u.photo).toLowerCase()}` : ''}</li>)}</ul>
              {n.requested.length > 0 && <p className="small">Fotos que ayudarían: {n.requested.map(roleLabel).join(', ').toLowerCase()}. <Link href={`/armario/${g.id}?tab=resumen#fotos`}>Añadir fotos</Link> y repetir el análisis.</p>}
            </div>
          )}
          {n.discarded.length > 0 && <details className="howto"><summary>Descartado automáticamente ({n.discarded.length})</summary><ul className="m small">{n.discarded.map((d, i) => <li key={i}>{d}</li>)}</ul></details>}

          {g.wardrobe_status === 'draft' && <label className="chk"><input type="checkbox" name="activate" value="1" defaultChecked /> Guardar también la prenda en mi armario (deja de ser borrador)</label>}
          <div className="btns"><button className="btn primary">Confirmar revisión</button></div>
        </form>
      )}

      {analyses.length > 0 && !pending && (
        <div className="btns">
          <AnalyzeButton garmentId={g.id} label="Analizar de nuevo" />
          <AnalyzeButton garmentId={g.id} label="Repetir análisis (nueva llamada)" force />
        </div>
      )}
      {pending && <div className="btns"><AnalyzeButton garmentId={g.id} label="Repetir análisis (nueva llamada)" force /></div>}
      {analyses.length > 0 && <p className="m small">Corregir la ficha a mano nunca lanza otro análisis. «Analizar de nuevo» solo llama a la IA si las fotos han cambiado.</p>}

      {analyses.length > 0 && (<>
        <h3>Historial de análisis</h3>
        <ul className="events">{analyses.map((a) => {
          const d = Object.values((a.decisions ?? {}) as Record<string, { action: string }>)
          const c = (k: string) => d.filter((x) => x.action === k).length
          return (
            <li key={a.id}><b>{STATUS[a.status] ?? a.status}</b> <span className="m small">· {fmt(a.created_at)} · {a.model_id} · {a.prompt_version} / {a.schema_version}
              {a.overall_confidence != null ? ` · confianza ${Math.round(Number(a.overall_confidence) * 100)} %` : ''}
              {a.usage?.prompt ? ` · ${a.usage.prompt + a.usage.completion} tokens` : ''}{a.usage?.ms ? ` · ${(a.usage.ms / 1000).toFixed(1)} s` : ''}
              {a.reviewed_at ? ` · revisado: ${c('accept')} aceptados, ${c('correct')} corregidos, ${c('reject')} descartados` : ''}</span></li>
          )
        })}</ul>
      </>)}
    </div>
  )
}
