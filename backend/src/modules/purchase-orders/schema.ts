import { z } from "zod";

export const purchaseOrderItemInputSchema = z.object({
  partId: z.string().min(1),
  quantity: z.number().int().positive("Quantidade deve ser maior que zero."),
  assetId: z.string().min(1).optional(),
  supplierName: z.string().min(1).optional(),
});

export const createPurchaseOrderSchema = z.object({
  items: z.array(purchaseOrderItemInputSchema).min(1, "Adicione ao menos um item."),
});

export const rejectPartRequestSchema = z.object({
  rejectedReason: z.string().min(1, "Motivo da rejeição é obrigatório."),
});

export const reviewPurchaseOrderItemSchema = z
  .object({
    itemId: z.string().min(1),
    approvedQuantity: z.number().int().nonnegative(),
    deferredQuantity: z.number().int().nonnegative(),
  })
  .refine((d) => d.approvedQuantity + d.deferredQuantity >= 1, {
    message: "Cada item deve ter ao menos 1 unidade aprovada ou postergada.",
  });

export const reviewPurchaseOrderSchema = z
  .object({
    action: z.enum(["APROVAR", "DEVOLVER"]),
    reviewNotes: z.string().optional(),
    items: z.array(reviewPurchaseOrderItemSchema).optional(),
  })
  .refine((data) => data.action === "APROVAR" || Boolean(data.reviewNotes), {
    message: "Nota é obrigatória ao devolver o pedido.",
    path: ["reviewNotes"],
  });

export const createPurchaseOrderCommentSchema = z.object({
  body: z.string().min(1, "Comentário não pode ser vazio."),
  supplierName: z.string().min(1).optional(),
});

export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;
export type RejectPartRequestInput = z.infer<typeof rejectPartRequestSchema>;
export type ReviewPurchaseOrderInput = z.infer<typeof reviewPurchaseOrderSchema>;
export type CreatePurchaseOrderCommentInput = z.infer<typeof createPurchaseOrderCommentSchema>;
