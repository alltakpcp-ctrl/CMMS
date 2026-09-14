import { z } from "zod";

export const stockWithdrawalPartItemSchema = z.object({
  partId: z.string().min(1),
  quantity: z.number().int().positive("Quantidade deve ser maior que zero."),
});

// Usado por quem declara o consumo (encerramentoTecnicoSchema, finishSubtaskSchema):
// ou informa ao menos 1 peça, ou marca notApplicable — nunca os dois vazios.
export const partsConsumptionSchema = z
  .object({
    parts: z.array(stockWithdrawalPartItemSchema).optional(),
    partsNotApplicable: z.boolean().optional(),
  })
  .refine((d) => d.partsNotApplicable === true || (d.parts?.length ?? 0) > 0, {
    message: "Informe as peças utilizadas ou marque que não houve consumo.",
    path: ["parts"],
  });

export const reviewStockWithdrawalSchema = z
  .object({
    action: z.enum(["APROVAR", "REJEITAR"]),
    reviewNotes: z.string().optional(),
  })
  .refine((data) => data.action === "APROVAR" || Boolean(data.reviewNotes), {
    message: "Motivo é obrigatório ao rejeitar a solicitação de baixa.",
    path: ["reviewNotes"],
  });

export type PartsConsumptionInput = z.infer<typeof partsConsumptionSchema>;
export type ReviewStockWithdrawalInput = z.infer<typeof reviewStockWithdrawalSchema>;
