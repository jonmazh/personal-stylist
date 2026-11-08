import { z } from 'zod'

// Contrato de salida del analisis de fotos: la IA solo puede devolver esto.
export const ObservationsSchema = z.object({
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
