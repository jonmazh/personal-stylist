import Link from 'next/link'
import { getUser } from '@/lib/supabase/server'
import { formulasView } from '@/lib/outfits/formula-service'
import { FORMULA_SOURCES, FORMULA_STATUSES, label } from '@/lib/outfits/feedback'
import { ITEM_ROLES, roleLabel } from '@/lib/outfits/taxonomy'
import { CUTS, SUBS } from '@/lib/wardrobe/taxonomy'
import { acceptFormulaAction, createFormulaAction } from '../learn-actions'

type Row = Record<string, any>
const ROWS = [['top_base', ''], ['bottom', ''], ['footwear', ''], ['', ''], ['', '']] as const
const allCuts = [...new Set(Object.values(CUTS).flat())]

/** Style Formulas: tu uniforme personal — estructuras que funcionan y se pueden repetir con otras prendas. */
export default async function FormulasPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams
  const user = (await getUser())!
  const v = await formulasView(user.supabase, user.id).catch(() => ({ formulas: [], suggestions: [] }))
  return (
    <main className="wide">
      <p className="eyebrow"><Link href="/outfits">Outfit Studio</Link> · Fórmulas</p>
      <h1 className="display">Tus fórmulas de estilo</h1>
      <p className="m">Una fórmula no es un conjunto concreto: es una estructura («polo de punto + pantalón recto + mocasines») que puedes repetir con distintas prendas que encajen.</p>
      {sp.error && <p className="note warn" role="alert">{sp.error}</p>}
      {sp.deleted && <p className="note" role="status">Fórmula eliminada.</p>}

      {v.suggestions.length > 0 && (<section className="osec">
        <h2>Fórmulas que repites</h2>
        <p className="m small">Las he detectado en conjuntos que te gustaron, repetirías o te pusiste.</p>
        {v.suggestions.map((s: Row) => (
          <form key={s.signature} action={acceptFormulaAction} className="pattern">
            <input type="hidden" name="signature" value={s.signature} />
            <b>{s.text}</b><p className="m small">En: {s.outfits.map((o: Row) => o.name).join(', ')}</p>
            <label>Nombre<input name="name" maxLength={80} defaultValue={s.text.slice(0, 60)} /></label>
            <div className="btns"><button className="btn small primary">Guardar esta fórmula</button></div>
          </form>
        ))}
      </section>)}

      <section className="osec">
        <h2>Guardadas <span className="m small">· {v.formulas.length}</span></h2>
        {!v.formulas.length && <p className="m">Aún no tienes fórmulas. Crea una aquí o desde la ficha de un conjunto que te guste.</p>}
        <div className="combos">{v.formulas.map((f: Row) => (
          <Link key={f.id} href={`/outfits/formulas/${f.id}`} className={`pattern st-${f.status}`} style={{ color: 'inherit', textDecoration: 'none' }}>
            <span className="st">{label(FORMULA_STATUSES, f.status)} · {label(FORMULA_SOURCES, f.source).toLowerCase()}</span>
            <h3 style={{ margin: '4px 0' }}>{f.name}</h3>
            <p className="small">{f.text}</p>
            <p className="m small">{f.variations ? `${f.variations} combinaciones posibles con tu armario` : `Te falta: ${f.missing.map((r: string) => roleLabel(r).toLowerCase()).join(', ')}`}</p>
          </Link>
        ))}</div>
      </section>

      <details className="howto osec"><summary>Crear una fórmula</summary>
        <form action={createFormulaAction}>
          <label>Nombre<input name="name" required maxLength={80} placeholder="Casual sofisticado" /></label>
          <label>Descripción (opcional)<input name="description" maxLength={500} /></label>
          {ROWS.map(([role], i) => (
            <div key={i} className="fslot">
              <label>Pieza {i + 1}<select name={`role_${i}`} defaultValue={role}><option value="">—</option>{ITEM_ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label>
              <label>Tipo<select name={`sub_${i}`} defaultValue=""><option value="">Cualquiera</option>{SUBS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
              <label>Corte<select name={`cut_${i}`} defaultValue=""><option value="">Cualquiera</option>{allCuts.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
              <label>Formalidad mín.<select name={`fmin_${i}`} defaultValue=""><option value="">—</option>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select></label>
              <label>Formalidad máx.<select name={`fmax_${i}`} defaultValue=""><option value="">—</option>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select></label>
              <label className="chk"><input type="checkbox" name={`opt_${i}`} /> Opcional</label>
            </div>
          ))}
          <div className="btns"><button className="btn primary">Crear fórmula</button></div>
        </form>
      </details>
    </main>
  )
}
