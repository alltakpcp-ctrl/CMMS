import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../../auth/AuthContext";
import { Role } from "../../../domain/enums";
import { SUBTASK_STATUS_COLORS, SUBTASK_STATUS_LABELS } from "../../../domain/labels";
import * as subtasksApi from "../../../api/subtasks";
import { useAssignableUsers } from "../../../hooks/useAssignableUsers";
import { Subtask, WorkOrder } from "../../../types";
import { Card } from "../../../components/Card";
import { Badge } from "../../../components/Badge";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { useToast } from "../../../components/ToastProvider";
import { getErrorMessage } from "../../../lib/errors";
import { formatDuration } from "../../../lib/format";
import { AbrirSubtarefaForm } from "./AbrirSubtarefaForm";
import { ReatribuirSubtarefaForm } from "./ReatribuirSubtarefaForm";

type ModalState = { type: "abrir" } | { type: "reatribuir"; subtask: Subtask } | null;

function diffMinutes(from: string, to: Date): number {
  return Math.floor((to.getTime() - new Date(from).getTime()) / 60000);
}

function getDurationLabel(subtask: Subtask): string | null {
  if (subtask.status === "CONCLUIDA") {
    if (!subtask.finishedAt) return null;
    const minutes = diffMinutes(subtask.createdAt, new Date(subtask.finishedAt));
    return `Duração: ${formatDuration(minutes)}`;
  }
  if (subtask.status === "ABERTA") {
    const minutes = diffMinutes(subtask.createdAt, new Date());
    return `Em andamento: ${formatDuration(minutes)}`;
  }
  return null;
}

export function SubtaskPanel({ workOrder }: { workOrder: WorkOrder }) {
  const { token, user } = useAuth();
  const { showError, showSuccess } = useToast();
  const { users: assignableUsers } = useAssignableUsers();

  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalState>(null);
  const [, setNow] = useState(() => new Date());

  const userNameById = useMemo(
    () => new Map(assignableUsers.map((u) => [u.id, u.name])),
    [assignableUsers]
  );

  const reloadSubtasks = useCallback(() => {
    if (!token) return;
    setLoading(true);
    subtasksApi
      .listSubtasks(token, workOrder.id)
      .then(setSubtasks)
      .catch((err) => showError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [token, workOrder.id, showError]);

  useEffect(reloadSubtasks, [reloadSubtasks]);

  useEffect(() => {
    const hasOpenSubtask = subtasks.some((subtask) => subtask.status === "ABERTA");
    if (!hasOpenSubtask) return;
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, [subtasks]);

  function closeModal() {
    setModal(null);
  }

  function handleModalSuccess() {
    closeModal();
    showSuccess("Subtarefa atualizada com sucesso.");
    reloadSubtasks();
  }

  async function handleFinish(subtask: Subtask) {
    if (!token) return;
    try {
      await subtasksApi.finishSubtask(token, subtask.id);
      showSuccess("Subtarefa finalizada.");
      reloadSubtasks();
    } catch (err) {
      showError(getErrorMessage(err));
    }
  }

  async function handleCancel(subtask: Subtask) {
    if (!token) return;
    if (!window.confirm(`Cancelar a subtarefa "${subtask.title}"?`)) return;
    try {
      await subtasksApi.cancelSubtask(token, subtask.id);
      showSuccess("Subtarefa cancelada.");
      reloadSubtasks();
    } catch (err) {
      showError(getErrorMessage(err));
    }
  }

  if (!user) return null;

  function canAct(subtask: Subtask) {
    return user!.role === Role.SUPERVISOR || subtask.assignedToId === user!.id;
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Subtarefas</h2>
        <Button variant="secondary" onClick={() => setModal({ type: "abrir" })}>
          + Abrir subtarefa
        </Button>
      </div>

      {loading && <p className="text-sm text-slate-500">Carregando…</p>}

      {!loading && subtasks.length === 0 && (
        <p className="text-sm text-slate-500">Nenhuma subtarefa registrada.</p>
      )}

      {!loading && subtasks.length > 0 && (
        <ul className="space-y-2">
          {subtasks.map((subtask) => {
            const durationLabel = getDurationLabel(subtask);
            return (
              <li
                key={subtask.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 p-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-900">{subtask.title}</p>
                    <Badge color={SUBTASK_STATUS_COLORS[subtask.status]}>
                      {SUBTASK_STATUS_LABELS[subtask.status]}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Estimativa: {subtask.estimatedMinutes} min · Responsável:{" "}
                    {userNameById.get(subtask.assignedToId) ?? "—"}
                    {durationLabel && <> · {durationLabel}</>}
                  </p>
                  {subtask.description && (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{subtask.description}</p>
                  )}
                </div>

                {subtask.status === "ABERTA" && canAct(subtask) && (
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => setModal({ type: "reatribuir", subtask })}>
                      Reatribuir
                    </Button>
                    <Button variant="primary" onClick={() => handleFinish(subtask)}>
                      Finalizar
                    </Button>
                    <Button variant="danger" onClick={() => handleCancel(subtask)}>
                      Cancelar
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {modal?.type === "abrir" && (
        <Modal title="Abrir subtarefa" onClose={closeModal}>
          <AbrirSubtarefaForm workOrderId={workOrder.id} onSuccess={handleModalSuccess} onClose={closeModal} />
        </Modal>
      )}
      {modal?.type === "reatribuir" && (
        <Modal title="Reatribuir subtarefa" onClose={closeModal}>
          <ReatribuirSubtarefaForm subtask={modal.subtask} onSuccess={handleModalSuccess} onClose={closeModal} />
        </Modal>
      )}
    </Card>
  );
}
