import { prisma } from "../../config/prisma";

export function listActiveSectors() {
  return prisma.sector.findMany({ where: { active: true }, orderBy: { name: "asc" } });
}
