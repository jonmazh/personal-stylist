'use client'
import { useRef, useState } from 'react'

export type Staged = { key: string; file: File; role: string; preview: string }
type Role = { id: string; label: string }

/** Selector de fotos: camara del movil o galeria, varias a la vez, cada una con su funcion (frontal, etiqueta...). */
export function PhotoPicker({ roles, value, onChange, disabled }: { roles: Role[]; value: Staged[]; onChange: (v: Staged[]) => void; disabled?: boolean }) {
  const cam = useRef<HTMLInputElement>(null), gal = useRef<HTMLInputElement>(null)
  const [err, setErr] = useState('')
  function add(files: FileList | null) {
    setErr('')
    const list = [...(files ?? [])].filter((f) => f.type.startsWith('image/'))
    if (files?.length && !list.length) setErr('Solo se admiten imágenes')
    const used = new Set(value.map((v) => v.role))
    const next = list.map((file, i) => {
      // Primera foto frontal; despues, la siguiente funcion libre
      const role = roles.find((r) => !used.has(r.id) && r.id !== 'worn' && r.id !== 'other')?.id ?? 'other'
      used.add(role)
      return { key: `${Date.now()}-${i}-${file.name}`, file, role, preview: URL.createObjectURL(file) }
    })
    onChange([...value, ...next])
  }
  return (
    <div className="picker">
      <div className="btns" style={{ marginTop: 0 }}>
        <button type="button" className="btn" onClick={() => cam.current?.click()} disabled={disabled}>Hacer foto</button>
        <button type="button" className="btn quiet" onClick={() => gal.current?.click()} disabled={disabled}>Elegir de la galería</button>
        <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { add(e.target.files); e.target.value = '' }} aria-label="Hacer foto de la prenda" />
        <input ref={gal} type="file" accept="image/*" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = '' }} aria-label="Elegir fotos de la prenda" />
      </div>
      {err && <p className="warn small">{err}</p>}
      {value.length > 0 && (
        <div className="staged">
          {value.map((s) => (
            <figure key={s.key}>
              <img src={s.preview} alt="" />
              <select value={s.role} onChange={(e) => onChange(value.map((x) => (x.key === s.key ? { ...x, role: e.target.value } : x)))} aria-label="Qué muestra esta foto">
                {roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
              <button type="button" className="btn quiet small" onClick={() => onChange(value.filter((x) => x.key !== s.key))}>Quitar</button>
            </figure>
          ))}
        </div>
      )}
      <p className="m small">Frontal primero. Para pantalones, una foto de perfil o posterior ayuda a ver tiro y pernera; la etiqueta permite confirmar talla y composición; una foto llevándola servirá para valorar el ajuste.</p>
    </div>
  )
}
