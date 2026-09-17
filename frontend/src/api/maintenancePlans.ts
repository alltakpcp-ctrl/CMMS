import { apiRequest } from "./client";
import { MaintenancePlan, MaintenancePlanWithDueDate, WorkOrder } from "../types";
import { MaintenanceDiscipline, MaintenancePeriodicity, Priority } from "../domain/enums";

// Campos que geram a 1ª OS (já PROGRAMADA) junto com o plano — ver
// GenerateWorkOrderFromPlanInput, reaproveitado também em "gerar-os".
export interface GenerateWorkOrderFromPlanInput {
  scheduledStart: string;
  scheduledEnd: string;
  assigneeIds: string[];
}

export interface CreateMaintenancePlanInput extends GenerateWorkOrderFromPlanInput {
  assetId: string;
  discipline: MaintenanceDiscipline;
  title: string;
  description?: string;
  priority: Priority;
  periodicity: MaintenancePeriodicity;
  estimatedHours: number;
  responsible?: string;
  action01?: string;
  action02?: string;
  action03?: string;
  action04?: string;
  action05?: string;
  action06?: string;
}

// Editar um plano não gera OS — sem os campos de agendamento.
export type UpdateMaintenancePlanInput = Partial<Omit<CreateMaintenancePlanInput, keyof GenerateWorkOrderFromPlanInput>> & {
  active?: boolean;
};

export interface CreateMaintenancePlanResult {
  plan: MaintenancePlan;
  workOrder: WorkOrder;
}

export interface ListMaintenancePlansQuery {
  assetId?: string;
  discipline?: MaintenanceDiscipline;
  priority?: Priority;
  active?: boolean;
}

function toQueryString(query: ListMaintenancePlansQuery): string {
  const params = new URLSearchParams();
  if (query.assetId) params.set("assetId", query.assetId);
  if (query.discipline) params.set("discipline", query.discipline);
  if (query.priority) params.set("priority", query.priority);
  if (query.active !== undefined) params.set("active", String(query.active));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function listMaintenancePlans(token: string, query: ListMaintenancePlansQuery = {}) {
  return apiRequest<MaintenancePlanWithDueDate[]>(`/maintenance-plans${toQueryString(query)}`, { token });
}

export function getMaintenancePlan(token: string, id: string) {
  return apiRequest<MaintenancePlan>(`/maintenance-plans/${id}`, { token });
}

export function createMaintenancePlan(token: string, input: CreateMaintenancePlanInput) {
  return apiRequest<CreateMaintenancePlanResult>("/maintenance-plans", { method: "POST", token, body: input });
}

export function updateMaintenancePlan(token: string, id: string, input: UpdateMaintenancePlanInput) {
  return apiRequest<MaintenancePlan>(`/maintenance-plans/${id}`, { method: "PATCH", token, body: input });
}

export function deleteMaintenancePlan(token: string, id: string) {
  return apiRequest<null>(`/maintenance-plans/${id}`, { method: "DELETE", token });
}

// Exclusão lógica (§5.2 do CLAUDE.md) — ao contrário do DELETE acima (hard
// delete, só funciona com zero OS vinculada), funciona com o plano em
// qualquer estado e mata junto toda OS não-ENCERRADA vinculada a ele.
export function excluirMaintenancePlan(token: string, id: string, input: { reason: string }) {
  return apiRequest<MaintenancePlan>(`/maintenance-plans/${id}/excluir`, { method: "POST", token, body: input });
}

export function generateWorkOrderFromPlan(token: string, id: string, input: GenerateWorkOrderFromPlanInput) {
  return apiRequest<WorkOrder>(`/maintenance-plans/${id}/gerar-os`, { method: "POST", token, body: input });
}
