// SQLite não suporta enums nativos no Prisma (ver prisma/schema.prisma),
// então os valores permitidos vivem aqui e são validados via zod nos módulos.

export const Role = {
  OPERADOR: "OPERADOR",
  TECNICO: "TECNICO",
  SUPERVISOR: "SUPERVISOR",
  SEGURANCA: "SEGURANCA",
} as const;
export type Role = (typeof Role)[keyof typeof Role];

// Setor deixou de ser um enum fixo — os valores agora vêm da tabela Sector
// (ver model Sector em schema.prisma e GET /sectors).

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

export const StockWithdrawalStatus = {
  PENDENTE: "PENDENTE",
  APROVADA: "APROVADA",
  REJEITADA: "REJEITADA",
} as const;
export type StockWithdrawalStatus = (typeof StockWithdrawalStatus)[keyof typeof StockWithdrawalStatus];

export const PermissaoTrabalhoStatus = {
  RASCUNHO: "RASCUNHO",
  PREENCHIDA: "PREENCHIDA",
  AGUARDANDO_APROVACAO: "AGUARDANDO_APROVACAO",
  APROVADA: "APROVADA",
  REPROVADA: "REPROVADA",
  AGUARDANDO_ASSINATURAS: "AGUARDANDO_ASSINATURAS",
  LIBERADA: "LIBERADA",
  ENCERRADA: "ENCERRADA",
} as const;
export type PermissaoTrabalhoStatus = (typeof PermissaoTrabalhoStatus)[keyof typeof PermissaoTrabalhoStatus];

export const RespostaPT = {
  SIM: "SIM",
  NAO: "NAO",
  NA: "NA",
} as const;
export type RespostaPT = (typeof RespostaPT)[keyof typeof RespostaPT];

export const ExecutionOutcome = {
  CONCLUIDA: "CONCLUIDA",
  INTERROMPIDA: "INTERROMPIDA",
  PAUSA_TURNO: "PAUSA_TURNO",
} as const;
export type ExecutionOutcome = (typeof ExecutionOutcome)[keyof typeof ExecutionOutcome];

export const MaintenanceDiscipline = {
  MECANICA: "MECANICA",
  ELETRICA: "ELETRICA",
  PREDIAL: "PREDIAL",
} as const;
export type MaintenanceDiscipline = (typeof MaintenanceDiscipline)[keyof typeof MaintenanceDiscipline];

export const MaintenancePeriodicity = {
  DIARIO: "DIARIO",
  SEMANAL: "SEMANAL",
  MENSAL: "MENSAL",
  TRIMESTRAL: "TRIMESTRAL",
  SEMESTRAL: "SEMESTRAL",
  ANUAL: "ANUAL",
} as const;
export type MaintenancePeriodicity = (typeof MaintenancePeriodicity)[keyof typeof MaintenancePeriodicity];

export const PERIODICITY_DAYS: Record<MaintenancePeriodicity, number> = {
  DIARIO: 1,
  SEMANAL: 7,
  MENSAL: 30,
  TRIMESTRAL: 90,
  SEMESTRAL: 180,
  ANUAL: 365,
};
