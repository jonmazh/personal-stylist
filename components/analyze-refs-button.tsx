'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function AnalyzeRefsButton({ pending }: { pending: number }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  async function run() {
    setBusy(true); setMsg('')
    const r = await fetch('/api/ai/analyze-references', { method: 'POST' })
    const j = await r.json().catch(() => ({}))
    setMsg(r.ok ? `${j.count} ${j.count === 1 ? 'referencia analizada' : 'referencias analizadas'}: ya cuentan en tu Style DNA.` : j.error ?? 'No se pudo analizar')
    setBusy(false)
    if (r.ok) router.refresh()
  }
  return (
    <div className="btns">
      <button type="button" className="btn" onClick={run} disabled={busy || pending === 0}>{busy ? 'Analizando…' : `Analizar ${pending || ''} con IA`.replace('  ', ' ')}</button>
      {msg && <p className="msg">{msg}</p>}
    </div>
  )
}
