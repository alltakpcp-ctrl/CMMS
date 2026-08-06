import {
  Disciplina,
  PartRequestItemType,
  PartRequestStatus,
  Priority,
  PurchaseOrderStatus,
  Role,
  StockMovementType,
  StockStatus,
  SubtaskStatus,
  WorkOrderStatus,
  WorkOrderType,
} from "./enums";

export const ROLE_LABELS: Record<Role, string> = {
  OPERADOR: "Operador",
  TECNICO: "Técnico",
  SUPERVISOR: "Supervisor",
};

export const TYPE_LABELS: Record<WorkOrderType, string> = {
  CORRETIVA: "Corretiva",
  PREVENTIVA: "Preventiva",
  PREDITIVA: "Preditiva",
  MELHORIA: "Melhoria",
};

export const DISCIPLINA_LABELS: Record<Disciplina, string> = {
  ELETRICA: "Elétrica",
  MECANICA: "Mecânica",
  PREDIAL: "Predial",
};

export const STATUS_LABELS: Record<WorkOrderStatus, string> = {
  ABERTA: "Aberta",
  TRIAGEM: "Em triagem",
  PLANEJADA: "Planejada",
  PROGRAMADA: "Programada",
  EM_EXECUCAO: "Em execução",
  AGUARDANDO_VALIDACAO: "Aguardando validação",
  ENCERRADA: "Encerrada",
  CANCELADA: "Cancelada",
};

// Cores no vocabulário do componente Badge (ver components/Badge.tsx).
export const STATUS_COLORS: Record<WorkOrderStatus, "slate" | "blue" | "amber" | "green" | "red"> = {
  ABERTA: "slate",
  TRIAGEM: "blue",
  PLANEJADA: "blue",
  PROGRAMADA: "amber",
  EM_EXECUCAO: "amber",
  AGUARDANDO_VALIDACAO: "amber",
  ENCERRADA: "green",
  CANCELADA: "red",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  BAIXA: "Baixa",
  MEDIA: "Média",
  ALTA: "Alta",
  URGENTE: "Urgente",
};

export const PRIORITY_COLORS: Record<Priority, "sky" | "yellow" | "orange" | "red"> = {
  BAIXA: "sky",
  MEDIA: "yellow",
  ALTA: "orange",
  URGENTE: "red",
};

export const PART_REQUEST_ITEM_TYPE_LABELS: Record<PartRequestItemType, string> = {
  PECA: "Peça",
  FERRAMENTA: "Ferramenta",
};

export const PART_REQUEST_STATUS_LABELS: Record<PartRequestStatus, string> = {
  PENDENTE: "Pendente",
  INCLUIDA: "Incluída em pedido",
  REJEITADA: "Rejeitada",
  DEVOLVIDA: "Devolvida",
  ATENDIDA: "Atendida",
};

export const PART_REQUEST_STATUS_COLORS: Record<PartRequestStatus, "slate" | "blue" | "amber" | "green" | "red"> = {
  PENDENTE: "slate",
  INCLUIDA: "slate",
  REJEITADA: "red",
  DEVOLVIDA: "amber",
  ATENDIDA: "green",
};

export const PURCHASE_ORDER_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  EM_ANALISE: "Em análise",
  APROVADO: "Aprovado",
  APROVADO_PARCIAL: "Aprovado parcial",
  DEVOLVIDO: "Devolvido",
  REJEITADO: "Rejeitado",
  ENVIADO_COMPRAS: "Enviado a compras",
};

export const PURCHASE_ORDER_STATUS_COLORS: Record<PurchaseOrderStatus, "slate" | "blue" | "amber" | "green" | "red"> = {
  EM_ANALISE: "amber",
  APROVADO: "green",
  APROVADO_PARCIAL: "blue",
  DEVOLVIDO: "slate",
  REJEITADO: "red",
  ENVIADO_COMPRAS: "green",
};

export const STOCK_MOVEMENT_TYPE_LABELS: Record<StockMovementType, string> = {
  ENTRADA: "Entrada",
  SAIDA: "Saída",
  AJUSTE: "Ajuste",
  DEVOLUCAO: "Devolução",
};

export const STOCK_MOVEMENT_TYPE_COLORS: Record<StockMovementType, "slate" | "blue" | "amber" | "green" | "red"> = {
  ENTRADA: "green",
  SAIDA: "red",
  AJUSTE: "amber",
  DEVOLUCAO: "blue",
};

export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  URGENTE: "Urgente",
  ALERTA: "Alerta",
  BOM: "Bom",
  EXCESSO: "Excesso",
};

export const STOCK_STATUS_COLORS: Record<StockStatus, "slate" | "blue" | "amber" | "green" | "red"> = {
  URGENTE: "red",
  ALERTA: "amber",
  BOM: "green",
  EXCESSO: "blue",
};

export const SUBTASK_STATUS_LABELS: Record<SubtaskStatus, string> = {
  ABERTA: "Aberta",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
};

export const SUBTASK_STATUS_COLORS: Record<SubtaskStatus, "amber" | "green" | "red"> = {
  ABERTA: "amber",
  CONCLUIDA: "green",
  CANCELADA: "red",
};
