import { z } from 'zod'

// Contrato de salida del analisis de fotos: la IA solo puede devolver esto.
export const ObservationsSchema = z.object({
  // Primero, si cada foto sirve: las observaciones de fotos no utilizables se descartan.
  photo_quality: z.array(z.object({
    source_photo: z.string(),
    usable: z.boolean(),
    issues: z.array(z.string()).max(4),
  })).max(4).default([]),
  observations: z.array(z.object({
    area: z.enum(['antropometria', 'colorimetria', 'estilo']),
    title: z.string(),
    body: z.string(),
    confidence: z.enum(['alta', 'media', 'baja']),
    justification: z.string(),
    source_photo: z.string(),
  })).max(8),
})
export type Observations = z.infer<typeof ObservationsSchema>
