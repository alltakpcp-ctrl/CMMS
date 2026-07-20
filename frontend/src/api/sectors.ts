import { apiRequest } from "./client";

export interface Sector {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
}

export function listSectors(token: string) {
  return apiRequest<Sector[]>("/sectors", { token });
}
