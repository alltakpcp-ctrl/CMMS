import { apiRequest } from "./client";
import { StockWithdrawalRequest } from "../types";

export interface ReviewStockWithdrawalInput {
  action: "APROVAR" | "REJEITAR";
  reviewNotes?: string;
}

export function listPendingStockWithdrawals(token: string) {
  return apiRequest<StockWithdrawalRequest[]>("/stock-withdrawals", { token });
}

export function reviewStockWithdrawal(token: string, id: string, input: ReviewStockWithdrawalInput) {
  return apiRequest<StockWithdrawalRequest>(`/stock-withdrawals/${id}/review`, {
    method: "POST",
    token,
    body: input,
  });
}
