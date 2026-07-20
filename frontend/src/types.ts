import { Priority, Role, WorkOrderStatus, WorkOrderType } from "./domain/enums";
import { Sector } from "./api/sectors";

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: string;
}

export interface Asset {
  id: string;
  code: string;
  name: string;
  sectorId: string;
  sector?: Sector;
  location: string;
  criticality: number;
  preventivePeriodicityDays: number | null;
  active: boolean;
  createdAt: string;
}

export interface Part {
  id: string;
  code: string;
  description: string;
  unit: string;
  stockQty: number;
  createdAt: string;
}

export interface Execution {
  id: string;
  workOrderId: string;
  riskAnalysis: string | null;
  rootCause: string | null;
  repairDescription: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  testNotes: string | null;
  cleanupDone: boolean;
}

export interface WorkOrderPart {
  id: string;
  workOrderId: string;
  partId: string;
  quantity: number;
  part: Part;
}

export interface StatusHistoryEntry {
  id: string;
  workOrderId: string;
  fromStatus: WorkOrderStatus | null;
  toStatus: WorkOrderStatus;
  changedById: string;
  changedBy: PublicUser;
  note: string | null;
  changedAt: string;
}

export interface WorkOrder {
  id: string;
  number: string;
  type: WorkOrderType;
  status: WorkOrderStatus;
  priority: Priority | null;
  title: string;
  description: string;
  requesterId: string;
  requester: PublicUser;
  assetId: string;
  asset: Asset;
  targetSectorId: string | null;
  targetSector?: Sector | null;
  plan: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  assignedToId: string | null;
  assignedTo: PublicUser | null;
  createdAt: string;
  updatedAt: string;
  execution: Execution | null;
  parts: WorkOrderPart[];
  statusHistory?: StatusHistoryEntry[];
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
