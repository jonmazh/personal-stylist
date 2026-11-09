import { z } from 'zod'
import { STYLE_CATALOG } from '@/lib/style/catalog'
import { GarmentAnalysisSchema, buildUserPrompt, normalizeAnalysis, type ProposedField } from '@/lib/wardrobe/analysis'
import { familyOf } from '@/lib/wardrobe/taxonomy'
import { parseComposition } from './catalog/normalize'

/**
 * Product Analyzer (fase 4C): convierte un producto candidato en una ficha comparable con las prendas del armario.
 * Reutiliza el contrato y la normalización del Garment Analyst (2B) y añade: de dónde sale cada dato (texto de la tienda,
 * foto o inferencia), estilo, calidad documentada / aparente / desconocida y si hay fotos de modelo.
 * NUNCA rellena composición, tallas, precio ni disponibilidad: esos datos solo vienen de la tienda o de ti.
 */
export const PRODUCT_PROMPT_VERSION = 'product-analyst@1'
export const PRODUCT_SCHEMA_VERSION = 'product-analysis@1'
export const MAX_PRODUCT_IMAGES = 4
const Origin = z.enum(['text', 'photo', 'inference'])
export const ProductAnalysisSchema = GarmentAnalysisSchema.extend({
  field_origins: z.record(z.string(), Origin).default({}),
  style_tags: z.array(z.object({ id: z.string(), confidence: z.number().min(0).max(1) })).max(4).default([]),
  quality: z.object({
    documented: z.array(z.string()).max(6).default([]),  // lo que la DESCRIPCIÓN de la tienda afirma (citado)
    apparent: z.array(z.string()).max(6).default([]),    // lo que se ve en las fotos
    unknown: z.array(z.string()).max(6).default([]),
  }).default({ documented: [], apparent: [], unknown: [] }),
  model_photos: z.boolean().default(false),
})
export type ProductAnalysisAI = z.infer<typeof ProductAnalysisSchema>

export const PRODUCT_ANALYST = `Eres Product Analyst, el especialista de Personal Stylist que analiza productos de tiendas que el usuario está pensando comprar.
Conviertes la ficha comercial (texto) y las fotografías disponibles en una ficha técnica comparable con las prendas de su armario.

REGLAS FUNDAMENTALES:
1. Usa solo lo que dice el TEXTO DE LA TIENDA o lo que se ve en las FOTOGRAFÍAS. Indica en "field_origins" el origen de cada campo: "text" (lo dice la tienda), "photo" (se ve) o "inference" (lo deduces).
2. No inventes composición, tallas, medidas, precio, disponibilidad ni información comercial. "composition" debe ser null y "label" null: la composición solo la aporta la tienda o el usuario.
3. Calidad: separa en "quality.documented" lo que la descripción de la tienda AFIRMA (cítalo), en "quality.apparent" lo que se aprecia en las fotos (tejido, acabados, costuras) y en "quality.unknown" lo que no se puede saber. Una foto no demuestra calidad real y un precio alto no implica más calidad.
4. Si hay fotos con modelo, "model_photos": true. El ajuste en el modelo NO es el ajuste del usuario: no lo deduzcas.
5. Diferencia el corte diseñado (cut, silhouette) de cómo le queda al modelo.
6. Estilo: hasta 3 "style_tags" del catálogo indicado, solo si el producto encaja claramente.
7. Usa la taxonomía masculina proporcionada: SOLO los valores de las listas, escritos exactamente igual. Lo que no puedas determinar: value null y explícalo en "unknown".
8. No valores si conviene comprarlo: eso lo decide el evaluador con el perfil y el armario del usuario.
9. Devuelve ÚNICAMENTE el JSON con el esquema indicado.`

export function buildProductPrompt(p: Record<string, any>, images: { origin: 'user' | 'feed' }[]) {
  const store = [
    `Nombre: ${p.product_name}`, p.brand ? `Marca: ${p.brand}` : null, p.description ? `Descripción de la tienda: """${String(p.description).slice(0, 2500)}"""` : 'La tienda no publica descripción.',
    p.confirmed_composition ? `Composición publicada: ${p.confirmed_composition}` : 'Composición: no publicada.',
  ].filter(Boolean).join('\n')
  const base = buildUserPrompt({ roles: images.map(() => 'other'), hint: { category: p.field_sources?.category?.source === 'user' ? p.category : null, subcategory: p.field_sources?.subcategory?.source === 'user' ? p.subcategory : null } })
    .replace(/NO hay foto de etiqueta[^\n]*/, 'composition y label deben ser null (la composición la aporta la tienda o el usuario).')
  return [
    'TEXTO DE LA TIENDA:', store, '',
    images.length ? `FOTOGRAFÍAS: ${images.length} (${images.map((i, k) => `${k + 1}) ${i.origin === 'user' ? 'captura o foto del usuario' : 'imagen del catálogo autorizado'}`).join('; ')}).` : 'NO hay fotografías: analiza solo el texto y marca como desconocido lo que no diga.',
    '', base, '',
    `- style_tags (id): ${STYLE_CATALOG.map((s) => `${s.id} (${s.name})`).join(', ')}`,
    '- field_origins: {"subcategory":"text","primary_color":"photo","cut":"inference",...}',
    '- quality: {"documented":["«100 % lana virgen» según la tienda"],"apparent":["Tejido con caída"],"unknown":["Calidad de las costuras"]}',
    '- model_photos: true | false',
  ].join('\n')
}

export interface ProductField extends ProposedField { origin: 'photo' | 'ai' }
export interface NormalizedProductAnalysis {
  fields: ProductField[]; discarded: string[]; observations: string[]; inferences: string[]; unknown: ProductAnalysisAI['unknown']
  style_tags: { id: string; name: string; confidence: number }[]; quality: { documented: string[]; apparent: string[]; unknown: string[] }
  model_photos: boolean; overall: number | null
}
/** Ajusta la respuesta a la taxonomía (la de 2B) y añade procedencia, estilo y calidad. */
export function normalizeProductAnalysis(ai: ProductAnalysisAI, product: Record<string, any>, hasImages: boolean): NormalizedProductAnalysis {
  const asGarment = { ...product, field_sources: Object.fromEntries(Object.entries(product.field_sources ?? {}).map(([k, v]) => [k, { source: (v as any).source === 'user' ? 'usuario' : (v as any).source }])) }
  const n = normalizeAnalysis({ ...ai, composition: null, label: null }, asGarment, { hasLabelPhoto: false })
  const fields: ProductField[] = n.fields
    .filter((f) => !['confirmed_composition', 'brand', 'size_label'].includes(f.field))
    .map((f) => {
      const key = f.field.startsWith('attr:') ? f.field.slice(5) : f.field
      const o = ai.field_origins[key] ?? ai.field_origins[f.field] ?? 'inference'
      return { ...f, origin: o === 'photo' && hasImages ? 'photo' : 'ai' }
    })
  const style_tags = ai.style_tags.map((t) => ({ ...t, def: STYLE_CATALOG.find((s) => s.id === t.id) })).filter((t) => t.def).slice(0, 3).map((t) => ({ id: t.id, name: t.def!.name, confidence: t.confidence }))
  const discarded = [...n.discarded, ...ai.style_tags.filter((t) => !STYLE_CATALOG.some((s) => s.id === t.id)).map((t) => `Estilo «${t.id}» fuera del catálogo`)]
  // Calidad documentada: la composición publicada (reglas) más lo que la IA cite de la descripción si de verdad aparece en ella
  const desc = String(product.description ?? '').toLowerCase()
  const documented = [
    ...(product.confirmed_composition ? [`Composición publicada: ${product.confirmed_composition}`] : []),
    ...ai.quality.documented.filter((q) => { const quote = q.match(/«([^»]+)»|"([^"]+)"/); const t = (quote?.[1] ?? quote?.[2] ?? '').toLowerCase(); return t.length > 3 && desc.includes(t) }),
  ]
  const rejectedDoc = ai.quality.documented.length - (documented.length - (product.confirmed_composition ? 1 : 0))
  if (rejectedDoc > 0) discarded.push(`${rejectedDoc} afirmación${rejectedDoc === 1 ? '' : 'es'} de calidad sin cita literal de la tienda (no se dan por documentadas)`)
  const unknown = [...ai.quality.unknown]
  if (!product.confirmed_composition && !parseComposition(product.description)) unknown.unshift('Composición desconocida')
  return {
    fields, discarded, observations: n.observations, inferences: n.inferences, unknown: n.unknown, style_tags,
    quality: { documented, apparent: hasImages ? ai.quality.apparent : [], unknown: [...new Set(unknown)] }, model_photos: hasImages && ai.model_photos, overall: n.overall,
  }
}

/**
 * Qué campos del análisis se aplican al producto: solo los vacíos o los que vienen de reglas, del buscador o de otro análisis.
 * Lo publicado por la tienda o el feed y lo que pusiste tú no se toca. Se marca la procedencia (foto o IA) y la confianza.
 */
const KEEP = new Set(['store', 'feed', 'user'])
export function applyAnalysis(product: Record<string, any>, n: NormalizedProductAnalysis, analysisId: string, now = new Date().toISOString()) {
  const fs = { ...(product.field_sources ?? {}) }
  const patch: Record<string, any> = {}
  const attrs = { ...(product.attributes ?? {}) }
  for (const f of n.fields) {
    if (f.confidence < 0.5) continue
    const col = f.field === 'secondary_colors' ? 'colors' : f.field.startsWith('attr:') ? null : f.field
    const key = col === 'colors' ? 'primary_color' : col ?? f.field
    if (KEEP.has(fs[key]?.source)) continue
    if (col === 'colors') { const prim = patch.primary_color ?? product.primary_color; patch.colors = [prim, ...(f.value as string[])].filter(Boolean).filter((c, i, a) => a.indexOf(c) === i); continue }
    if (f.field.startsWith('attr:')) { attrs[f.field.slice(5)] = f.value; fs[f.field] = { source: f.origin, at: now, confidence: f.confidence, analysis_id: analysisId }; continue }
    patch[col!] = f.value
    fs[key] = { source: f.origin, at: now, confidence: f.confidence, analysis_id: analysisId }
    if (col === 'primary_color') patch.colors = [f.value, ...((product.colors ?? []) as string[]).filter((c) => c !== f.value)]
  }
  if (n.style_tags.length && !KEEP.has(fs.style_tags?.source)) { patch.style_tags = n.style_tags.map((t) => t.id); fs.style_tags = { source: 'ai', at: now, analysis_id: analysisId } }
  if (Object.keys(attrs).length) patch.attributes = attrs
  patch.field_sources = fs
  return patch
}
export const familyOfProduct = (p: Record<string, any>) => familyOf(p.subcategory, p.category)
