import {
  Disciplina,
  MaintenanceDiscipline,
  MaintenancePeriodicity,
  PartRequestItemType,
  PartRequestStatus,
  PermissaoTrabalhoStatus,
  Priority,
  PurchaseOrderStatus,
  Role,
  StockMovementType,
  StockStatus,
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
  shift: { id: string; name: string; startTime: string; endTime: string } | null;
  canReceivePartRequests: boolean;
  canManageStock: boolean;
  canPurchase: boolean;
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

// Retorno de GET /maintenance-plans/:id — sem dueDate/isOverdue/deadline (só a
// lista os calcula, ver MaintenancePlanWithDueDate).
export interface MaintenancePlan {
  id: string;
  assetId: string;
  asset: Asset;
  discipline: MaintenanceDiscipline;
  title: string;
  description: string | null;
  priority: Priority;
  // null = plano rascunho (criado a partir de uma OS PREVENTIVA aberta sem
  // plano prévio) — sem periodicidade definida ainda.
  periodicity: MaintenancePeriodicity | null;
  estimatedHours: number | null;
  responsible: string | null;
  action01: string | null;
  action02: string | null;
  action03: string | null;
  action04: string | null;
  action05: string | null;
  action06: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

// Retorno de GET /maintenance-plans (lista) — mesmo shape + campos calculados
// por calculateNextDueDate no backend.
export interface MaintenancePlanWithDueDate extends MaintenancePlan {
  dueDate: string | null; // null quando periodicity é null (plano rascunho)
  isOverdue: boolean;
  deadline: string | null;
  // OS em aberto (fora de ENCERRADA/CANCELADA) vinculada ao plano, se houver
  // — no máximo uma, por regra de negócio (ver PLAN_HAS_OPEN_WORK_ORDER). O
  // calendário usa openWorkOrder.scheduledStart, quando existir, no lugar de
  // dueDate para posicionar o evento na data real já agendada.
  openWorkOrder: {
    id: string;
    number: string;
    scheduledStart: string | null;
    scheduledEnd: string | null;
    status: WorkOrderStatus;
  } | null;
  // Client-side only (nunca vem do backend): marca uma ocorrência projetada
  // pelo calendário — ver MaintenanceCalendar.tsx#eventsByDay. Replica
  // visualmente o compromisso em cada data futura na distância da
  // periodicidade, dentro do período visível; só a 1ª ocorrência (sem essa
  // flag) corresponde ao ciclo real (dueDate/openWorkOrder calculados pelo
  // backend) e é acionável (ex.: "Gerar OS").
  isProjected?: boolean;
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
  stockStatusOverride: string | null;
  stockStatus: StockStatus;
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
  estimatedHours: number;
  createdById: string;
  assignedToId: string;
  createdBy?: PublicUser;
  assignedTo?: PublicUser;
  // @deprecated ver openedAt/closedAt — só preenchido no caminho CONCLUIDA.
  finishedAt: string | null;
  openedAt: string;
  closedAt: string | null;
  closedById: string | null;
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

export type StockWithdrawalStatus = "PENDENTE" | "APROVADA" | "REJEITADA";

export interface StockWithdrawalRequestItem {
  id: string;
  partId: string;
  quantity: number;
  part: Part;
}

export interface StockWithdrawalRequest {
  id: string;
  workOrderId: string;
  workOrder?: { id: string; number: string; title: string };
  subtaskId: string | null;
  subtask?: { id: string; title: string } | null;
  status: StockWithdrawalStatus;
  notApplicable: boolean;
  requestedById: string;
  requestedBy: PublicUser;
  reviewedById: string | null;
  reviewedBy: PublicUser | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  items: StockWithdrawalRequestItem[];
  createdAt: string;
  updatedAt: string;
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

export interface PermissaoTrabalhoResposta {
  id: string;
  permissaoTrabalhoId: string;
  ordem: number;
  pergunta: string;
  resposta: "SIM" | "NAO" | "NA" | null;
  observacao: string | null;
}

export interface PermissaoTrabalhoAssinatura {
  id: string;
  userId: string;
  user: { id: string; name: string };
  signedAt: string | null;
  requestedById: string;
  requestedBy: { id: string; name: string };
  requestedAt: string;
}

export interface PermissaoTrabalho {
  id: string;
  workOrderId: string;
  status: PermissaoTrabalhoStatus;
  emittedAt: string | null;
  closedAt: string | null;
  approvedById: string | null;
  approvedBy: { id: string; name: string } | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  respostas: PermissaoTrabalhoResposta[];
  assinaturas: PermissaoTrabalhoAssinatura[];
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
  estimatedHours: number | null;
  // Preenchido quando a OS é PREVENTIVA — vincula ao MaintenancePlan de
  // origem (gerado pela Agenda ou criado como rascunho ao abrir a OS direto).
  maintenancePlanId: string | null;
  maintenancePlan?: { id: string; periodicity: MaintenancePeriodicity | null; active: boolean } | null;
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
  stockWithdrawalRequests: StockWithdrawalRequest[];
  statusHistory?: StatusHistoryEntry[];
  trabalhoEmAltura: boolean;
  permissaoTrabalho: PermissaoTrabalho | null;
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
  assetId: string | null;
  criticality: number | null;
  supplierName: string | null;
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
  statusSnapshot: string | null;
  orderRef: string | null;
  createdAt: string;
}

export interface StockDashboard {
  summary: {
    totalParts: number;
    totalStockQty: number;
    totalValue: number;
    partsWithoutCost: number;
  };
  byStatus: { status: StockStatus; count: number; stockQty: number }[];
  byArmario: { armario: string; count: number; stockQty: number }[];
  topConsumingAssets: {
    assetId: string;
    assetCode: string;
    assetName: string;
    totalQuantity: number;
    distinctPartsCount: number;
    topPart: { code: string; description: string; quantity: number } | null;
  }[];
  topUsedParts: {
    partId: string;
    code: string;
    description: string;
    unit: string;
    totalQuantity: number;
  }[];
  deadStock: {
    id: string;
    code: string;
    description: string;
    stockQty: number;
    daysSinceLastOutbound: number | null;
  }[];
  recentMovements: {
    id: string;
    type: StockMovementType;
    quantity: number;
    balanceAfter: number;
    reason: string | null;
    createdAt: string;
    partCode: string;
    partDescription: string;
    userName: string | null;
  }[];
}

export interface PurchaseOrderComment {
  id: string;
  purchaseOrderId: string;
  authorId: string;
  author: PublicUser;
  body: string;
  supplierName: string | null;
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
  children?: Array<{ id: string; number: string }>;
  comments?: PurchaseOrderComment[];
  createdAt: string;
  updatedAt: string;
}
