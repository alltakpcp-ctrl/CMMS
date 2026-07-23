import { Request, Response } from "express";
import { prisma } from "../../config/prisma";
import { WorkOrderStatus } from "../../domain/enums";

export async function listPublicOpenWorkOrdersController(_req: Request, res: Response) {
  const items = await prisma.workOrder.findMany({
    where: { status: WorkOrderStatus.ABERTA },
    select: {
      number: true,
      title: true,
      description: true,
      priority: true,
      createdAt: true,
      targetSector: { select: { name: true } },
      requester: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  res.json(items);
}
