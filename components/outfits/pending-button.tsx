'use client'
import { useFormStatus } from 'react-dom'

/** Botón que indica que el estilista está trabajando (la IA y el motor tardan unos segundos). */
export function PendingButton({ label, pending, className = 'btn primary' }: { label: string; pending: string; className?: string }) {
  const { pending: busy } = useFormStatus()
  return (<>
    <button className={className} disabled={busy}>{busy ? pending : label}</button>
    {busy && <span className="m small" role="status">{pending}</span>}
  </>)
}
