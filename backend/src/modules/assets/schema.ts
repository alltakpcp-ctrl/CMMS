import { z } from "zod";

export const createAssetSchema = z.object({
  code: z.string().min(1, "Código é obrigatório."),
  name: z.string().min(1, "Nome é obrigatório."),
  sectorId: z.string().min(1, "Setor é obrigatório."),
  location: z.string().min(1, "Localização é obrigatória."),
  criticality: z.number().int().min(1).max(5),
  preventivePeriodicityDays: z.number().int().positive().optional(),
});

export const updateAssetSchema = createAssetSchema.partial().extend({
  active: z.boolean().optional(),
});

export type CreateAssetInput = z.infer<typeof createAssetSchema>;
export type UpdateAssetInput = z.infer<typeof updateAssetSchema>;
