import { z } from "zod";
import { Role } from "../../domain/enums";

export const createUserSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório."),
  email: z.string().email("E-mail inválido."),
  password: z.string().min(6, "Senha deve ter ao menos 6 caracteres."),
  role: z.nativeEnum(Role),
});

// Email e senha não são editáveis por aqui — troca de senha é um fluxo à parte
// (fora do escopo do MVP) e email é a identidade de login. Nunca permite hard
// delete: desativação é sempre active=false (§5.2b do spec 05 / CLAUDE.md).
export const updateUserSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório.").optional(),
  role: z.nativeEnum(Role).optional(),
  active: z.boolean().optional(),
  sectorId: z.string().nullable().optional(),
  canReceivePartRequests: z.boolean().optional(),
});

export const changePasswordSchema = z.object({
  password: z
    .string()
    .min(8, "Senha deve ter ao menos 8 caracteres.")
    .regex(/[A-Z]/, "Senha deve conter ao menos uma letra maiúscula.")
    .regex(/[0-9]/, "Senha deve conter ao menos um número.")
    .regex(/[^A-Za-z0-9]/, "Senha deve conter ao menos um caractere especial."),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
