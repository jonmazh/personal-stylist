import type { Finding } from './blueprint'

export type ReviewStatus = 'pending' | 'confirmed' | 'corrected'
export interface ReviewedFinding { title: string; body: string; status: ReviewStatus | string; corrected_body?: string | null }

/**
 * Al generar una nueva version del Blueprint, conserva lo que el usuario ya reviso.
 * Regla: la conclusion se identifica por su titulo (estable para las reglas del perfil).
 *  - Mismo texto que en la version anterior → se mantiene confirmada o corregida.
 *  - Texto distinto (cambiaron los datos) → vuelve a pendiente: hay que revisarla de nuevo.
 *  - Conclusion nueva → pendiente.
 */
export function carryReviews(prev: readonly Record<string, any>[], next: Finding[]) {
  const byTitle = new Map(prev.map((p) => [p.title, p]))
  return next.map((f) => {
    const p = byTitle.get(f.title)
    if (p && p.status !== 'pending' && p.body === f.body)
      return { ...f, status: p.status as ReviewStatus, corrected_body: p.status === 'corrected' ? p.corrected_body ?? null : null }
    return { ...f, status: 'pending' as ReviewStatus, corrected_body: null }
  })
}

/** Aviso para una conclusion pendiente que el usuario si habia revisado en la version anterior. */
export function reviewHint(prev: readonly Record<string, any>[] | undefined, f: Record<string, any>, prevVersion?: number): string | null {
  if (!prev || f.status !== 'pending') return null
  const p = prev.find((x) => x.title === f.title)
  if (!p || p.status === 'pending' || p.body === f.body) return null
  return `Ha cambiado desde la v${prevVersion ?? '?'}, donde la habías ${p.status === 'corrected' ? 'corregido' : 'confirmado'}. Revísala de nuevo.`
}
