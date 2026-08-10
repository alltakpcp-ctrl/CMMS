import { apiRequest } from "./client";
import { PermissaoTrabalho } from "../types";

export interface PatchRespostaInput {
  resposta?: "SIM" | "NAO" | "NA" | null;
  observacao?: string | null;
}

export type PatchStatusAcao = "submeter" | "aprovar" | "reprovar";

export function getByWorkOrder(token: string, workOrderId: string) {
  return apiRequest<PermissaoTrabalho>(`/permissao-trabalho/workorder/${workOrderId}`, { token });
}

export function patchResposta(token: string, respostaId: string, input: PatchRespostaInput) {
  return apiRequest<PermissaoTrabalho>(`/permissao-trabalho/respostas/${respostaId}`, {
    method: "PATCH",
    token,
    body: input,
  });
}

export function patchStatus(token: string, ptId: string, acao: PatchStatusAcao) {
  return apiRequest<PermissaoTrabalho>(`/permissao-trabalho/${ptId}/status`, {
    method: "PATCH",
    token,
    body: { acao },
  });
}

export function checkpoint(token: string, ptId: string) {
  return apiRequest<PermissaoTrabalho>(`/permissao-trabalho/${ptId}/checkpoint`, {
    method: "POST",
    token,
  });
}
