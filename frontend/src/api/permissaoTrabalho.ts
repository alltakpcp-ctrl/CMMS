import { apiRequest } from "./client";
import { PermissaoTrabalho, PermissaoTrabalhoAssinatura } from "../types";
import { PermissaoTrabalhoStatus } from "../domain/enums";

export interface AssinaturaPendente {
  id: string;
  signedAt: string | null;
  requestedAt: string;
  permissaoTrabalho: {
    id: string;
    status: PermissaoTrabalhoStatus;
    workOrder: { id: string; number: string; title: string };
  };
}

export interface PatchRespostaInput {
  resposta?: "SIM" | "NAO" | "NA" | null;
  observacao?: string | null;
}

export type PatchStatusAcao = "submeter" | "aprovar" | "reprovar" | "liberar";

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

export function patchStatus(token: string, ptId: string, acao: PatchStatusAcao, motivo?: string) {
  return apiRequest<PermissaoTrabalho>(`/permissao-trabalho/${ptId}/status`, {
    method: "PATCH",
    token,
    body: { acao, ...(motivo ? { motivo } : {}) },
  });
}

export function checkpoint(token: string, ptId: string) {
  return apiRequest<PermissaoTrabalho>(`/permissao-trabalho/${ptId}/checkpoint`, {
    method: "POST",
    token,
  });
}

export function solicitarAssinatura(token: string, ptId: string, userId: string) {
  return apiRequest<PermissaoTrabalhoAssinatura>(`/permissao-trabalho/${ptId}/assinaturas`, {
    method: "POST",
    token,
    body: { userId },
  });
}

export function removerAssinatura(token: string, assinaturaId: string) {
  return apiRequest<void>(`/permissao-trabalho/assinaturas/${assinaturaId}`, {
    method: "DELETE",
    token,
  });
}

export function assinar(token: string, assinaturaId: string) {
  return apiRequest<PermissaoTrabalhoAssinatura>(`/permissao-trabalho/assinaturas/${assinaturaId}/assinar`, {
    method: "POST",
    token,
  });
}

export function listarMinhasPendencias(token: string) {
  return apiRequest<AssinaturaPendente[]>(`/permissao-trabalho/assinaturas/minhas-pendencias`, { token });
}
