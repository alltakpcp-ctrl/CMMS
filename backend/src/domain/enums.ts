// SQLite não suporta enums nativos no Prisma (ver prisma/schema.prisma),
// então os valores permitidos vivem aqui e são validados via zod nos módulos.

export const Role = {
  OPERADOR: "OPERADOR",
  TECNICO: "TECNICO",
  SUPERVISOR: "SUPERVISOR",
} as const;
export type Role = (typeof Role)[keyof typeof Role];

// Setor deixou de ser um enum fixo — os valores agora vêm da tabela Sector
// (ver model Sector em schema.prisma e GET /sectors).

export const WorkOrderType = {
  CORRETIVA: "CORRETIVA",
  PREVENTIVA: "PREVENTIVA",
  PREDITIVA: "PREDITIVA",
} as const;
export type WorkOrderType = (typeof WorkOrderType)[keyof typeof WorkOrderType];

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
} as const;
export type PartRequestStatus = (typeof PartRequestStatus)[keyof typeof PartRequestStatus];

export const PurchaseOrderStatus = {
  ENVIADO: "ENVIADO",
  APROVADO: "APROVADO",
  REJEITADO: "REJEITADO",
} as const;
export type PurchaseOrderStatus = (typeof PurchaseOrderStatus)[keyof typeof PurchaseOrderStatus];
