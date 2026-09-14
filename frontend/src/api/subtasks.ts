import { apiRequest } from "./client";
import { Subtask } from "../types";

export interface CreateSubtaskInput {
  title: string;
  description?: string;
  estimatedHours: number;
  assignedToId?: string;
}

export interface UpdateSubtaskInput {
  title?: string;
  description?: string;
  estimatedHours?: number;
  assignedToId?: string;
}

export interface FinishSubtaskInput {
  parts?: Array<{ partId: string; quantity: number }>;
  partsNotApplicable?: boolean;
}

export function listSubtasks(token: string, workOrderId: string) {
  return apiRequest<Subtask[]>(`/workorders/${workOrderId}/subtasks`, { token });
}

export function createSubtask(token: string, workOrderId: string, input: CreateSubtaskInput) {
  return apiRequest<Subtask>(`/workorders/${workOrderId}/subtasks`, { method: "POST", token, body: input });
}

export function updateSubtask(token: string, id: string, input: UpdateSubtaskInput) {
  return apiRequest<Subtask>(`/subtasks/${id}`, { method: "PATCH", token, body: input });
}

export function finishSubtask(token: string, id: string, input: FinishSubtaskInput) {
  return apiRequest<Subtask>(`/subtasks/${id}/finish`, { method: "POST", token, body: input });
}

export function cancelSubtask(token: string, id: string) {
  return apiRequest<Subtask>(`/subtasks/${id}/cancel`, { method: "POST", token });
}
