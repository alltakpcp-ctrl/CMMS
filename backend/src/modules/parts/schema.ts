import { z } from "zod";

export const createPartSchema = z.object({
  code: z.string().min(1, "Código é obrigatório."),
  description: z.string().min(1, "Descrição é obrigatória."),
  unit: z.string().min(1, "Unidade é obrigatória."),
  minStock: z.number().int().min(0).optional(),
  maxStock: z.number().int().min(0).optional(),
  location: z.string().optional(),
});

export const updatePartSchema = z.object({
  unit: z.string().min(1, "Unidade é obrigatória.").optional(),
  minStock: z.number().int().min(0).nullable().optional(),
  maxStock: z.number().int().min(0).nullable().optional(),
  location: z.string().nullable().optional(),
});

export type CreatePartInput = z.infer<typeof createPartSchema>;
export type UpdatePartInput = z.infer<typeof updatePartSchema>;
