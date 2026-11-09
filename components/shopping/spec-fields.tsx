import { GARMENT_COLORS, GROUPS, OCCASIONS, SEASONS, SILHOUETTES, SUBS } from '@/lib/wardrobe/taxonomy'

type Row = Record<string, any>
/** Campos de la prenda buscada (criterios, no un producto). */
export function SpecFields({ spec = {} as Row }: { spec?: Row }) {
  const has = (k: string, v: string) => (spec[k] ?? []).includes(v)
  return (<>
    <label>Categoría<select name="category" required defaultValue={spec.category ?? ''}><option value="" disabled>Elige</option>{GROUPS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}</select></label>
    <label>Tipo (opcional)<select name="subcategory" defaultValue={spec.subcategory ?? ''}><option value="">Cualquiera</option>{GROUPS.map((g) => <optgroup key={g.id} label={g.label}>{SUBS.filter((x) => x.group === g.id).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</optgroup>)}</select></label>
    <fieldset className="chk-row"><legend>Colores (hasta 4)</legend>{GARMENT_COLORS.map((c) => <label key={c} className="chk"><input type="checkbox" name="colors" value={c} defaultChecked={has('colors', c)} /> {c}</label>)}</fieldset>
    <label>Corte (opcional)<input name="cut" maxLength={30} defaultValue={spec.cut ?? ''} placeholder="Recto, Wide…" /></label>
    <label>Silueta<select name="silhouette" defaultValue={spec.silhouette ?? ''}><option value="">—</option>{SILHOUETTES.map((x) => <option key={x}>{x}</option>)}</select></label>
    <label>Formalidad mín.<select name="formality_min" defaultValue={spec.formality_min ?? ''}><option value="">—</option>{[1, 2, 3, 4, 5].map((x) => <option key={x}>{x}</option>)}</select></label>
    <label>Formalidad máx.<select name="formality_max" defaultValue={spec.formality_max ?? ''}><option value="">—</option>{[1, 2, 3, 4, 5].map((x) => <option key={x}>{x}</option>)}</select></label>
    <fieldset className="chk-row"><legend>Temporadas</legend>{SEASONS.map((x) => <label key={x.id} className="chk"><input type="checkbox" name="seasons" value={x.id} defaultChecked={has('seasons', x.id)} /> {x.label}</label>)}</fieldset>
    <fieldset className="chk-row"><legend>Ocasiones</legend>{OCCASIONS.map((x) => <label key={x.id} className="chk"><input type="checkbox" name="occasions" value={x.id} defaultChecked={has('occasions', x.id)} /> {x.label}</label>)}</fieldset>
    <label>Materiales (opcional)<input name="materials" maxLength={120} defaultValue={spec.materials ?? ''} placeholder="Lana, algodón grueso…" /></label>
    <label>Detalles (opcional)<input name="details" maxLength={400} defaultValue={spec.details ?? ''} /></label>
  </>)
}
