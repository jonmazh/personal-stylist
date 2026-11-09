'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { analyzeGarmentAction } from '@/app/(app)/armario/actions'

/** Lanza el analisis de la prenda. «Forzar» repite la llamada aunque las fotos no hayan cambiado. */
export function AnalyzeButton({ garmentId, label, force, primary }: { garmentId: string; label: string; force?: boolean; primary?: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function run() {
    setBusy(true); setErr('')
    const r = await analyzeGarmentAction(garmentId, !!force)
    setBusy(false)
    if (r.error) { setErr(r.error); return }
    router.push(`/armario/${garmentId}?tab=analisis${r.cached ? '&cached=1' : '&analyzed=1'}`)
    router.refresh()
  }
  return (
    <span className="abtn">
      <button type="button" className={`btn${primary ? ' primary' : ''}`} onClick={run} disabled={busy}>{busy ? 'Analizando…' : label}</button>
      {busy && <span className="m small" role="status">La IA está mirando las fotos; tarda unos segundos.</span>}
      {err && <span className="note warn" role="alert">{err}</span>}
    </span>
  )
}
