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

export type PatchRespostaInput = z.infer<typeof patchRespostaSchema>;
export type PatchStatusInput = z.infer<typeof patchStatusSchema>;
