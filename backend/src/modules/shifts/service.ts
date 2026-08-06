import { prisma } from "../../config/prisma";

export function listActiveShifts() {
  return prisma.shift.findMany({
    where: { active: true },
    select: { id: true, name: true, startTime: true, endTime: true },
    orderBy: { name: "asc" },
  });
}
