import { z } from "zod";

export const createSectorSchema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório").max(120),
});

export const updateSectorSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  active: z.boolean().optional(),
});

export type CreateSectorInput = z.infer<typeof createSectorSchema>;
export type UpdateSectorInput = z.infer<typeof updateSectorSchema>;
