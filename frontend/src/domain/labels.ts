import { Priority, Role, Sector, WorkOrderStatus, WorkOrderType } from "./enums";

export const ROLE_LABELS: Record<Role, string> = {
  OPERADOR: "Operador",
  TECNICO: "Técnico",
  SUPERVISOR: "Supervisor",
};

export const SECTOR_LABELS: Record<Sector, string> = {
  MECANICA: "Mecânica",
  ELETRICA: "Elétrica",
  PREDIAL: "Predial",
};

export const TYPE_LABELS: Record<WorkOrderType, string> = {
  CORRETIVA: "Corretiva",
  PREVENTIVA: "Preventiva",
  PREDITIVA: "Preditiva",
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

export const PRIORITY_COLORS: Record<Priority, "slate" | "blue" | "amber" | "red"> = {
  BAIXA: "slate",
  MEDIA: "blue",
  ALTA: "amber",
  URGENTE: "red",
};
