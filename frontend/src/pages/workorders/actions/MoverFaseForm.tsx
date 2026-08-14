import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../../../auth/AuthContext";
import * as workOrdersApi from "../../../api/workorders";
import * as subtasksApi from "../../../api/subtasks";
import { WorkOrderStatus } from "../../../domain/enums";
import { STATUS_LABELS } from "../../../domain/labels";
import { Select } from "../../../components/Select";
import { Textarea } from "../../../components/Textarea";
import { Button } from "../../../components/Button";
import { getErrorMessage } from "../../../lib/errors";
import { ActionFormProps } from "./types";

const ALL_STATUSES = Object.values(WorkOrderStatus);

const MIN_NOTE_LENGTH = 5;

function isTerminal(status: WorkOrderStatus): boolean {
  return status === WorkOrderStatus.ENCERRADA || status === WorkOrderStatus.CANCELADA;
}

export function MoverFaseForm({ workOrder, onSuccess, onClose }: ActionFormProps) {
  const { token } = useAuth();
  const [toStatus, setToStatus] = useState<WorkOrderStatus>(workOrder.status);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hasOpenSubtask, setHasOpenSubtask] = useState(false);

  useEffect(() => {
    if (!token) return;
    subtasksApi
      .listSubtasks(token, workOrder.id)
      .then((subtasks) => setHasOpenSubtask(subtasks.some((s) => s.status === "ABERTA")))
      .catch(() => setHasOpenSubtask(false));
  }, [token, workOrder.id]);

  const noChange = toStatus === workOrder.status;
  const noteTooShort = note.trim().length < MIN_NOTE_LENGTH;
  const affectsIndicators = isTerminal(toStatus) || isTerminal(workOrder.status);
  const blockedByOpenSubtask = toStatus === WorkOrderStatus.ENCERRADA && hasOpenSubtask;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      const updated = await workOrdersApi.timelineOverride(token, workOrder.id, { toStatus, note });
      onSuccess(updated);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-slate-600">
        Mover a OS para outra fase manualmente. A mudança fica registrada no histórico.
      </p>

      {affectsIndicators && (
        <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Atenção: isso envolve um status encerrado/cancelado e afeta os indicadores (MTTR/MTBF/backlog).
        </p>
      )}

      <Select
        label="Novo status"
        value={toStatus}
        onChange={(e) => setToStatus(e.target.value as WorkOrderStatus)}
      >
        {ALL_STATUSES.map((status) => (
          <option
            key={status}
            value={status}
            disabled={status === WorkOrderStatus.ENCERRADA && hasOpenSubtask}
          >
            {STATUS_LABELS[status]}
          </option>
        ))}
      </Select>

      {blockedByOpenSubtask && (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          Conclua ou cancele as subtarefas abertas antes de encerrar a OS.
        </p>
      )}

      <Textarea
        label="Motivo do override (obrigatório)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        required
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Voltar
        </Button>
        <Button type="submit" disabled={submitting || noChange || noteTooShort || blockedByOpenSubtask}>
          {submitting ? "Movendo…" : "Mover fase"}
        </Button>
      </div>
    </form>
  );
}
