// Espelha backend/src/domain/enums.ts — SQLite não tem enum nativo, então os
// valores válidos vivem aqui e no backend, mantidos em sincronia manualmente.

export const Role = {
  OPERADOR: "OPERADOR",
  TECNICO: "TECNICO",
  SUPERVISOR: "SUPERVISOR",
} as const;
export type Role = (typeof Role)[keyof typeof Role];

// Setor deixou de ser um enum fixo — os valores agora vêm da tabela Sector
// (ver api/sectors.ts e hooks/useSectors.ts).

export const WorkOrderType = {
  CORRETIVA: "CORRETIVA",
  PREVENTIVA: "PREVENTIVA",
  PREDITIVA: "PREDITIVA",
  MELHORIA: "MELHORIA",
} as const;
export type WorkOrderType = (typeof WorkOrderType)[keyof typeof WorkOrderType];

export const Disciplina = {
  ELETRICA: "ELETRICA",
  MECANICA: "MECANICA",
  PREDIAL: "PREDIAL",
} as const;
export type Disciplina = (typeof Disciplina)[keyof typeof Disciplina];

export const WorkOrderStatus = {
  ABERTA: "ABERTA",
  TRIAGEM: "TRIAGEM",
  PLANEJADA: "PLANEJADA",
  PROGRAMADA: "PROGRAMADA",
  EM_EXECUCAO: "EM_EXECUCAO",
  AGUARDANDO_VALIDACAO: "AGUARDANDO_VALIDACAO",
  ENCERRADA: "ENCERRADA",
  CANCELADA: "CANCELADA",
} as const;
export type WorkOrderStatus = (typeof WorkOrderStatus)[keyof typeof WorkOrderStatus];

export const Priority = {
  BAIXA: "BAIXA",
  MEDIA: "MEDIA",
  ALTA: "ALTA",
  URGENTE: "URGENTE",
} as const;
export type Priority = (typeof Priority)[keyof typeof Priority];

export const PartRequestItemType = {
  PECA: "PECA",
  FERRAMENTA: "FERRAMENTA",
} as const;
export type PartRequestItemType = (typeof PartRequestItemType)[keyof typeof PartRequestItemType];

export const PartRequestStatus = {
  PENDENTE: "PENDENTE",
  INCLUIDA: "INCLUIDA",
  REJEITADA: "REJEITADA",
  DEVOLVIDA: "DEVOLVIDA",
  ATENDIDA: "ATENDIDA",
} as const;
export type PartRequestStatus = (typeof PartRequestStatus)[keyof typeof PartRequestStatus];

export const PurchaseOrderStatus = {
  EM_ANALISE: "EM_ANALISE",
  APROVADO: "APROVADO",
  APROVADO_PARCIAL: "APROVADO_PARCIAL",
  DEVOLVIDO: "DEVOLVIDO",
  REJEITADO: "REJEITADO",
  ENVIADO_COMPRAS: "ENVIADO_COMPRAS",
} as const;
export type PurchaseOrderStatus = (typeof PurchaseOrderStatus)[keyof typeof PurchaseOrderStatus];

export const StockMovementType = {
  ENTRADA: "ENTRADA",
  SAIDA: "SAIDA",
  AJUSTE: "AJUSTE",
  DEVOLUCAO: "DEVOLUCAO",
} as const;
export type StockMovementType = (typeof StockMovementType)[keyof typeof StockMovementType];

export const StockStatus = {
  URGENTE: "URGENTE",
  ALERTA: "ALERTA",
  BOM: "BOM",
  EXCESSO: "EXCESSO",
} as const;
export type StockStatus = (typeof StockStatus)[keyof typeof StockStatus];

export const SubtaskStatus = {
  ABERTA: "ABERTA",
  CONCLUIDA: "CONCLUIDA",
  CANCELADA: "CANCELADA",
} as const;
export type SubtaskStatus = (typeof SubtaskStatus)[keyof typeof SubtaskStatus];
