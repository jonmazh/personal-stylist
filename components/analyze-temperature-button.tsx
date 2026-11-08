'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

/** Lanza la estimacion de la temperatura cromatica con la foto de rostro. */
export function AnalyzeTemperatureButton({ disabled, again }: { disabled: boolean; again: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  async function run() {
    setBusy(true); setMsg('')
    const r = await fetch('/api/ai/analyze-temperature', { method: 'POST' })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) setMsg(j.error ?? 'No se pudo analizar')
    else setMsg(j.suitable ? `Estimación lista: ${j.label}.${j.deleted ? ' Como pediste, he borrado la foto y conservo solo el resultado.' : ''}` : 'La foto no sirve para estimar el color: mira el motivo abajo y sube otra.')
    setBusy(false)
    if (r.ok) router.refresh()
  }
  return (
    <div className="btns">
      <button type="button" className={again ? 'btn' : 'btn primary'} onClick={run} disabled={busy || disabled}>{busy ? 'Analizando…' : again ? 'Solicitar un nuevo análisis' : 'Analizar mi temperatura cromática'}</button>
      {msg && <p className="msg" role="status">{msg}</p>}
    </div>
  )
}
