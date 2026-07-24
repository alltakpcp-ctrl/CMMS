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
  createdAt: true,
  targetSector: { select: { name: true } },
  requester: { select: { name: true } },
} as const;

export async function listPublicOpenWorkOrdersController(_req: Request, res: Response) {
  const [abertas, programadas] = await Promise.all([
    prisma.workOrder.findMany({
      where: { status: WorkOrderStatus.ABERTA },
      select: publicWorkOrderSelect,
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.workOrder.findMany({
      where: { status: WorkOrderStatus.PROGRAMADA },
      select: publicWorkOrderSelect,
      take: 50,
    }),
  ]);

  programadas.sort((a, b) => PRIORITY_WEIGHT[a.priority as Priority] - PRIORITY_WEIGHT[b.priority as Priority]);

  res.json({ abertas, programadas });
}
