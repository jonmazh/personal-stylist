'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { assessFitAction } from '@/app/(app)/armario/actions'

/** Pide a la IA una propuesta de ajuste con las fotos «llevándola puesta». */
export function FitButton({ garmentId, label }: { garmentId: string; label: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function run() {
    setBusy(true); setErr('')
    const r = await assessFitAction(garmentId)
    setBusy(false)
    if (r.error) { setErr(r.error); return }
    router.push(`/armario/${garmentId}?tab=ajuste&assessed=1`); router.refresh()
  }
  return (
    <span className="abtn">
      <button type="button" className="btn primary" onClick={run} disabled={busy}>{busy ? 'Evaluando…' : label}</button>
      {busy && <span className="m small" role="status">La IA está mirando cómo te queda; tarda unos segundos.</span>}
      {err && <span className="note warn" role="alert">{err}</span>}
    </span>
  )
}
