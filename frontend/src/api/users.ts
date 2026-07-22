import { apiRequest } from "./client";
import { PublicUser } from "../types";
import { Role } from "../domain/enums";

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role: Role;
  sectorId?: string | null;
}

export interface UpdateUserInput {
  name?: string;
  role?: Role;
  active?: boolean;
  sectorId?: string | null;
  canReceivePartRequests?: boolean;
}

export function listUsers(token: string) {
  return apiRequest<PublicUser[]>("/users", { token });
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
