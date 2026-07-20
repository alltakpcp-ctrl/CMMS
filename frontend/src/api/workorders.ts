import { apiRequest } from "./client";
import { Paginated, WorkOrder } from "../types";
import { Priority, WorkOrderStatus, WorkOrderType } from "../domain/enums";

export interface CreateWorkOrderInput {
  type: WorkOrderType;
  title: string;
  description: string;
  assetId: string;
  targetSectorId?: string;
}

export interface ListWorkOrdersFilters {
  status?: WorkOrderStatus;
  type?: WorkOrderType;
  targetSectorId?: string;
  assetId?: string;
  assignedToId?: string;
  requesterId?: string;
  page?: number;
  pageSize?: number;
}

export interface TriagemInput {
  priority: Priority;
  targetSectorId: string;
}

export interface PlanejamentoInput {
  plan: string;
}

export interface ProgramacaoInput {
  scheduledStart: string;
  scheduledEnd: string;
  assignedToId: string;
}

export interface IniciarInput {
  riskAnalysis: string;
}

export interface RegistrarInput {
  rootCause: string;
  repairDescription: string;
  parts?: Array<{ partId: string; quantity: number }>;
}

export interface EncerramentoTecnicoInput {
  testNotes: string;
  cleanupDone: boolean;
}

export interface ValidarInput {
  approve: boolean;
  note?: string;
}

export interface CancelarInput {
  note: string;
}

function query(filters: ListWorkOrdersFilters): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  });
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function listWorkOrders(token: string, filters: ListWorkOrdersFilters = {}) {
  return apiRequest<Paginated<WorkOrder>>(`/workorders${query(filters)}`, { token });
}

export function getWorkOrder(token: string, id: string) {
  return apiRequest<WorkOrder>(`/workorders/${id}`, { token });
}

export function createWorkOrder(token: string, input: CreateWorkOrderInput) {
  return apiRequest<WorkOrder>("/workorders", { method: "POST", token, body: input });
}

export function triagem(token: string, id: string, input: TriagemInput) {
  return apiRequest<WorkOrder>(`/workorders/${id}/triagem`, { method: "POST", token, body: input });
}

export function planejamento(token: string, id: string, input: PlanejamentoInput) {
  return apiRequest<WorkOrder>(`/workorders/${id}/planejamento`, { method: "POST", token, body: input });
}

export function programacao(token: string, id: string, input: ProgramacaoInput) {
  return apiRequest<WorkOrder>(`/workorders/${id}/programacao`, { method: "POST", token, body: input });
}

export function iniciar(token: string, id: string, input: IniciarInput) {
  return apiRequest<WorkOrder>(`/workorders/${id}/iniciar`, { method: "POST", token, body: input });
}

export function registrar(token: string, id: string, input: RegistrarInput) {
  return apiRequest<WorkOrder>(`/workorders/${id}/registrar`, { method: "POST", token, body: input });
}

export function encerramentoTecnico(token: string, id: string, input: EncerramentoTecnicoInput) {
  return apiRequest<WorkOrder>(`/workorders/${id}/encerramento-tecnico`, { method: "POST", token, body: input });
}

export function validar(token: string, id: string, input: ValidarInput) {
  return apiRequest<WorkOrder>(`/workorders/${id}/validar`, { method: "POST", token, body: input });
}

export function cancelar(token: string, id: string, input: CancelarInput) {
  return apiRequest<WorkOrder>(`/workorders/${id}/cancelar`, { method: "POST", token, body: input });
}
