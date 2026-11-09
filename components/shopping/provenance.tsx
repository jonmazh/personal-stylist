import { FIELD_ORIGINS } from '@/lib/shopping/catalog/taxonomy'

/** Etiqueta de procedencia de un dato: tienda, feed, buscador, deducido, foto, IA o tú. */
export function Src({ fs, k }: { fs: Record<string, { source: string; at?: string }> | null | undefined; k: string }) {
  const v = fs?.[k]
  if (!v) return null
  const o = FIELD_ORIGINS.find((x) => x.id === v.source)
  return <span className={`src src-${v.source}`} title={`${o?.help ?? ''}${v.at ? ` · ${new Date(v.at).toLocaleDateString('es-ES')}` : ''}`}>{o?.label ?? v.source}</span>
}
