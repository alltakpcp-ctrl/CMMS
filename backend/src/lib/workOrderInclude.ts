import { Prisma } from "@prisma/client";
import { publicUserSelect } from "./publicUser";

// Include padrão de WorkOrder, compartilhado entre workorders/service.ts e
// lib/generateWorkOrderFromPlan.ts (geração automática/manual de OS a partir
// de um MaintenancePlan) — extraído para lib/ para evitar dependência
// circular entre os dois módulos.
export const workOrderInclude = {
  asset: true,
  targetSector: true,
  requester: { select: publicUserSelect },
  assignedTo: { select: publicUserSelect },
  assignees: { include: { user: { select: { id: true, name: true } } } },
  maintenancePlan: { select: { id: true, periodicity: true, active: true } },
  executions: {
    orderBy: { startedAt: "asc" },
    include: {
      logs: {
        include: { author: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  },
  parts: { include: { part: true } },
  plannedPartItems: { include: { part: true } },
  stockWithdrawalRequests: { include: { items: { include: { part: true } } } },
} satisfies Prisma.WorkOrderInclude;
