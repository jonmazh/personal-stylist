'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function AnalyzeButton({ disabled }: { disabled: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  async function run() {
    setBusy(true); setMsg('')
    const r = await fetch('/api/ai/analyze-photos', { method: 'POST' })
    const j = await r.json().catch(() => ({}))
    setMsg(r.ok ? `${j.count} observaciones nuevas. Entrarán en el próximo Blueprint.` : j.error ?? 'No se pudo analizar')
    setBusy(false)
    if (r.ok) router.refresh()
  }
  return (
    <div>
      <button type="button" className="btn primary" onClick={run} disabled={busy || disabled}>{busy ? 'Analizando…' : 'Analizar fotos con IA'}</button>
      {msg && <p className="msg">{msg}</p>}
    </div>
  )
}
