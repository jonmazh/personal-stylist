import Link from 'next/link'
import { getUser } from '@/lib/supabase/server'
import { compareProducts } from '@/lib/shopping/evaluator-service'
import { VERDICTS } from '@/lib/shopping/evaluate'
import { AVAILABILITY, label } from '@/lib/shopping/catalog/taxonomy'
import { subOf } from '@/lib/wardrobe/taxonomy'

type Row = Record<string, any>

/** Comparar candidatos lado a lado: lo que aporta cada uno a tu armario, no su precio ni su popularidad. */
export default async function ComparePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const ids = ([] as string[]).concat(sp.ids ?? []).flatMap((x) => x.split(',')).filter(Boolean)
  const user = (await getUser())!
  let rows: Awaited<ReturnType<typeof compareProducts>> = [], error = ''
  try { rows = await compareProducts(user.supabase, user.id, ids) } catch (e) { error = (e as Error).message }
  const best = rows[0]
  const line = (name: string, f: (r: Row) => React.ReactNode) => <tr><th>{name}</th>{rows.map((r) => <td key={r.product.id}>{f(r)}</td>)}</tr>
  const crit = (key: string) => (r: Row) => { const c = (r.evaluation.criteria as Row[]).find((x) => x.key === key); return c ? `${c.points}/${c.weight}${c.missing.length ? ' · falta dato' : ''}` : '—' }
  return (
    <main className="wide shop">
      <p className="eyebrow"><Link href="/compras/productos">Candidatos</Link> · Comparar</p>
      <h1 className="display">Comparar candidatos</h1>
      {error && <p className="note warn" role="alert">{error} <Link href="/compras/productos">Elige productos</Link>.</p>}
      {best && (best.evaluation.verdict === 'buy' || best.evaluation.verdict === 'consider'
        ? <p className="verdict"><b>Mejor opción: {best.product.product_name}</b> ({best.evaluation.score}/100). {best.evaluation.verdict_text}</p>
        : <p className="verdict"><b>Ninguno me convence ahora mismo.</b> Lo mejor puntuado es «{best.product.product_name}» ({best.evaluation.score}/100), pero mi veredicto es «{VERDICTS.find((v) => v.id === best.evaluation.verdict)?.label.toLowerCase()}». Esperar también es una opción.</p>)}
      {rows.length > 0 && <div className="cmpwrap"><table className="cmp">
        <thead><tr><th></th>{rows.map((r) => <th key={r.product.id}><Link href={`/compras/productos/${r.product.id}`}>{r.product.product_name}</Link><br /><span className="m">{r.product.retailers?.name ?? r.product.brand ?? ''}</span></th>)}</tr></thead>
        <tbody>
          {line('Veredicto', (r) => <b>{VERDICTS.find((v) => v.id === r.evaluation.verdict)?.label}</b>)}
          {line('Puntuación', (r) => `${r.evaluation.score}/100 · confianza ${r.evaluation.confidence}`)}
          {line('Tipo', (r) => (r.product.subcategory ? subOf(r.product.subcategory)?.label : '—'))}
          {line('Color', (r) => r.product.colors?.join(', ') || '—')}
          {line('Composición', (r) => r.product.confirmed_composition ?? 'Desconocida')}
          {line('Precio', (r) => r.evaluation.indicators.price.text)}
          {line('Disponibilidad', (r) => label(AVAILABILITY, r.product.availability_status))}
          {line('Talla', (r) => r.evaluation.indicators.sizes.text)}
          {line('Estilo', crit('style'))}{line('Corte y proporciones', crit('cut'))}{line('Color (colorimetría)', crit('color'))}
          {line('Combinabilidad', crit('combos'))}{line('Necesidades', crit('needs'))}{line('Calidad documentada', crit('quality'))}{line('Calidad-precio', crit('value'))}
          {line('Combinaciones', (r) => r.evaluation.indicators.combinations.text)}
          {line('Duplicidad', (r) => r.evaluation.indicators.duplicity.text)}
          {line('Límites', (r) => (r.evaluation.limitations as string[]).join(' ') || '—')}
        </tbody>
      </table></div>}
      <p className="m small">Ordenados por lo que aportan a tu armario. La puntuación no oculta lo que falta: revisa los límites de cada uno.</p>
    </main>
  )
}
