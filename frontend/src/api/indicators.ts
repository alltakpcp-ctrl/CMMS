import { apiRequest } from "./client";
import { Priority } from "../domain/enums";

export interface IndicatorsFilters {
  from?: string;
  to?: string;
  targetSectorId?: string;
}

export interface Overview {
  mttrHours: number | null;
  mtbfHours: number | null;
  adherencePercentage: number | null;
  backlogTotal: number;
  totalWorkOrders: number;
  closedWorkOrders: number;
  cancelledWorkOrders: number;
  byType: { type: string; count: number }[];
  firstWorkOrderAt: string | null;
  daysSinceFirst: number | null;
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
  targetSectorId: string | null;
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

// --- Lifecycle (B1) ---
export interface PhaseDuration {
  status: string;
  avgHours: number | null;
  sampleCount: number;
  openCount: number;
}
export interface OldestOpen {
  status: string;
  workOrderId: string;
  hours: number;
}
export interface ThroughputMonth {
  month: string;
  count: number;
}
export interface LifecycleResult {
  phaseDurations: {
    byPhase: PhaseDuration[];
    oldestOpen: OldestOpen[];
  };
  throughput: {
    total: number;
    byMonth: ThroughputMonth[];
  };
}

// --- Distribution (B2) ---
export interface StatusCount {
  status: string;
  count: number;
}
export interface TypeCount {
  type: string;
  count: number;
}
export interface TechnicianProduction {
  technicianId: string;
  technicianName: string;
  closedCount: number;
}
export interface DistributionData {
  byStatus: StatusCount[];
  byType: TypeCount[];
  byTechnician: TechnicianProduction[];
}
export interface TrendData {
  currentCount: number;
  previousCount: number;
  deltaPercent: number | null;
}
export interface DistributionResult {
  distribution: DistributionData;
  trend: TrendData | null;
}

export function getLifecycle(token: string, filters: IndicatorsFilters = {}) {
  return apiRequest<LifecycleResult>(`/indicators/lifecycle${query(filters)}`, { token });
}

export function getDistribution(token: string, filters: IndicatorsFilters = {}) {
  return apiRequest<DistributionResult>(`/indicators/distribution${query(filters)}`, { token });
}

// --- Technician efficiency (D1) ---
export interface TechnicianTypeMix {
  type: string;
  count: number;
}
export interface TechnicianEfficiency {
  technicianId: string;
  technicianName: string;
  closedCount: number;
  inProgressCount: number;
  mttrHours: number | null;
  adherencePercentage: number | null;
  typeMix: TechnicianTypeMix[];
  mttrAsPrincipalHours: number | null;
  mttrAsApoioHours: number | null;
  asPrincipalCount: number;
  asApoioCount: number;
}
export interface TechnicianEfficiencyResult {
  technicians: TechnicianEfficiency[];
}

export function getTechnicianEfficiency(token: string, filters: IndicatorsFilters = {}) {
  return apiRequest<TechnicianEfficiencyResult>(`/indicators/technician-efficiency${query(filters)}`, { token });
}
