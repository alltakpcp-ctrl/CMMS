import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("E-mail inválido."),
  password: z.string().min(1, "Senha é obrigatória."),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
