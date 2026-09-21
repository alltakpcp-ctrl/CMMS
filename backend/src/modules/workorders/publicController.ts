import { Request, Response } from "express";
import { prisma } from "../../config/prisma";
import { Priority, WorkOrderStatus } from "../../domain/enums";

// Priority é String sem ordem natural no banco (ver §2 do CLAUDE.md) — para
// exibir "OS Programadas" da mais crítica para a menos crítica, ordenamos em
// memória por este mapa de peso após o findMany.
const PRIORITY_WEIGHT: Record<Priority, number> = {
  URGENTE: 0,
  ALTA: 1,
  MEDIA: 2,
  BAIXA: 3,
};

const publicWorkOrderSelect = {
  number: true,
  title: true,
  description: true,
  priority: true,
  disciplina: true,
  createdAt: true,
  scheduledStart: true,
  scheduledEnd: true,
  targetSector: { select: { name: true } },
  requester: { select: { name: true } },
  assignedTo: { select: { name: true } },
  asset: { select: { name: true } },
} as const;

export async function listPublicOpenWorkOrdersController(_req: Request, res: Response) {
  const [abertas, programadas] = await Promise.all([
    prisma.workOrder.findMany({
      // excludedAt: null — mesma regra do "baú" (CLAUDE.md §5.2): OS excluída
      // logicamente não muda de status, então sem este filtro ela nunca sai
      // do quadro público.
      where: { status: WorkOrderStatus.ABERTA, excludedAt: null },
      select: publicWorkOrderSelect,
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.workOrder.findMany({
      where: { status: WorkOrderStatus.PROGRAMADA, excludedAt: null },
      select: publicWorkOrderSelect,
      take: 50,
    }),
  ]);

  programadas.sort((a, b) => PRIORITY_WEIGHT[a.priority as Priority] - PRIORITY_WEIGHT[b.priority as Priority]);

  res.json({ abertas, programadas });
}
