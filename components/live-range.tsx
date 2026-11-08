'use client'
import { useState } from 'react'

/** Deslizador con el valor visible mientras se mueve. */
export function LiveRange({ name, label, value, suffix = ' %' }: { name: string; label: string; value: number; suffix?: string }) {
  const [v, setV] = useState(value)
  return (
    <label className="range-row"><span>{label}</span>
      <input type="range" name={name} min={0} max={100} step={5} value={v} onChange={(e) => setV(Number(e.target.value))} aria-label={`${label}, porcentaje del armario`} />
      <span>{v}{suffix}</span></label>
  )
}
