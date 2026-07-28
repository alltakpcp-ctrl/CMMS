import { FormEvent, useState } from "react";
import { useAuth } from "../../../auth/AuthContext";
import { useTecnicos } from "../../../hooks/useTecnicos";
import { WorkOrderStatus } from "../../../domain/enums";
import * as workOrdersApi from "../../../api/workorders";
import { Textarea } from "../../../components/Textarea";
import { MultiSearchableSelect } from "../../../components/MultiSearchableSelect";
import { Button } from "../../../components/Button";
import { getErrorMessage } from "../../../lib/errors";
import { ActionFormProps } from "./types";

export function IniciarForm({ workOrder, onSuccess, onClose }: ActionFormProps) {
  const { token, user } = useAuth();
  const [riskAnalysis, setRiskAnalysis] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Início imediato (TRIAGEM/PLANEJADA sem responsável ainda): o próprio
  // usuário logado vira o principal por auto-atribuição (ver workorders/
  // service.ts#iniciar). Caso contrário o principal já é o assignedTo.
  const isImmediateStart =
    (workOrder.status === WorkOrderStatus.TRIAGEM || workOrder.status === WorkOrderStatus.PLANEJADA) &&
    !workOrder.assignedToId;
  const principalId = isImmediateStart ? user?.id : workOrder.assignedToId ?? undefined;

  const { tecnicos } = useTecnicos(principalId);
  const tecnicoOptions = tecnicos
    .filter((t) => t.id !== principalId)
    .map((t) => ({ value: t.id, label: t.name }));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      const updated = await workOrdersApi.iniciar(token, workOrder.id, { riskAnalysis, assigneeIds });
      onSuccess(updated);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Textarea
        label="Análise de risco"
        value={riskAnalysis}
        onChange={(e) => setRiskAnalysis(e.target.value)}
        placeholder="Bloqueio de energia, EPIs necessários, riscos identificados…"
        required
      />

      <div>
        <MultiSearchableSelect
          label="Manutentores de apoio (além do responsável principal)"
          value={assigneeIds}
          onChange={setAssigneeIds}
          options={tecnicoOptions}
          placeholder="Buscar técnico…"
        />
        <p className="mt-1 text-xs text-slate-500">
          Manutentores envolvidos: {1 + assigneeIds.length} (1 responsável principal + {assigneeIds.length} de apoio)
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Salvando…" : "Iniciar execução"}
        </Button>
      </div>
    </form>
  );
}
