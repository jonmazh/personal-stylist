import Link from 'next/link'
import { getUser } from '@/lib/supabase/server'
import { latestAudit } from '@/lib/wardrobe/audit-service'
import { MIN_AUDIT } from '@/lib/wardrobe/audit'
import { DECISIONS, decisionLabel } from '@/lib/wardrobe/compatibility'
import { listGarments, wardrobeSummary } from '@/lib/wardrobe/service'
import { garmentTitle } from '@/lib/wardrobe/display'
import { SEASONS } from '@/lib/wardrobe/taxonomy'
import { decideFindingAction, generateAuditAction } from '../actions'

type Row = Record<string, any>
const fmt = (iso: string) => new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const num = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('es-ES', { maximumFractionDigits: 1 }))
const COV: Record<string, string> = { 'Bien cubierta': 'ok', 'Necesita revisión': 'warn', 'Falta variedad': 'warn', 'Sin prendas': 'bad' }
const SECTIONS: [string, string, string][] = [
  ['need', 'Necesidades prioritarias', 'Lo que más falta, según tu inventario real, tu perfil y tu semana. Aprueba las que quieras convertir en tu lista de necesidades (base de las compras de la fase 4).'],
  ['duplicate', 'Duplicados potenciales', 'Prendas que cumplen casi la misma función. Que sean parecidas no obliga a descartar ninguna: la recomendación se basa en la utilidad real.'],
  ['alteration', 'Prendas que necesitan arreglos', ''],
  ['replace', 'Prendas propuestas para sustituir o donar', 'Nada se archiva ni se borra solo: aprobar registra tu decisión; archivarla es otro paso tuyo.'],
  ['gap', 'Categorías que necesitan revisión', ''],
  ['condition', 'Estado de conservación', ''],
  ['review', 'Prendas por revisar', 'Completar estas fichas hace la auditoría más fiable.'],
]

function Finding({ f, names }: { f: Row; names: Map<string, string> }) {
  const rec = f.recommendation as { decision?: string; garment_id?: string; need?: string } | null
  const acceptLabel = rec?.decision && rec.garment_id ? `Aprobar: ${decisionLabel(rec.decision).toLowerCase()} «${names.get(rec.garment_id) ?? 'prenda'}»` : rec?.need ? 'Añadir a mis necesidades' : 'De acuerdo'
  return (
    <article className={`afind st-${f.status}`} id={`f-${f.id}`}>
      <b>{f.title}</b>
      <p>{f.body}</p>
      {f.garment_ids.length > 0 && <p className="small">{f.garment_ids.map((id: string, i: number) => <span key={id}>{i ? ' · ' : ''}<Link href={`/armario/${id}?tab=compatibilidad`}>{names.get(id) ?? 'Prenda'}</Link></span>)}</p>}
      <details className="howto"><summary>Por qué y con qué datos</summary><ul className="m small">{(f.why as string[]).map((w, i) => <li key={i}>{w}</li>)}<li>Datos usados: {(f.data_used as string[]).join('; ')}.</li></ul></details>
      {f.status === 'proposed' ? (
        <form action={decideFindingAction} className="btns">
          <input type="hidden" name="finding_id" value={f.id} />
          <button className="btn small primary" name="action" value="accept">{acceptLabel}</button>
          <button className="btn small quiet" name="action" value="reject">Rechazar</button>
        </form>
      ) : (
        <p className={`state ${f.status === 'accepted' ? 'ok' : 'm'}`}>{f.status === 'accepted' ? 'Aprobada' : 'Rechazada'}{f.carried ? ' en una auditoría anterior' : ''}{f.decided_at ? ` · ${fmt(f.decided_at)}` : ''}</p>
      )}
    </article>
  )
}

/** Auditoría del armario (7.4): del artículo al conjunto, con recomendaciones justificadas que apruebas o rechazas. */
export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams
  const user = (await getUser())!
  const [data, summary, all] = await Promise.all([latestAudit(user.supabase, Number(sp.v) || undefined), wardrobeSummary(user.supabase).catch(() => null), listGarments(user.supabase, { status: 'all' }).catch(() => [])])
  const names = new Map(all.map((g) => [g.id as string, garmentTitle(g)]))
  const enough = (summary?.active ?? 0) >= MIN_AUDIT
  const a = data?.audit, s = a?.summary as Row | undefined
  const latest = data && data.versions[0]?.version === a?.version
  return (
    <main className="wide">
      <p className="eyebrow"><Link href="/armario">Mi armario</Link> · Auditoría</p>
      <h1 className="display">Auditoría del armario</h1>
      <p className="m">Analiza el armario como conjunto: estado de cada prenda, duplicados, arreglos, huecos frente a tu perfil y tu semana, y organización. No elimina ni decide nada: tú apruebas o rechazas cada recomendación.</p>
      {sp.generated && <p className="note" role="status">Auditoría v{sp.generated} generada.</p>}
      {sp.accept && <p className="note" role="status">Recomendación aprobada{sp.applied ? `: decisión «${decisionLabel(sp.applied)}» registrada en la prenda` : ''}.</p>}
      {sp.reject && <p className="note" role="status">Recomendación rechazada: no se volverá a proponer como nueva.</p>}
      {sp.error && <p className="note warn" role="alert">{sp.error}</p>}

      <form action={generateAuditAction} className="btns">
        <button className="btn primary" disabled={!enough}>{a ? 'Generar nueva auditoría' : 'Generar la primera auditoría'}</button>
        {!enough && <span className="m small">Necesitas al menos {MIN_AUDIT} prendas en el armario (ahora {summary?.active ?? 0}).</span>}
      </form>

      {!a && enough && <p className="m">Todavía no has hecho ninguna auditoría.</p>}
      {a && s && (<>
        <p className="state m">Versión {a.version} · {fmt(a.created_at)} · {a.garments_count} prendas{!latest ? ' · versión anterior' : ''}</p>
        {s.previous && <p className="m small">Desde la v{s.previous.version}: {a.garments_count - s.previous.garments >= 0 ? '+' : ''}{a.garments_count - s.previous.garments} prendas · duplicados {s.previous.duplicates} → {s.duplicates} · compatibilidad media {num(s.previous.avgCompat)} → {num(s.avgCompat)}.</p>}

        <h2>Clasificación por estado</h2>
        <div className="stats">
          {DECISIONS.map((d) => <Link key={d.id} href={`/armario?decision=${d.id}`}><b>{s.byDecision[d.id] ?? 0}</b><span>{d.label}</span></Link>)}
          <Link href="/armario?decision=none"><b>{s.byDecision.none ?? 0}</b><span>Sin decidir</span></Link>
          <Link href="/armario?status=archived"><b>{s.archived}</b><span>Archivadas</span></Link>
        </div>
        <p className="m small">Compatibilidad media {num(s.avgCompat)} ({s.evaluated} de {s.garments} evaluables) · {s.fitted} con prueba de ajuste · {s.drafts} borradores.</p>

        <h2>Diagnóstico del armario</h2>
        <div className="covgrid">{(s.categories as Row[]).map((c) => (
          <div key={c.id} className="cov"><span className="st">{c.label}</span><b className={`state ${COV[c.status]}`}>{c.status}</b><span className="m small">{c.why}</span></div>
        ))}</div>
        {(s.occasions as Row[]).length > 0 && (<>
          <h3>Ocasiones de tu semana</h3>
          <ul className="occ">{(s.occasions as Row[]).map((o) => <li key={o.occasion}><b>{o.label}</b> <span className="m small">{o.pct} %</span> · {o.covered ? <span className="state ok">Cubierta</span> : <span className="state warn">Falta {o.missing.map((m: string) => ({ top: 'parte superior', bottom: 'parte inferior', footwear: 'calzado' } as Record<string, string>)[m]).join(', ')}</span>}</li>)}</ul>
        </>)}

        {SECTIONS.map(([kind, title, intro]) => {
          const fs = data!.findings.filter((f) => f.kind === kind)
          if (!fs.length) return kind === 'duplicate' ? <section key={kind}><h2>{title}</h2><p className="m">No he encontrado prendas que se solapen.</p></section> : null
          return (
            <section key={kind}>
              <h2>{title} <span className="m small">· {fs.length}</span></h2>
              {intro && <p className="m small">{intro}</p>}
              <div className="afinds">{fs.map((f) => <Finding key={f.id} f={f} names={names} />)}</div>
            </section>
          )
        })}

        <h2>Temporadas y organización</h2>
        <dl className="kv">
          {SEASONS.map((x) => [<dt key={`t${x.id}`}>{x.label}</dt>, <dd key={`d${x.id}`}>{s.seasons[x.id] ?? 0} prendas</dd>])}
          <dt>Sin temporada</dt><dd>{s.noSeason} prendas</dd>
          <dt>Ubicación</dt><dd>{Object.entries(s.locations as Record<string, number>).map(([k, v]) => `${k}: ${v}`).join(' · ')}</dd>
          <dt>Frecuencia de uso</dt><dd>{s.usage}</dd>
        </dl>

        {data!.versions.length > 1 && (<>
          <h3>Auditorías anteriores</h3>
          <ul className="events">{data!.versions.map((v) => <li key={v.id}><Link href={`/armario/auditoria?v=${v.version}`}>Versión {v.version}</Link> <span className="m small">· {fmt(v.created_at)} · {v.garments_count} prendas</span></li>)}</ul>
        </>)}
      </>)}
      <p className="m small" style={{ marginTop: 28 }}><Link href="/armario">← Volver al armario</Link></p>
    </main>
  )
}
