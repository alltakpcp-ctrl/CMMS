import { apiRequest } from "./client";
import { PartRequest } from "../types";
import { PartRequestItemType } from "../domain/enums";

export interface CreatePartRequestInput {
  itemType: PartRequestItemType;
  partId?: string;
  description: string;
  quantity: number;
  notes?: string;
  osId?: string;
}

export function listMyPartRequests(token: string) {
  return apiRequest<PartRequest[]>("/part-requests", { token });
}

export function listPendingPartRequests(token: string) {
  return apiRequest<PartRequest[]>("/part-requests?scope=pending", { token });
}

export function getPartRequest(token: string, id: string) {
  return apiRequest<PartRequest>(`/part-requests/${id}`, { token });
}

export function createPartRequest(token: string, input: CreatePartRequestInput) {
  return apiRequest<PartRequest>("/part-requests", { method: "POST", token, body: input });
}
