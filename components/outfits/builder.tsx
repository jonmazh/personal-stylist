'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveOutfitAction } from '@/app/(app)/outfits/actions'
import { ITEM_ROLES, MAX_TAGS, OUTFIT_OCCASIONS, checkComposition, defaultRole, roleLabel, rolesFor } from '@/lib/outfits/taxonomy'
import { GROUPS, SEASONS } from '@/lib/wardrobe/taxonomy'

export interface PickG { id: string; title: string; subtitle: string; category: string | null; subcategory: string | null; primary_color: string | null; thumb_url: string | null; wardrobe_status: string; decision: string | null }
type Item = { id?: string; garment_id: string | null; role: string; title: string; thumb_url: string | null; missing?: boolean }
type Meta = { name: string; description: string; occasion: string; formality_level: string; seasons: string[]; tags: string }

/**
 * Constructor de conjuntos: eliges prendas de tu armario activo, cada una con su función, y puedes sustituirlas
 * o quitarlas. Las reglas estructurales se comprueban mientras construyes; no hay puntuación (llega en 3B).
 */
export function OutfitBuilder({ garments, initial }: { garments: PickG[]; initial?: { id: string; meta: Meta; items: Item[] } }) {
  const router = useRouter()
  const [meta, setMeta] = useState<Meta>(initial?.meta ?? { name: '', description: '', occasion: '', formality_level: '', seasons: [], tags: '' })
  const [items, setItems] = useState<Item[]>(initial?.items ?? [])
  const [picker, setPicker] = useState<null | { mode: 'add' } | { mode: 'replace'; index: number }>(initial?.items.length ? null : { mode: 'add' })
  const [cat, setCat] = useState('')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const byId = useMemo(() => new Map(garments.map((g) => [g.id, g])), [garments])
  const live = new Map<string, Record<string, any>>(garments.map((g) => [g.id, g]))
  const problems = checkComposition(items.filter((i) => i.garment_id && byId.has(i.garment_id)).map((i) => ({ garment_id: i.garment_id!, role: i.role })), live)
  const errors = problems.filter((p) => p.level === 'error')
  const used = new Set(items.map((i) => i.garment_id))
  const replacing = picker?.mode === 'replace' ? items[picker.index] : null
  const shown = garments.filter((g) => (!cat || g.category === cat) && (!q || `${g.title} ${g.subtitle} ${g.primary_color ?? ''}`.toLowerCase().includes(q.toLowerCase()))
    && (!replacing || rolesFor(g).includes(replacing.role as never)))

  function pick(g: PickG) {
    if (picker?.mode === 'replace') {
      setItems(items.map((it, i) => (i === picker.index ? { ...it, garment_id: g.id, title: g.title, thumb_url: g.thumb_url, missing: false } : it)))
      setPicker(null)
    } else {
      // Funcion por defecto: la primera libre de las que admite la prenda
      const free = rolesFor(g).find((r) => items.filter((i) => i.role === r).length < (ITEM_ROLES.find((x) => x.id === r)?.max ?? 1)) ?? defaultRole(g)
      setItems([...items, { garment_id: g.id, role: free, title: g.title, thumb_url: g.thumb_url }])
    }
  }
  const move = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= items.length) return; const n = [...items]; [n[i], n[j]] = [n[j], n[i]]; setItems(n) }

  async function save(status: 'draft' | 'saved') {
    setErr('')
    if (!meta.name.trim()) { setErr('Ponle un nombre al conjunto.'); return }
    if (!items.length) { setErr('Añade al menos una prenda.'); return }
    if (errors.length) { setErr(errors.map((e) => e.text).join(' ')); return }
    setBusy(true)
    const r = await saveOutfitAction({
      id: initial?.id,
      meta: { name: meta.name, description: meta.description, occasion: meta.occasion || null, formality_level: meta.formality_level ? Number(meta.formality_level) : null, seasons: meta.seasons, tags: meta.tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, MAX_TAGS), status },
      items: items.map((i) => ({ id: i.id, garment_id: i.garment_id, role: i.role })),
    })
    setBusy(false)
    if (r.error || !r.id) { setErr(r.error ?? 'No se pudo guardar'); return }
    const p = new URLSearchParams({ saved: '1' }); if (r.warnings?.length) p.set('warn', r.warnings.join(' '))
    router.push(`/outfits/${r.id}?${p}`); router.refresh()
  }

  return (
    <div className="obuilder">
      <section>
        <h3>Prendas del conjunto</h3>
        {!items.length && <p className="m">Todavía no has elegido prendas. Empieza por la parte superior o por la pieza que quieras lucir.</p>}
        <ol className="oitems">{items.map((it, i) => {
          const g = it.garment_id ? byId.get(it.garment_id) : undefined
          const opts = g ? rolesFor(g) : [it.role]
          return (
            <li key={`${it.id ?? 'n'}-${i}`} className={it.missing ? 'missing' : ''}>
              <span className="oth">{it.thumb_url ? <img src={it.thumb_url} alt="" /> : <span className="m small">Sin foto</span>}</span>
              <div className="oinfo">
                <b>{it.title}</b>
                {it.missing ? <span className="m small">Ya no está en tu armario activo</span> : (
                  <label className="small">Función
                    <select value={it.role} onChange={(e) => setItems(items.map((x, k) => (k === i ? { ...x, role: e.target.value } : x)))} aria-label={`Función de ${it.title}`}>
                      {opts.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
                    </select></label>
                )}
              </div>
              <div className="oacts">
                <button type="button" className="btn quiet small" onClick={() => move(i, -1)} disabled={!i} aria-label={`Subir ${it.title}`}>↑</button>
                <button type="button" className="btn quiet small" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label={`Bajar ${it.title}`}>↓</button>
                <button type="button" className="btn small" onClick={() => { setPicker({ mode: 'replace', index: i }); setCat('') }}>Sustituir</button>
                <button type="button" className="btn quiet small" onClick={() => setItems(items.filter((_, k) => k !== i))}>Quitar</button>
              </div>
            </li>
          )
        })}</ol>
        {problems.length > 0 && <ul className="oprob">{problems.map((p, i) => <li key={i} className={p.level === 'error' ? 'err' : 'warn'}>{p.level === 'error' ? 'No se puede guardar: ' : ''}{p.text}</li>)}</ul>}
        {!picker && <div className="btns"><button type="button" className="btn" onClick={() => setPicker({ mode: 'add' })}>Añadir prenda</button></div>}
      </section>

      {picker && (
        <section className="opicker" aria-label="Elegir prenda de tu armario">
          <h3>{replacing ? `Sustituir «${replacing.title}» (${roleLabel(replacing.role).toLowerCase()})` : 'Elige prendas de tu armario'}</h3>
          <p className="m small">Solo aparecen prendas de tu armario activo{replacing ? ' que pueden ocupar esa función' : ''}. {garments.length ? '' : 'Tu armario está vacío: añade prendas primero.'}</p>
          <div className="chips">
            <button type="button" className="chip" aria-pressed={!cat} onClick={() => setCat('')}>Todo</button>
            {GROUPS.filter((g) => garments.some((x) => x.category === g.id)).map((g) => <button type="button" key={g.id} className="chip" aria-pressed={cat === g.id} onClick={() => setCat(g.id)}>{g.label}</button>)}
          </div>
          <label>Buscar<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Color, tipo, nombre…" /></label>
          <div className="pgrid">{shown.map((g) => (
            <button type="button" key={g.id} className="pcard" disabled={used.has(g.id)} onClick={() => pick(g)} aria-label={`${replacing ? 'Elegir' : 'Añadir'} ${g.title}`}>
              <span className="oth">{g.thumb_url ? <img src={g.thumb_url} alt="" /> : <span className="m small">Sin foto</span>}</span>
              <b>{g.title}</b><span className="m small">{used.has(g.id) ? 'Ya en el conjunto' : g.subtitle}</span>
              {(g.decision === 'replace' || g.decision === 'donate_sell') && <span className="m small">Marcada para {g.decision === 'replace' ? 'sustituir' : 'donar'}</span>}
            </button>
          ))}{!shown.length && garments.length > 0 && <p className="m small">Ninguna prenda encaja con este filtro.</p>}</div>
          <div className="btns"><button type="button" className="btn quiet" onClick={() => setPicker(null)}>{replacing ? 'Cancelar' : 'Hecho'}</button></div>
        </section>
      )}

      <section>
        <h3>Datos del conjunto</h3>
        <div className="grid">
          <label>Nombre<input value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} maxLength={120} placeholder="Elegancia relajada" /></label>
          <label>Ocasión<select value={meta.occasion} onChange={(e) => setMeta({ ...meta, occasion: e.target.value })}><option value="">Sin indicar</option>{OUTFIT_OCCASIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
          <label>Formalidad<select value={meta.formality_level} onChange={(e) => setMeta({ ...meta, formality_level: e.target.value })}><option value="">Sin indicar</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}/5{n === 1 ? ' · muy informal' : n === 5 ? ' · traje' : ''}</option>)}</select></label>
          <label>Etiquetas (separadas por comas)<input value={meta.tags} onChange={(e) => setMeta({ ...meta, tags: e.target.value })} placeholder="verano, viaje" /></label>
        </div>
        <fieldset className="q"><legend>Temporadas</legend><div className="opts">{SEASONS.map((s) => (
          <label key={s.id}><input type="checkbox" checked={meta.seasons.includes(s.id)} onChange={(e) => setMeta({ ...meta, seasons: e.target.checked ? [...meta.seasons, s.id] : meta.seasons.filter((x) => x !== s.id) })} />{s.label}</label>
        ))}</div></fieldset>
        <label>Notas<textarea rows={2} value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} maxLength={1000} placeholder="Para cenas de otoño; con las mangas recogidas" /></label>
      </section>

      {err && <p className="note warn" role="alert">{err}</p>}
      <div className="btns">
        <button type="button" className="btn primary" onClick={() => save('saved')} disabled={busy}>{busy ? 'Guardando…' : 'Guardar conjunto'}</button>
        <button type="button" className="btn" onClick={() => save('draft')} disabled={busy}>Guardar como borrador</button>
      </div>
    </div>
  )
}
