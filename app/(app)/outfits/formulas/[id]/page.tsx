import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { tryFormulaFor } from '@/lib/outfits/formula-service'
import { FORMULA_SOURCES, FORMULA_STATUSES, label } from '@/lib/outfits/feedback'
import { OUTFIT_OCCASIONS, roleLabel } from '@/lib/outfits/taxonomy'
import { WardrobeError } from '@/lib/wardrobe/service'
import { subOf } from '@/lib/wardrobe/taxonomy'
import { formulaStatusAction, saveFormulaComboAction } from '../../learn-actions'

type Row = Record<string, any>

/** Ficha de una fórmula: estructura, estado y las mejores combinaciones de tu armario que la cumplen. */
export default async function FormulaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params
  const sp = await searchParams
  const user = (await getUser())!
  let t: Awaited<ReturnType<typeof tryFormulaFor>>
  try { t = await tryFormulaFor(user.supabase, user.id, id, sp.occasion) } catch (e) { if (e instanceof WardrobeError && e.status === 404) notFound(); throw e }
  const f = t.formula as Row
  return (
    <main className="wide">
      <p className="eyebrow"><Link href="/outfits">Outfit Studio</Link> · <Link href="/outfits/formulas">Fórmulas</Link></p>
      <h1 className="display">{f.name}</h1>
      <p className="state m">{label(FORMULA_STATUSES, f.status)} · {label(FORMULA_SOURCES, f.source).toLowerCase()}</p>
      {sp.created && <p className="note" role="status">Fórmula guardada.</p>}
      {sp.error && <p className="note warn" role="alert">{sp.error}</p>}
      <p>{f.text}</p>
      {f.description && <p className="m small">{f.description}</p>}
      <ul className="m small">{(f.slots as Row[]).map((s, i) => <li key={i}>{roleLabel(s.role)}: {s.subcategories.length ? s.subcategories.map((x: string) => subOf(x)?.label ?? x).join(', ').toLowerCase() : 'cualquier tipo'}{s.cuts.length ? ` · corte ${s.cuts.join('/').toLowerCase()}` : ''}{s.formality_min || s.formality_max ? ` · formalidad ${s.formality_min ?? 1}–${s.formality_max ?? 5}` : ''}{s.optional ? ' · opcional' : ''}</li>)}</ul>

      <form method="get" className="btns"><label>Para una ocasión<select name="occasion" defaultValue={sp.occasion ?? ''}><option value="">Cualquiera</option>{OUTFIT_OCCASIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label><button className="btn small">Probar</button></form>
      <h2>Con tu armario</h2>
      <p className="m small">He evaluado {t.evaluated} combinaciones que cumplen la fórmula.</p>
      {!t.combos.length && <p className="note warn">Ahora mismo no tienes prendas para completar esta fórmula.</p>}
      <div className="combos">{t.combos.map((c, i) => (
        <form key={i} action={saveFormulaComboAction} className="prop-card">
          <input type="hidden" name="formula_id" value={id} /><input type="hidden" name="items" value={JSON.stringify(c.items.map((x) => ({ garment_id: x.garment_id, role: x.role })))} />
          <div className="pc-head"><span className="st">Variación {i + 1}</span><div className="pc-score"><b>{c.score}</b><span>/ 100</span></div></div>
          <ol className="oitems view pc-items">{c.items.map((x) => <li key={x.garment_id}><span className="oth">{x.thumb_url ? <img src={x.thumb_url} alt={x.title} /> : <span className="m small">Sin foto</span>}</span><div className="oinfo"><span className="st">{roleLabel(x.role)}</span><b>{x.title}</b></div></li>)}</ol>
          {c.why.length > 0 && <ul className="small">{c.why.map((w, k) => <li key={k}>{w}</li>)}</ul>}
          <div className="btns"><button className="btn small primary">Guardar como conjunto</button></div>
        </form>
      ))}</div>

      <h3>Estado de la fórmula</h3>
      <form action={formulaStatusAction} className="btns">
        <input type="hidden" name="id" value={id} />
        {FORMULA_STATUSES.filter((s) => s.id !== f.status).map((s) => <button key={s.id} className="btn small" name="status" value={s.id}>{s.label}</button>)}
        <button className="btn quiet small" name="status" value="delete">Eliminar fórmula</button>
      </form>
      <p className="m small">Al ponerte un conjunto creado desde esta fórmula, pasa sola de «pendiente de probar» a «probada».</p>
    </main>
  )
}
