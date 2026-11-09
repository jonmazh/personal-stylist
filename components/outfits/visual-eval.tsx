'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { processImage } from '@/lib/wardrobe/image-client'
import { evaluateVisualAction } from '@/app/(app)/outfits/learn-actions'

/**
 * Evaluación visual (modo B): una foto tuya con el conjunto puesto. Se reduce y se le quitan los metadatos en el
 * navegador, se sube a tu carpeta privada (outfits-private) y, salvo que pidas conservarla, se borra tras el análisis.
 */
export function VisualEval({ uid, outfitId, outfits }: { uid: string; outfitId?: string; outfits?: { id: string; name: string }[] }) {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [keep, setKeep] = useState(false)
  const [ok, setOk] = useState(false)
  const [target, setTarget] = useState(outfitId ?? '')
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  async function run() {
    if (!file) { setErr('Elige o haz una foto.'); return }
    if (!ok) { setErr('Confirma que entiendes cómo se trata la foto.'); return }
    setErr(''); setBusy('Preparando la foto…')
    try {
      const p = await processImage(file)
      const path = `${uid}/evaluations/${crypto.randomUUID()}.jpg`
      const up = await createClient().storage.from('outfits-private').upload(path, p.original, { contentType: 'image/jpeg' })
      if (up.error) throw new Error(up.error.message)
      setBusy('El estilista está mirando la foto…')
      const r = await evaluateVisualAction({ photo_path: path, outfit_id: target || null, keep_photo: keep })
      if (r.error || !r.id) throw new Error(r.error ?? 'No se pudo evaluar')
      router.push(`/outfits/evaluaciones/${r.id}`)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Error'); setBusy('') }
  }
  return (
    <div className="visualeval">
      <div className="btns">
        <label className="btn">Hacer foto<input type="file" accept="image/*" capture="user" hidden aria-label="Hacer foto del conjunto puesto" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
        <label className="btn quiet">Elegir de la galería<input type="file" accept="image/*" hidden aria-label="Elegir foto del conjunto puesto" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
        {file && <span className="m small">{file.name}</span>}
      </div>
      {outfits && <label>¿Qué conjunto llevas? (opcional)<select value={target} onChange={(e) => setTarget(e.target.value)}><option value="">No lo sé / ninguno guardado</option>{outfits.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>}
      <p className="m small">De cuerpo entero, de frente, con luz natural y postura relajada. La foto ayuda a ver el resultado, pero no permite verificar todos los detalles de ajuste: lo que no se vea, te lo diré.</p>
      <label className="chk"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /> Entiendo que la foto se guarda en mi carpeta privada solo para este análisis</label>
      <label className="chk"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> Conservar la foto después del análisis (si no, se borra)</label>
      {err && <p className="note warn" role="alert">{err}</p>}
      <div className="btns"><button type="button" className="btn primary" onClick={run} disabled={!!busy}>{busy || 'Evaluar con la foto'}</button></div>
    </div>
  )
}
