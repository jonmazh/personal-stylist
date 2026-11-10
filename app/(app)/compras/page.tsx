import Link from 'next/link'
import { getUser } from '@/lib/supabase/server'
import { listNeeds, getPreferences } from '@/lib/shopping/service'
import { LEVEL_LABEL, specText } from '@/lib/shopping/priority'
import { NEED_ORIGINS, NEED_STATUSES, NEED_TYPES, PRIORITIES, label } from '@/lib/shopping/taxonomy'
import { NeedSpec } from '@/lib/shopping/taxonomy'
import { garmentTitle } from '@/lib/wardrobe/display'
import { PendingButton } from '@/components/outfits/pending-button'
import { SpecFields } from '@/components/shopping/spec-fields'
import { analyzeAction, createNeedAction } from './actions'

type Row = Record<string, any>
const LEVELS = ['high', 'medium', 'low'] as const

/** Shopping Intelligence: qué te falta de verdad, con qué prioridad y por qué. No muestra productos. */
export default async function ShoppingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams
  const user = (await getUser())!
  const [needs, prefs, { data: garments }] = await Promise.all([
    listNeeds(user.supabase, { status: sp.status ?? 'open' }).catch(() => []), getPreferences(user.supabase).catch(() => null),
    user.supabase.from('garments').select('*').eq('wardrobe_status', 'active').order('created_at'),
  ])
  const threshold = Number(prefs?.min_priority_to_suggest ?? 45)
  const open = (sp.status ?? 'open') === 'open'
  const worth = needs.filter((n: Row) => n.type !== 'desire' && (n.user_priority ? n.user_priority !== 'low' : Number(n.priority_score ?? 0) >= threshold))

  return (
    <main className="wide shop">
      <p className="eyebrow">Personal Shopper · <Link href="/compras/estilista">Estilista</Link> · <Link href="/compras/plan">Planificador</Link> · <Link href="/compras/buscar">Buscar productos</Link> · <Link href="/compras/productos">Candidatos</Link> · <Link href="/compras/fuentes">Fuentes</Link></p>
      <h1 className="display">¿Qué te falta de verdad?</h1>
      <p className="m">Analizo tu armario, la auditoría, tu perfil y cómo usas la ropa para decidir si hace falta comprar algo, qué y con qué prioridad. Primero la necesidad; después, si hace falta, los productos.</p>
      {sp.error && <p className="note warn" role="alert">{sp.error}</p>}
      {sp.analyzed != null && <p className="note" role="status">Análisis hecho: {sp.analyzed} necesidad{sp.analyzed === '1' ? '' : 'es'} nueva{sp.analyzed === '1' ? '' : 's'}, {sp.reassessed} reevaluada{sp.reassessed === '1' ? '' : 's'}.</p>}
      {sp.status === 'discarded' && <p className="note" role="status">Mostrando las descartadas.</p>}

      <form action={analyzeAction} className="btns"><PendingButton label="Analizar mi armario" pending="Analizando armario, uso y combinaciones…" /></form>
      <p className="chips">
        <Link className="chip" href="/compras" aria-current={open ? 'page' : undefined}>Abiertas</Link>
        {([['purchased', 'Compradas'], ['discarded', 'Descartadas'], ['all', 'Todas']] as const).map(([st, txt]) => <Link key={st} className="chip" href={`/compras?status=${st}`} aria-current={sp.status === st ? 'page' : undefined}>{txt}</Link>)}
      </p>

      {open && needs.length > 0 && (worth.length
        ? <p className="verdict"><b>Merece la pena comprar {worth.length === 1 ? 'una cosa' : `${worth.length} cosas`}.</b> El resto puede esperar o es un deseo.</p>
        : <p className="verdict"><b>Ahora mismo no necesitas comprar nada.</b> Ninguna necesidad supera tu umbral ({threshold}/100). Si quieres algo, apúntalo como deseo: está bien, solo hay que saberlo.</p>)}
      {!needs.length && <p className="m">{open ? 'No hay necesidades abiertas. Pulsa «Analizar mi armario» o añade una tú.' : 'No hay necesidades en este estado.'}</p>}

      {LEVELS.map((lv) => { const xs = needs.filter((n: Row) => n.priority === lv); return xs.length ? (
        <section key={lv} className="osec">
          <h2>Prioridad {LEVEL_LABEL[lv].toLowerCase()} <span className="m small">· {xs.length}</span></h2>
          <div className="combos">{xs.map((n: Row) => { const a = n.latest; const spec = NeedSpec.safeParse(n.spec); return (
            <Link key={n.id} href={`/compras/necesidades/${n.id}`} className={`need t-${n.type}`}>
              <span className="score" title="Prioridad calculada sobre 100">{n.priority_score ?? '—'}</span>
              <span className="st">{label(NEED_TYPES, n.type)} · {label(NEED_STATUSES, n.status)}{n.user_priority ? ' · fijada por ti' : ''}</span>
              <h3>{n.title}</h3>
              {spec.success && <p className="small">{specText(spec.data)}</p>}
              {n.rationale && <p className="m small">{n.rationale}</p>}
              {a && <p className="small">{a.new_outfits ? `+${a.new_outfits} conjuntos nuevos` : 'No abre conjuntos nuevos'} · ~{a.expected_wears_month} usos/mes{a.cost_per_wear?.value != null ? ` · ~${a.cost_per_wear.value} €/uso` : ''}{a.redundancy?.level === 'alta' ? ' · ya tienes algo muy parecido' : ''}</p>}
              <p className="m small">{label(NEED_ORIGINS, n.origin)}</p>
            </Link>) })}</div>
        </section>) : null })}

      <details className="howto osec"><summary>Añadir una necesidad o un deseo</summary>
        <form action={createNeedAction}>
          <label>Nombre<input name="title" required maxLength={120} placeholder="Pantalón de lana gris" /></label>
          <label>Tipo<select name="type" defaultValue="need">{NEED_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label} — {t.help}</option>)}</select></label>
          <SpecFields />
          <label>Sustituye a (solo sustituciones)<select name="replaces_garment_id" defaultValue=""><option value="">—</option>{(garments ?? []).map((g: Row) => <option key={g.id} value={g.id}>{garmentTitle(g)}</option>)}</select></label>
          <label>Precio mínimo (€)<input name="price_min" inputMode="decimal" /></label>
          <label>Precio máximo (€)<input name="price_max" inputMode="decimal" /></label>
          <label>La necesito antes de<input type="date" name="target_date" /></label>
          <label>Prioridad (opcional: si no, la calculo yo)<select name="user_priority" defaultValue=""><option value="">Que la calcule el estilista</option>{PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
          <label>Por qué (opcional)<input name="rationale" maxLength={600} /></label>
          <div className="btns"><button className="btn primary">Guardar</button></div>
        </form>
      </details>
    </main>
  )
}
