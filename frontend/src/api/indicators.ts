import { apiRequest } from "./client";
import { Priority, Sector } from "../domain/enums";

export interface IndicatorsFilters {
  from?: string;
  to?: string;
  targetSector?: Sector;
}

export interface Overview {
  mttrHours: number | null;
  mtbfHours: number | null;
  adherencePercentage: number | null;
  backlogTotal: number;
}

export interface AssetIndicator {
  assetId: string;
  code: string;
  name: string;
  criticality: number;
  mttrHours: number | null;
  mtbfHours: number | null;
}

export interface BacklogGroup {
  targetSector: Sector | null;
  priority: Priority | null;
  count: number;
}

export interface BacklogResult {
  total: number;
  bySectorAndPriority: BacklogGroup[];
}

function query(filters: IndicatorsFilters): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function getOverview(token: string, filters: IndicatorsFilters = {}) {
  return apiRequest<Overview>(`/indicators/overview${query(filters)}`, { token });
}

export function getByAsset(token: string, filters: IndicatorsFilters = {}) {
  return apiRequest<AssetIndicator[]>(`/indicators/by-asset${query(filters)}`, { token });
}

export function getBacklog(token: string, filters: IndicatorsFilters = {}) {
  return apiRequest<BacklogResult>(`/indicators/backlog${query(filters)}`, { token });
}
