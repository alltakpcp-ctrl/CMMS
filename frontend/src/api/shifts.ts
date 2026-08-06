import { apiRequest } from "./client";

export interface Shift {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  active: boolean;
}

export function listShifts(token: string) {
  return apiRequest<Shift[]>("/shifts", { token });
}
