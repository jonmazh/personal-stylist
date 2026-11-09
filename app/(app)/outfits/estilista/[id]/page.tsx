import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { getSession } from '@/lib/outfits/stylist/service'
import { DRESS_CODES, RESTRICTIONS, TIMES, WEATHERS } from '@/lib/outfits/engine/context'
import { occasionLabel } from '@/lib/outfits/taxonomy'
import { WardrobeError } from '@/lib/wardrobe/service'
import { ProposalCard } from '@/components/outfits/proposal-card'
import { PendingButton } from '@/components/outfits/pending-button'
import { stylistMessageAction } from '../../actions'

type Row = Record<string, any>
const lbl = (xs: readonly { id: string; label: string }[], id?: string | null) => xs.find((x) => x.id === id)?.label

/** Conversación con el estilista sobre unas propuestas: contexto interpretado, propuestas explicadas y cambios validados. */
export default async function StylistSessionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params
  const sp = await searchParams
  const user = (await getUser())!
  let s: Awaited<ReturnType<typeof getSession>>
  try { s = await getSession(user.supabase, id) } catch (e) { if (e instanceof WardrobeError && e.status === 404) notFound(); throw e }
  const req = s.request as Row
  const chips = [req.occasion ? occasionLabel(req.occasion) : null, lbl(DRESS_CODES, req.dress_code), lbl(TIMES, req.time_of_day), lbl(WEATHERS, req.weather), ...(req.restrictions ?? []).map((r: string) => lbl(RESTRICTIONS, r))].filter(Boolean)
  const back = `/outfits/estilista/${id}`
  return (
    <main className="wide">
      <p className="eyebrow"><Link href="/outfits">Outfit Studio</Link> · Estilista</p>
      <h1 className="display">{s.title}</h1>
      <p className="m small">Lo que he entendido: {chips.length ? chips.join(' · ') : 'sin condiciones concretas'}.</p>
      {sp.error && <p className="note warn" role="alert">{sp.error}</p>}
      {sp.dismissed && <p className="note" role="status">Propuesta descartada.</p>}

      <div className="thread">{s.messages.map((m: Row) => (
        <div key={m.id} className={`msg ${m.role}`}>
          <p>{m.content}</p>
          {m.role === 'assistant' && m.payload?.interpretation && ((m.payload.interpretation.assumptions ?? []).length > 0 || (m.payload.interpretation.dropped ?? []).length > 0 || (m.payload.interpretation.selection_dropped ?? []).length > 0) && (
            <details className="howto"><summary>Cómo he interpretado tu petición</summary><ul className="m small">
              {(m.payload.interpretation.assumptions ?? []).map((a: string, i: number) => <li key={`a${i}`}>{a}</li>)}
              {(m.payload.interpretation.dropped ?? []).map((a: string, i: number) => <li key={`d${i}`}>Descartado: {a}</li>)}
              {(m.payload.interpretation.selection_dropped ?? []).map((a: string, i: number) => <li key={`s${i}`}>Validación: {a}; no se ha usado.</li>)}
              <li>Intérprete: {m.payload.interpretation.parser}</li>
            </ul></details>
          )}
          {m.payload?.action === 'propose' && <div className="props">{(m.payload.results as string[]).map((rid) => { const r = s.results.get(rid); return r ? <ProposalCard key={rid} r={r} context={chips.join(' · ')} label={`P${s.numberOf.get(rid) ?? r.rank}`} back={back} current={s.currentIds.has(rid)} /> : null })}</div>}
          {m.payload?.action === 'modify' && m.payload.result_id && s.results.get(m.payload.result_id) && <div className="props"><ProposalCard r={s.results.get(m.payload.result_id)!} context={chips.join(' · ')} label={`P${m.payload.target}`} back={back} current={s.currentIds.has(m.payload.result_id)} /></div>}
          {(m.payload?.learned ?? []).length > 0 && <p className="m small learned">Anotado en tu perfil de gustos: {(m.payload.learned as Row[]).map((l) => `${l.kind === 'garment' ? 'no te gusta' : l.kind === 'element' ? 'rechazas' : 'evitas'} ${l.kind === 'garment' ? `«${l.label}»` : l.label.toLowerCase()}`).join('; ')}. <Link href="/outfits/aprendizaje">Aprendizaje</Link> · <Link href="/estilos/identidad">Identidad estética</Link> · <Link href="/profile/color">Estudio cromático</Link></p>}
          {m.payload?.action === 'save' && m.payload.outfit_id && <p className="small"><Link href={`/outfits/${m.payload.outfit_id}`}>Ver el conjunto guardado</Link></p>}
        </div>
      ))}</div>

      <form action={stylistMessageAction} className="chatform" id="fin">
        <input type="hidden" name="session_id" value={id} />
        <label>Habla con tu estilista sobre estas propuestas
          <textarea name="message" rows={2} required maxLength={1000} placeholder="Me gusta la P2, pero no me convencen los zapatos" /></label>
        <div className="btns"><PendingButton label="Enviar" pending="El estilista está pensando…" /></div>
        <p className="m small">Puedo cambiar prendas (solo por otras de tu armario, y el motor vuelve a puntuar el resultado), explicarte una propuesta, rehacerlas con otras condiciones o guardar la que quieras.</p>
      </form>
      <p className="m small"><Link href="/outfits">← Volver a Outfit Studio</Link></p>
    </main>
  )
}
