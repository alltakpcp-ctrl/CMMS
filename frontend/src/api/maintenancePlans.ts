import { apiRequest } from "./client";
import { MaintenancePlan, MaintenancePlanWithDueDate } from "../types";
import { MaintenanceDiscipline, MaintenancePeriodicity, Priority } from "../domain/enums";

export interface CreateMaintenancePlanInput {
  assetId: string;
  discipline: MaintenanceDiscipline;
  title: string;
  description?: string;
  priority: Priority;
  periodicity: MaintenancePeriodicity;
  estimatedMinutes?: number;
  responsible?: string;
  action01?: string;
  action02?: string;
  action03?: string;
  action04?: string;
  action05?: string;
  action06?: string;
}

export type UpdateMaintenancePlanInput = Partial<CreateMaintenancePlanInput> & { active?: boolean };

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
  return apiRequest<MaintenancePlan>("/maintenance-plans", { method: "POST", token, body: input });
}

export function updateMaintenancePlan(token: string, id: string, input: UpdateMaintenancePlanInput) {
  return apiRequest<MaintenancePlan>(`/maintenance-plans/${id}`, { method: "PATCH", token, body: input });
}

export function deleteMaintenancePlan(token: string, id: string) {
  return apiRequest<null>(`/maintenance-plans/${id}`, { method: "DELETE", token });
}
