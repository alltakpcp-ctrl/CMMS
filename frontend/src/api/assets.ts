import { apiRequest } from "./client";
import { Asset } from "../types";
import { Sector } from "../domain/enums";

export interface AssetInput {
  code: string;
  name: string;
  sector: Sector;
  location: string;
  criticality: number;
  preventivePeriodicityDays?: number;
}

export function listAssets(token: string) {
  return apiRequest<Asset[]>("/assets", { token });
}

export function getAsset(token: string, id: string) {
  return apiRequest<Asset>(`/assets/${id}`, { token });
}

export function createAsset(token: string, input: AssetInput) {
  return apiRequest<Asset>("/assets", { method: "POST", token, body: input });
}

export function updateAsset(token: string, id: string, input: Partial<AssetInput> & { active?: boolean }) {
  return apiRequest<Asset>(`/assets/${id}`, { method: "PUT", token, body: input });
}

export function deleteAsset(token: string, id: string) {
  return apiRequest<null>(`/assets/${id}`, { method: "DELETE", token });
}
