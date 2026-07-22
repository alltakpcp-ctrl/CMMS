import { z } from "zod";

export const createPurchaseOrderSchema = z.object({
  partRequestIds: z.array(z.string().min(1)).min(1, "Selecione ao menos uma indicação."),
});

export const rejectPartRequestSchema = z.object({
  rejectedReason: z.string().min(1, "Motivo da rejeição é obrigatório."),
});

export const reviewPurchaseOrderItemSchema = z.object({
  itemId: z.string().min(1),
  quantity: z.number().int().positive("Quantidade deve ser maior que zero."),
});

export const reviewPurchaseOrderSchema = z
  .object({
    action: z.enum(["APROVAR", "REJEITAR"]),
    reviewNotes: z.string().optional(),
    items: z.array(reviewPurchaseOrderItemSchema).optional(),
  })
  .refine((data) => data.action === "APROVAR" || Boolean(data.reviewNotes), {
    message: "Nota é obrigatória ao rejeitar o pedido.",
    path: ["reviewNotes"],
  });

export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;
export type RejectPartRequestInput = z.infer<typeof rejectPartRequestSchema>;
export type ReviewPurchaseOrderInput = z.infer<typeof reviewPurchaseOrderSchema>;
