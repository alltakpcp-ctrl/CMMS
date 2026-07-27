import { apiRequest } from "./client";

export interface Sector {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
}

export interface SectorInput {
  name: string;
}

export function listSectors(token: string) {
  return apiRequest<Sector[]>("/sectors", { token });
}

export function createSector(token: string, input: SectorInput) {
  return apiRequest<Sector>("/sectors", { method: "POST", token, body: input });
}

export function updateSector(token: string, id: string, input: Partial<SectorInput> & { active?: boolean }) {
  return apiRequest<Sector>(`/sectors/${id}`, { method: "PUT", token, body: input });
}

export function deleteSector(token: string, id: string) {
  return apiRequest<null>(`/sectors/${id}`, { method: "DELETE", token });
}
