import { z } from "zod";

export const createPartSchema = z.object({
  code: z.string().min(1, "Código é obrigatório."),
  description: z.string().min(1, "Descrição é obrigatória."),
  unit: z.string().min(1, "Unidade é obrigatória."),
  stockQty: z.number().int().min(0).default(0),
});

export const updatePartSchema = createPartSchema.partial();

export type CreatePartInput = z.infer<typeof createPartSchema>;
export type UpdatePartInput = z.infer<typeof updatePartSchema>;
