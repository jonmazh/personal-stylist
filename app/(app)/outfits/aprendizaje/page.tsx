import Link from 'next/link'
import { getUser } from '@/lib/supabase/server'
import { learningView } from '@/lib/outfits/feedback-service'
import { MIN_EVIDENCE, AUTO_EVIDENCE } from '@/lib/outfits/learning'
import { patternAction } from '../learn-actions'

const STATUS: Record<string, string> = { detected: 'Detectado', confirmed: 'Confirmado por ti', dismissed: 'Descartado' }

/** Lo que el estilista ha aprendido de tus valoraciones y de lo que te pones. No modifica tu Style Blueprint. */
export default async function LearningPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams
  const user = (await getUser())!
  const v = await learningView(user.supabase)
  const m = v.metrics
  const pct = (x: number | null) => (x == null ? '—' : `${x} %`)
  return (
    <main className="wide">
      <p className="eyebrow"><Link href="/outfits">Outfit Studio</Link> · Aprendizaje</p>
      <h1 className="display">Lo que voy aprendiendo de ti</h1>
      <p className="m">Personal Stylist aprende a vestir contigo: no cambia tu perfil por una valoración suelta. Cuando observa un patrón en al menos {MIN_EVIDENCE} valoraciones te lo propone; desde {AUTO_EVIDENCE} lo tiene en cuenta de forma suave, y si lo confirmas, del todo. Tu Style Blueprint no se modifica.</p>
      {sp.error && <p className="note warn" role="alert">{sp.error}</p>}
      {sp.decided && <p className="note" role="status">{sp.decided === 'confirm' ? 'Confirmado: lo aplicaré en tus próximas propuestas.' : sp.decided === 'dismiss' ? 'Descartado: no lo tendré en cuenta.' : 'Vuelve a estar como detectado.'}</p>}
      <div className="metrics">
        <div><b>{m.outfits}</b><span>Conjuntos</span></div>
        <div><b>{pct(m.likedPct)}</b><span>Te gustan ({m.liked}/{m.rated})</span></div>
        <div><b>{m.wornOutfits}</b><span>Te has puesto ({pct(m.wornPct)})</span></div>
        <div><b>{m.repeat}</b><span>Repetirías</span></div>
        <div><b>{m.proposalsWorn}/{m.proposalsSaved}</b><span>Propuestas del estilista que te has puesto</span></div>
      </div>
      <h2>Patrones</h2>
      {!v.patterns.length && <p className="m">Todavía no hay patrones: valora conjuntos y registra los que te pones.</p>}
      {v.patterns.map((p) => (
        <form key={p.key} action={patternAction} className={`pattern st-${p.status}`}>
          <input type="hidden" name="key" value={p.key} />
          <span className="st">{STATUS[p.status]}{p.status === 'detected' ? (p.weight ? ' · ya lo tengo en cuenta de forma suave' : ' · aún sin efecto') : ''}</span>
          <h3 style={{ margin: '4px 0' }}>{p.label}</h3>
          <p className="small">{p.explanation}</p><p className="m small">{p.status === 'confirmed' ? 'Lo aplico en tus próximas propuestas.' : p.status === 'dismissed' ? 'No lo tengo en cuenta.' : p.effect}</p>
          <div className="btns">
            {p.status !== 'confirmed' && <button className="btn small primary" name="action" value="confirm">Confirmar</button>}
            {p.status !== 'dismissed' && <button className="btn small quiet" name="action" value="dismiss">No es así</button>}
            {p.status !== 'detected' && <button className="btn small quiet" name="action" value="reset">Deshacer</button>}
          </div>
        </form>
      ))}
    </main>
  )
}
