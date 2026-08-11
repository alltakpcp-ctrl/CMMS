import { z } from "zod";

export const patchRespostaSchema = z.object({
  resposta: z.enum(["SIM", "NAO", "NA"]).nullable().optional(),
  observacao: z.string().nullable().optional(),
});

export const patchStatusSchema = z
  .object({
    acao: z.enum(["submeter", "aprovar", "reprovar"]),
    motivo: z.string().trim().min(1).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.acao === "reprovar" && !val.motivo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["motivo"],
        message: "Motivo é obrigatório ao reprovar a PT.",
      });
    }
  });

export const solicitarAssinaturaSchema = z.object({
  userId: z.string().min(1, "Usuário é obrigatório."),
});

export type PatchRespostaInput = z.infer<typeof patchRespostaSchema>;
export type PatchStatusInput = z.infer<typeof patchStatusSchema>;
export type SolicitarAssinaturaInput = z.infer<typeof solicitarAssinaturaSchema>;
