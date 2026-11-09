'use client'
import { useState } from 'react'
import {
  ATTRIBUTES, COLOR_SWATCH, COMPOSITION_SOURCES, CONDITIONS, CUTS, GARMENT_COLORS, GROUPS, OCCASIONS, PATTERNS, SEASONS, SILHOUETTES, familyOf,
} from '@/lib/wardrobe/taxonomy'

type G = Record<string, any>
const Chips = ({ name, options, value, multi }: { name: string; options: { id: string; label: string }[]; value: string | string[] | null | undefined; multi?: boolean }) => (
  <div className="opts">{options.map((o) => (
    <label key={o.id}><input type={multi ? 'checkbox' : 'radio'} name={name} value={o.id} defaultChecked={multi ? (value as string[] | undefined)?.includes(o.id) : value === o.id} />{o.label}</label>
  ))}</div>
)
const L = (xs: string[]) => xs.map((x) => ({ id: x, label: x }))

/**
 * Campos de la ficha de una prenda, guiados por la taxonomia: al cambiar el tipo de prenda
 * aparecen su corte y sus caracteristicas tecnicas.
 */
export function GarmentFields({ initial = {}, styles, allowEmptyCategory }: { initial?: G; styles: { id: string; name: string }[]; allowEmptyCategory?: boolean }) {
  const [category, setCategory] = useState<string>(initial.category ?? (allowEmptyCategory ? '' : 'top'))
  const [sub, setSub] = useState<string>(initial.subcategory ?? '')
  const group = GROUPS.find((g) => g.id === category)
  const family = familyOf(sub || null, category || undefined)
  const attrs = ATTRIBUTES[family]
  const cuts = CUTS[family]
  const a: Record<string, string> = initial.attributes ?? {}

  return (
    <div className="gfields">
      <section>
        <h3>Identificación</h3>
        <div className="grid">
          <label>Nombre (opcional)<input name="name" defaultValue={initial.name ?? ''} placeholder="Pantalón gris de lana" /></label>
          <label>Categoría
            <select name="category" value={category} onChange={(e) => { setCategory(e.target.value); setSub('') }}>
              {allowEmptyCategory && <option value="">Sin indicar · que la proponga la IA</option>}
              <optgroup label="Principales">{GROUPS.filter((g) => g.primary).map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}</optgroup>
              <optgroup label="Más categorías">{GROUPS.filter((g) => !g.primary).map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}</optgroup>
            </select></label>
          <label>Tipo de prenda
            <select name="subcategory" value={sub} onChange={(e) => setSub(e.target.value)}>
              <option value="">Sin indicar</option>
              {(group?.subs ?? []).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select></label>
          <label>Color principal
            <select name="primary_color" defaultValue={initial.primary_color ?? ''}>
              <option value="">Sin indicar</option>{GARMENT_COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select></label>
        </div>
        <details className="howto" open={(initial.secondary_colors ?? []).length > 0}><summary>Colores secundarios (opcional)</summary>
          <div className="opts">{GARMENT_COLORS.map((c) => (
            <label key={c}><input type="checkbox" name="secondary_colors" value={c} defaultChecked={(initial.secondary_colors ?? []).includes(c)} /><i className="dot" style={{ background: COLOR_SWATCH[c] }} />{c}</label>
          ))}</div></details>
        <fieldset className="q"><legend>Estampado</legend><Chips name="pattern" options={L(PATTERNS)} value={initial.pattern} /></fieldset>
        {cuts.length > 0 && <fieldset className="q" key={`cut-${family}`}><legend>Corte</legend><Chips name="cut" options={L(cuts)} value={initial.cut} /></fieldset>}
        <fieldset className="q"><legend>Silueta</legend><Chips name="silhouette" options={L(SILHOUETTES)} value={initial.silhouette} /></fieldset>
        <fieldset className="q"><legend>Formalidad (1 muy informal · 5 traje)</legend><Chips name="formality_level" options={[1, 2, 3, 4, 5].map((n) => ({ id: String(n), label: String(n) }))} value={initial.formality_level ? String(initial.formality_level) : null} /></fieldset>
        <fieldset className="q"><legend>Temporadas</legend><Chips name="seasons" options={SEASONS} value={initial.seasons ?? []} multi /></fieldset>
        <fieldset className="q"><legend>Ocasiones</legend><Chips name="occasions" options={OCCASIONS} value={initial.occasions ?? []} multi /></fieldset>
        <details className="howto"><summary>Estilo (opcional, hasta 4)</summary>
          <div className="opts">{styles.map((st) => <label key={st.id}><input type="checkbox" name="style_tags" value={st.id} defaultChecked={(initial.style_tags ?? []).includes(st.id)} />{st.name}</label>)}</div>
        </details>
      </section>

      {attrs.length > 0 && (
        <section key={`attrs-${family}`}>
          <h3>Características técnicas</h3>
          {attrs.map((d) => <fieldset className="q" key={d.key}><legend>{d.label}</legend><Chips name={`attr_${d.key}`} options={L(d.options)} value={a[d.key]} /></fieldset>)}
        </section>
      )}

      <section>
        <h3>Materiales y composición</h3>
        <p className="m small">El material aparente es lo que parece a la vista; la composición solo es confirmada si viene de la etiqueta, la ficha comercial o tú.</p>
        <div className="grid">
          <label>Material aparente<input name="apparent_material" defaultValue={initial.apparent_material ?? ''} placeholder="Parece sarga de lana" /></label>
          <label>Composición confirmada<input name="confirmed_composition" defaultValue={initial.confirmed_composition ?? ''} placeholder="55 % lino, 45 % algodón" /></label>
          <label>Origen de la composición
            <select name="composition_source" defaultValue={initial.composition_source ?? ''}>
              <option value="">—</option>{COMPOSITION_SOURCES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select></label>
        </div>
      </section>

      <section>
        <h3>Información comercial y personal</h3>
        <div className="grid">
          <label>Marca<input name="brand" defaultValue={initial.brand ?? ''} /></label>
          <label>Talla de la etiqueta<input name="size_label" defaultValue={initial.size_label ?? ''} placeholder="M, 42…" /></label>
          <label>Talla que te funciona<input name="size_fit" defaultValue={initial.size_fit ?? ''} placeholder="En esta marca, una menos" /></label>
          <label>Precio de compra (€)<input name="purchase_price" type="number" step="0.01" min={0} inputMode="decimal" defaultValue={initial.purchase_price ?? ''} /></label>
          <label>Fecha de compra<input name="purchase_date" type="date" defaultValue={initial.purchase_date ?? ''} /></label>
          <label>Tienda<input name="store" defaultValue={initial.store ?? ''} /></label>
          <label>Usos estimados<input name="estimated_uses" type="number" min={0} inputMode="numeric" defaultValue={initial.estimated_uses ?? ''} /></label>
          <label>Ubicación<input name="location" defaultValue={initial.location ?? ''} placeholder="Armario del dormitorio" /></label>
        </div>
        <fieldset className="q"><legend>Estado de conservación</legend><Chips name="condition" options={CONDITIONS} value={initial.condition ?? 'desconocido'} /></fieldset>
        <label>Notas<textarea name="notes" rows={2} defaultValue={initial.notes ?? ''} /></label>
      </section>
    </div>
  )
}
