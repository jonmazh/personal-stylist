import { loadBundle } from '@/lib/profile/data'
import { MIN_AUDIT, buildAudit } from './audit'
import { decideGarment, evaluationsForList } from './eval-service'
import { WardrobeError, listGarments, type Sb } from './service'

const missingTable = (m?: string) => !!m && /schema cache|does not exist/i.test(m)

/** Genera una auditoria nueva (bajo demanda). Recuerda lo que aprobaste o rechazaste en auditorias anteriores. */
export async function generateAudit(sb: Sb, uid: string) {
  const [active, drafts, archived, b] = await Promise.all([
    listGarments(sb, { status: 'active' }), listGarments(sb, { status: 'draft' }), listGarments(sb, { status: 'archived' }), loadBundle(sb, uid),
  ])
  if (active.length < MIN_AUDIT) throw new WardrobeError(`La auditoría necesita al menos ${MIN_AUDIT} prendas en tu armario (ahora tienes ${active.length}).`)
  const [evals, { data: wears }] = await Promise.all([evaluationsForList(sb, uid, active, b), sb.from('outfit_wear_events').select('worn_on, garment_ids').limit(2000)])
  const audit = buildAudit({ active, drafts, archived: archived.length, evals, bundle: b, wears: wears ?? [] })
  const { data: prev, error: pe } = await sb.from('wardrobe_audits').select('*').order('version', { ascending: false }).limit(1).maybeSingle()
  if (pe) throw new WardrobeError(missingTable(pe.message) ? 'Ejecuta la migración 0010 en Supabase.' : pe.message, 500)
  const prevFindings = prev ? (await sb.from('wardrobe_audit_findings').select('key, status, decided_at').eq('audit_id', prev.id)).data ?? [] : []
  const decided = new Map(prevFindings.filter((f) => f.status !== 'proposed').map((f) => [f.key, f]))
  const ps = prev?.summary
  const summary = {
    ...audit.summary,
    previous: ps ? { version: prev.version, at: prev.created_at, garments: ps.garments, duplicates: ps.duplicates, avgCompat: ps.avgCompat, needs: prevFindings.filter((f) => f.key.startsWith('need:')).length } : null,
  }
  const { data: row, error } = await sb.from('wardrobe_audits').insert({ user_id: uid, version: (prev?.version ?? 0) + 1, garments_count: active.length, summary }).select('*').single()
  if (error) throw new WardrobeError(error.message, 500)
  if (audit.findings.length) {
    const { error: fe } = await sb.from('wardrobe_audit_findings').insert(audit.findings.map((f) => {
      const d = decided.get(f.key)
      return { user_id: uid, audit_id: row.id, key: f.key, kind: f.kind, title: f.title, body: f.body, why: f.why, data_used: f.data_used, garment_ids: f.garment_ids, recommendation: f.recommendation ?? null, priority: f.priority, status: d?.status ?? 'proposed', carried: !!d, decided_at: d?.decided_at ?? null }
    }))
    if (fe) throw new WardrobeError(fe.message, 500)
  }
  await sb.from('ai_runs').insert({ user_id: uid, kind: 'wardrobe_audit', model: 'reglas', meta: { audit_id: row.id, version: row.version, findings: audit.findings.length, cached: false } })
  return row
}

export async function latestAudit(sb: Sb, version?: number) {
  let q = sb.from('wardrobe_audits').select('*').order('version', { ascending: false })
  if (version) q = q.eq('version', version)
  const { data: audit, error } = await q.limit(1).maybeSingle()
  if (error) { if (missingTable(error.message)) return null; throw new WardrobeError(error.message, 500) }
  if (!audit) return null
  const [{ data: findings }, { data: versions }] = await Promise.all([
    sb.from('wardrobe_audit_findings').select('*').eq('audit_id', audit.id).order('priority').order('created_at'),
    sb.from('wardrobe_audits').select('id, version, created_at, garments_count').order('version', { ascending: false }).limit(20),
  ])
  return { audit, findings: findings ?? [], versions: versions ?? [] }
}

/**
 * Aprobar o rechazar una recomendacion. Aprobar una que propone una decision la registra como TU decision
 * (con el motivo «Auditoria vN»); aprobar una necesidad la añade a tus necesidades aprobadas. Nada se archiva ni se borra.
 */
export async function decideFinding(sb: Sb, uid: string, findingId: string, action: 'accept' | 'reject') {
  const { data: f } = await sb.from('wardrobe_audit_findings').select('*, wardrobe_audits(version)').eq('id', findingId).maybeSingle()
  if (!f) throw new WardrobeError('Hallazgo no encontrado', 404)
  const rec = f.recommendation as { decision?: string; garment_id?: string } | null
  let applied: string | null = null
  if (action === 'accept' && rec?.decision && rec.garment_id) {
    await decideGarment(sb, uid, rec.garment_id, { decision: rec.decision, reason: `Auditoría v${f.wardrobe_audits?.version}: ${f.title}`.slice(0, 500) })
    applied = rec.decision
  }
  await sb.from('wardrobe_audit_findings').update({ status: action === 'accept' ? 'accepted' : 'rejected', decided_at: new Date().toISOString() }).eq('id', findingId)
  return { status: action === 'accept' ? 'accepted' : 'rejected', applied }
}

/** Necesidades aprobadas en cualquier auditoria (base de la lista de compras de la fase 4). */
export async function approvedNeeds(sb: Sb) {
  const { data, error } = await sb.from('wardrobe_audit_findings').select('key, title, body, decided_at, created_at').eq('kind', 'need').eq('status', 'accepted').order('created_at', { ascending: false })
  if (error) return []
  const seen = new Set<string>()
  return (data ?? []).filter((x) => (seen.has(x.key) ? false : (seen.add(x.key), true)))
}
