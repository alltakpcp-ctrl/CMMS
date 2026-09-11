import { Prisma } from "@prisma/client";
import { AppError } from "./AppError";
import { Role } from "../domain/enums";

// Valida uma lista de manutentores de apoio (assigneeIds): dedup, todos devem
// ser TECNICO ativo, e nenhum pode coincidir com o responsável principal
// (rejectIds) — ou é removido da lista silenciosamente quando for o próprio
// auto-atribuído (excludeIds). Compartilhado entre workorders/service.ts
// (planejamento/iniciar/programacao) e maintenance-plans/service.ts (geração
// de OS a partir de um plano de preventiva).
export async function resolveAssigneeIds(
  tx: Prisma.TransactionClient,
  assigneeIds: string[],
  options: { rejectIds?: Array<string | null | undefined>; excludeIds?: Array<string | null | undefined> } = {}
): Promise<string[]> {
  const excludeSet = new Set(options.excludeIds?.filter((id): id is string => Boolean(id)));
  const rejectSet = new Set(options.rejectIds?.filter((id): id is string => Boolean(id)));

  const deduped = Array.from(new Set(assigneeIds)).filter((id) => !excludeSet.has(id));

  if (deduped.some((id) => rejectSet.has(id))) {
    throw new AppError(
      422,
      "INVALID_ASSIGNEE",
      "O responsável pela OS não pode constar também como manutentor de apoio."
    );
  }

  if (deduped.length === 0) {
    return [];
  }

  const found = await tx.user.findMany({
    where: { id: { in: deduped } },
    select: { id: true, role: true, active: true },
  });
  const validIds = new Set(found.filter((u) => u.role === Role.TECNICO && u.active).map((u) => u.id));
  const allValid = deduped.every((id) => validIds.has(id));

  if (!allValid) {
    throw new AppError(
      422,
      "INVALID_ASSIGNEE",
      "Todos os manutentores de apoio devem ser usuários TECNICO ativos."
    );
  }

  return deduped;
}
