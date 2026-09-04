import { FormEvent, useState } from "react";
import { useAuth } from "../../../auth/AuthContext";
import { useTecnicos } from "../../../hooks/useTecnicos";
import * as workOrdersApi from "../../../api/workorders";
import { WorkOrderType } from "../../../domain/enums";
import { Input } from "../../../components/Input";
import { MultiSearchableSelect } from "../../../components/MultiSearchableSelect";
import { Button } from "../../../components/Button";
import { getErrorMessage } from "../../../lib/errors";
import { ActionFormProps } from "./types";

export function ProgramacaoForm({ workOrder, onSuccess, onClose }: ActionFormProps) {
  const { token } = useAuth();
  const { tecnicos } = useTecnicos();
  const tecnicoOptions = tecnicos.map((t) => ({ value: t.id, label: t.name }));
  const isPreventiva = workOrder.type === WorkOrderType.PREVENTIVA;
  const [scheduledStart, setScheduledStart] = useState("");
  const [scheduledEnd, setScheduledEnd] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [estimatedMinutes, setEstimatedMinutes] = useState(workOrder.estimatedMinutes?.toString() ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (assigneeIds.length === 0) {
      setError("Selecione ao menos um técnico.");
      return;
    }
    if (isPreventiva && !estimatedMinutes) {
      setError("Tempo estimado do serviço é obrigatório para programar manutenção preventiva.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const updated = await workOrdersApi.programacao(token, workOrder.id, {
        scheduledStart: new Date(scheduledStart).toISOString(),
        scheduledEnd: new Date(scheduledEnd).toISOString(),
        assigneeIds,
        estimatedMinutes: estimatedMinutes ? Number(estimatedMinutes) : undefined,
      });
      onSuccess(updated);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="Início programado"
        type="datetime-local"
        value={scheduledStart}
        onChange={(e) => setScheduledStart(e.target.value)}
        required
      />
      <Input
        label="Fim programado"
        type="datetime-local"
        value={scheduledEnd}
        onChange={(e) => setScheduledEnd(e.target.value)}
        required
      />
      <MultiSearchableSelect
        label="Técnicos"
        value={assigneeIds}
        onChange={setAssigneeIds}
        options={tecnicoOptions}
        placeholder="Buscar técnico…"
      />
      <Input
        label={`Tempo estimado do serviço (minutos)${isPreventiva ? "" : " — opcional"}`}
        type="number"
        min={1}
        value={estimatedMinutes}
        onChange={(e) => setEstimatedMinutes(e.target.value)}
        required={isPreventiva}
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Salvando…" : "Confirmar programação"}
        </Button>
      </div>
    </form>
  );
}
