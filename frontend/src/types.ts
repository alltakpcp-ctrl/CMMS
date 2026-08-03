import {
  Disciplina,
  PartRequestItemType,
  PartRequestStatus,
  Priority,
  PurchaseOrderStatus,
  Role,
  StockMovementType,
  SubtaskStatus,
  WorkOrderStatus,
  WorkOrderType,
} from "./domain/enums";
import { Sector } from "./api/sectors";

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: string;
  sector: { id: string; name: string } | null;
  canReceivePartRequests: boolean;
  canManageStock: boolean;
}

export interface Asset {
  id: string;
  code: string;
  name: string;
  sectorId: string;
  sector?: Sector;
  sectors?: { sector: Sector }[];
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
  minStock: number | null;
  maxStock: number | null;
  unitCost: number | null;
  location: string | null;
  sectorId: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ExecutionLog {
  id: string;
  note: string;
  createdAt: string;
  author: { id: string; name: string };
}

export interface Execution {
  id: string;
  workOrderId: string;
  riskAnalysis: string | null;
  // @deprecated registro legado (pré-ExecutionLog) — ver `logs`.
  rootCause: string | null;
  // @deprecated ver rootCause acima.
  repairDescription: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  testNotes: string | null;
  cleanupDone: boolean;
  logs: ExecutionLog[];
}

// GET /workorders/:id/subtasks retorna só campos escalares (sem include de
// relação) — createdBy/assignedTo ficam opcionais e hoje nunca vêm
// populados; o nome do responsável é resolvido no componente via a lista de
// usuários atribuíveis (useAssignableUsers).
export interface Subtask {
  id: string;
  workOrderId: string;
  title: string;
  description: string | null;
  status: SubtaskStatus;
  estimatedMinutes: number;
  createdById: string;
  assignedToId: string;
  createdBy?: PublicUser;
  assignedTo?: PublicUser;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkOrderPart {
  id: string;
  workOrderId: string;
  partId: string;
  quantity: number;
  part: Part;
}

export interface WorkOrderPlannedPart {
  id: string;
  workOrderId: string;
  partId: string;
  quantity: number;
  part: Part;
}

export interface WorkOrderAssignee {
  id: string;
  workOrderId: string;
  userId: string;
  user: { id: string; name: string };
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
  disciplina: Disciplina;
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
  // Derivado no backend (assignees.length + 1) — não é mais um input do form.
  numMaintainers: number | null;
  estimatedMinutes: number | null;
  tools: string[] | null;
  ppe: string[] | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  assignedToId: string | null;
  assignedTo: PublicUser | null;
  assignees: WorkOrderAssignee[];
  createdAt: string;
  updatedAt: string;
  executions: Execution[];
  parts: WorkOrderPart[];
  plannedPartItems: WorkOrderPlannedPart[];
  statusHistory?: StatusHistoryEntry[];
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PartRequest {
  id: string;
  itemType: PartRequestItemType;
  partId: string | null;
  part: Part | null;
  description: string;
  quantity: number;
  notes: string | null;
  status: PartRequestStatus;
  osId: string | null;
  workOrder: { id: string; number: string } | null;
  requestedById: string;
  requestedBy: PublicUser;
  purchaseOrderId: string | null;
  rejectedReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  partId: string;
  type: StockMovementType;
  quantity: number;
  balanceAfter: number;
  unitCost: number | null;
  workOrderId: string | null;
  partRequestId: string | null;
  userId: string | null;
  reason: string | null;
  createdAt: string;
}

export interface PurchaseOrder {
  id: string;
  number: string;
  status: PurchaseOrderStatus;
  createdById: string;
  createdBy: PublicUser;
  reviewedById: string | null;
  reviewedBy: PublicUser | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  items: PartRequest[];
  createdAt: string;
  updatedAt: string;
}
