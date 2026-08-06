import { apiRequest } from "./client";
import { PublicUser } from "../types";
import { Role } from "../domain/enums";

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role: Role;
  sectorId?: string | null;
  shiftId?: string | null;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  role?: Role;
  active?: boolean;
  sectorId?: string | null;
  shiftId?: string | null;
  canReceivePartRequests?: boolean;
  canManageStock?: boolean;
  canPurchase?: boolean;
}

export function listUsers(token: string) {
  return apiRequest<PublicUser[]>("/users", { token });
}

// Lista restrita a TECNICO ativo — liberada também para TECNICO (diferente de
// listUsers, exclusivo de SUPERVISOR). Usada para seleção de manutentores de apoio.
export function listTecnicos(token: string, excludeUserId?: string) {
  const qs = excludeUserId ? `?excludeUserId=${encodeURIComponent(excludeUserId)}` : "";
  return apiRequest<PublicUser[]>(`/users/tecnicos${qs}`, { token });
}

// Lista restrita a TECNICO + SUPERVISOR ativos — usada para atribuir/reatribuir
// subtarefas (dono pode ser qualquer um dos dois papéis).
export function listAssignableForSubtask(token: string, excludeUserId?: string) {
  const qs = excludeUserId ? `?excludeUserId=${encodeURIComponent(excludeUserId)}` : "";
  return apiRequest<PublicUser[]>(`/users/assignable-subtask${qs}`, { token });
}

export function createUser(token: string, input: CreateUserInput) {
  return apiRequest<PublicUser>("/users", { method: "POST", token, body: input });
}

export function updateUser(token: string, id: string, input: UpdateUserInput) {
  return apiRequest<PublicUser>(`/users/${id}`, { method: "PUT", token, body: input });
}

export function changeUserPassword(token: string, id: string, password: string) {
  return apiRequest<PublicUser>(`/users/${id}/senha`, { method: "POST", token, body: { password } });
}

export function deleteUser(token: string, id: string) {
  return apiRequest<null>(`/users/${id}`, { method: "DELETE", token });
}
