import { apiRequest } from "./client";
import { PartRequest, PurchaseOrder } from "../types";

export interface CreatePurchaseOrderInput {
  partRequestIds: string[];
}

export interface RejectPartRequestInput {
  rejectedReason: string;
}

export interface ReviewPurchaseOrderInput {
  action: "APROVAR" | "REJEITAR";
  reviewNotes?: string;
  // NOTA: o backend (purchase-orders/schema.ts#reviewPurchaseOrderItemSchema)
  // espera `itemId`, não `id` — mantido fiel ao contrato real implementado.
  items?: Array<{ itemId: string; quantity: number }>;
}

export function listPurchaseOrders(token: string) {
  return apiRequest<PurchaseOrder[]>("/purchase-orders", { token });
}

export function getPurchaseOrder(token: string, id: string) {
  return apiRequest<PurchaseOrder>(`/purchase-orders/${id}`, { token });
}

export function createPurchaseOrder(token: string, input: CreatePurchaseOrderInput) {
  return apiRequest<PurchaseOrder>("/purchase-orders", { method: "POST", token, body: input });
}

export function rejectPartRequest(token: string, id: string, input: RejectPartRequestInput) {
  return apiRequest<PartRequest>(`/purchase-orders/reject-request/${id}`, {
    method: "POST",
    token,
    body: input,
  });
}

export function reviewPurchaseOrder(token: string, id: string, input: ReviewPurchaseOrderInput) {
  return apiRequest<PurchaseOrder>(`/purchase-orders/${id}/review`, { method: "POST", token, body: input });
}
