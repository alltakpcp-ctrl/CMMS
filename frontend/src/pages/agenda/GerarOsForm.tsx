import { FormEvent, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { useTecnicos } from "../../hooks/useTecnicos";
import * as maintenancePlansApi from "../../api/maintenancePlans";
import { WorkOrder } from "../../types";
import { Input } from "../../components/Input";
import { MultiSearchableSelect } from "../../components/MultiSearchableSelect";
import { Button } from "../../components/Button";
import { getErrorMessage } from "../../lib/errors";

interface GerarOsFormProps {
  planId: string;
  onSuccess: (workOrder: WorkOrder) => void;
  onClose: () => void;
}

// Gera um novo ciclo de OS a partir de um plano de preventiva já existente
// (POST /maintenance-plans/:id/gerar-os) — a OS nasce já PROGRAMADA, sem
// passar por triagem/planejamento. Mesmos campos usados na criação do plano
// (ver MaintenancePlanModal), só que aqui o plano (checklist/periodicidade)
// já existe — só falta agendar o próximo ciclo.
export function GerarOsForm({ planId, onSuccess, onClose }: GerarOsFormProps) {
  const { token } = useAuth();
  const { tecnicos } = useTecnicos();
  const tecnicoOptions = tecnicos.map((t) => ({ value: t.id, label: t.name }));

  const [scheduledStart, setScheduledStart] = useState("");
  const [scheduledEnd, setScheduledEnd] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (assigneeIds.length === 0) {
      setError("Selecione ao menos um técnico.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const workOrder = await maintenancePlansApi.generateWorkOrderFromPlan(token, planId, {
        scheduledStart: new Date(scheduledStart).toISOString(),
        scheduledEnd: new Date(scheduledEnd).toISOString(),
        assigneeIds,
      });
      onSuccess(workOrder);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="Início"
        type="datetime-local"
        value={scheduledStart}
        onChange={(e) => setScheduledStart(e.target.value)}
        required
      />
      <Input
        label="Fim estimado"
        type="datetime-local"
        value={scheduledEnd}
        onChange={(e) => setScheduledEnd(e.target.value)}
        required
      />
      <MultiSearchableSelect
        label="Técnico(s) responsável(is)"
        value={assigneeIds}
        onChange={setAssigneeIds}
        options={tecnicoOptions}
        placeholder="Buscar técnico…"
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Gerando…" : "Gerar OS"}
        </Button>
      </div>
    </form>
  );
}
