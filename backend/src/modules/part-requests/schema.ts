import { z } from "zod";
import { PartRequestItemType } from "../../domain/enums";

export const createPartRequestSchema = z.object({
  itemType: z.nativeEnum(PartRequestItemType),
  partId: z.string().min(1).optional(),
  description: z.string().min(1, "Descrição é obrigatória."),
  quantity: z.number().int().positive("Quantidade deve ser maior que zero."),
  notes: z.string().optional(),
  osId: z.string().min(1).optional(),
});

export const listPartRequestsQuerySchema = z.object({
  scope: z.enum(["pending"]).optional(),
});

export type CreatePartRequestInput = z.infer<typeof createPartRequestSchema>;
export type ListPartRequestsQuery = z.infer<typeof listPartRequestsQuerySchema>;
