import { apiRequest } from "./client";
import { PartRequest, PurchaseOrder } from "../types";

export interface PurchaseOrderItemInput {
  partId: string;
  quantity: number;
}

export interface CreatePurchaseOrderInput {
  items: PurchaseOrderItemInput[];
}

export interface RejectPartRequestInput {
  rejectedReason: string;
}

export interface ReviewPurchaseOrderItemInput {
  itemId: string;
  approvedQuantity: number;
  deferredQuantity: number;
}

export interface ReviewPurchaseOrderInput {
  action: "APROVAR" | "DEVOLVER";
  reviewNotes?: string;
  items?: ReviewPurchaseOrderItemInput[];
}

export function listPurchaseOrders(token: string) {
  return apiRequest<PurchaseOrder[]>("/purchase-orders", { token });
}

export function listPurchasing(token: string) {
  return apiRequest<PurchaseOrder[]>("/purchase-orders/purchasing", { token });
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
