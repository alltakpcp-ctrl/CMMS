import { z } from "zod";

export const patchRespostaSchema = z.object({
  resposta: z.enum(["SIM", "NAO", "NA"]).nullable().optional(),
  observacao: z.string().nullable().optional(),
});

export const patchStatusSchema = z.object({
  acao: z.enum(["submeter", "aprovar", "reprovar"]),
});

export type PatchRespostaInput = z.infer<typeof patchRespostaSchema>;
export type PatchStatusInput = z.infer<typeof patchStatusSchema>;
