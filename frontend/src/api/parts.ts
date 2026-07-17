import { apiRequest } from "./client";
import { Part } from "../types";

export interface PartInput {
  code: string;
  description: string;
  unit: string;
  stockQty: number;
}

export function listParts(token: string) {
  return apiRequest<Part[]>("/parts", { token });
}

export function getPart(token: string, id: string) {
  return apiRequest<Part>(`/parts/${id}`, { token });
}

export function createPart(token: string, input: PartInput) {
  return apiRequest<Part>("/parts", { method: "POST", token, body: input });
}

export function updatePart(token: string, id: string, input: Partial<PartInput>) {
  return apiRequest<Part>(`/parts/${id}`, { method: "PUT", token, body: input });
}

export function deletePart(token: string, id: string) {
  return apiRequest<null>(`/parts/${id}`, { method: "DELETE", token });
}
