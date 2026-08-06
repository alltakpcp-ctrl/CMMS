import { apiRequest } from "./client";
import { Part, StockMovement } from "../types";
import { StockStatus } from "../domain/enums";

export interface StockEntryInput {
  partId: string;
  quantity: number;
  reason: string;
  unitCost?: number;
}

export interface StockAdjustInput {
  partId: string;
  quantity: number;
  direction: "increase" | "decrease";
  reason: string;
  stockStatusOverride?: StockStatus | null;
  orderRef?: string;
}

export interface StockReturnInput {
  partId: string;
  quantity: number;
  reason: string;
  workOrderId?: string;
}

export function stockEntry(token: string, input: StockEntryInput) {
  return apiRequest<StockMovement>("/stock/entry", { method: "POST", token, body: input });
}

export function stockAdjust(token: string, input: StockAdjustInput) {
  return apiRequest<StockMovement>("/stock/adjust", { method: "POST", token, body: input });
}

export function stockReturn(token: string, input: StockReturnInput) {
  return apiRequest<StockMovement>("/stock/return", { method: "POST", token, body: input });
}

export function getLedger(token: string, partId: string) {
  return apiRequest<StockMovement[]>(`/stock/ledger/${partId}`, { token });
}

export function getLowStock(token: string) {
  return apiRequest<Part[]>("/stock/low-stock", { token });
}
