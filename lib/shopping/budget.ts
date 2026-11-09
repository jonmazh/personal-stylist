import { BUDGET_PERIODS } from './taxonomy'

/**
 * Presupuesto de compras (fase 4A). Sirve para no pasarse, nunca para gastar: si no hay nada que merezca la pena,
 * lo correcto es no comprar. Comprometido = necesidades aprobadas o compradas en el periodo (por su precio maximo).
 */
type Row = Record<string, any>
const DAY = 864e5
/** Periodo vigente: los ciclos se cuentan desde la fecha de inicio. */
export function currentWindow(b: { period: string; starts_on: string }, now = new Date()) {
  const months = BUDGET_PERIODS.find((p) => p.id === b.period)?.months ?? 1
  const start = new Date(`${b.starts_on}T00:00:00Z`)
  let from = new Date(start)
  if (now >= start) { const elapsed = (now.getUTCFullYear() - start.getUTCFullYear()) * 12 + (now.getUTCMonth() - start.getUTCMonth()) - (now.getUTCDate() < start.getUTCDate() ? 1 : 0); const cycles = Math.floor(elapsed / months); from = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + cycles * months, start.getUTCDate())) }
  const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + months, from.getUTCDate()))
  return { from: from.toISOString().slice(0, 10), to: new Date(to.getTime() - DAY).toISOString().slice(0, 10) }
}

export function budgetStatus(budget: Row | null, needs: Row[], now = new Date()) {
  if (!budget) return null
  const w = currentWindow(budget as never, now)
  const inWindow = (d?: string | null) => !!d && d.slice(0, 10) >= w.from && d.slice(0, 10) <= w.to
  const price = (n: Row) => Number(n.price_max ?? n.price_min ?? 0)
  const committedNeeds = needs.filter((n) => ['approved', 'purchased'].includes(n.status) && inWindow(n.status_changed_at))
  const committed = committedNeeds.reduce((s, n) => s + price(n), 0)
  const amount = Number(budget.amount)
  const available = Math.round((amount - committed) * 100) / 100
  const highOpen = needs.filter((n) => ['detected', 'searching', 'listed', 'comparing', 'watching'].includes(n.status) && (n.user_priority ?? n.priority_level) === 'high')
  const plannedHigh = highOpen.reduce((s, n) => s + price(n), 0)
  const unpriced = committedNeeds.filter((n) => n.price_max == null && n.price_min == null).length + highOpen.filter((n) => n.price_max == null && n.price_min == null).length
  const warnings: string[] = []
  if (committed > amount) warnings.push(`Lo aprobado (${committed.toFixed(2)} ${budget.currency}) supera el presupuesto de este periodo.`)
  else if (plannedHigh > available) warnings.push(`Las necesidades de prioridad alta (${plannedHigh.toFixed(2)} ${budget.currency}) superan lo disponible: habrá que elegir o esperar.`)
  if (unpriced) warnings.push(`${unpriced} necesidad${unpriced === 1 ? '' : 'es'} sin precio objetivo: no puedo contarla${unpriced === 1 ? '' : 's'} en el presupuesto.`)
  const advice = !highOpen.length && !committedNeeds.length ? 'No hay ninguna compra prioritaria: no hace falta gastar este presupuesto.' : null
  return { ...w, amount, currency: budget.currency as string, committed, available, plannedHigh, committedCount: committedNeeds.length, warnings, advice, usedPct: amount ? Math.min(100, Math.round((committed / amount) * 100)) : 0 }
}
