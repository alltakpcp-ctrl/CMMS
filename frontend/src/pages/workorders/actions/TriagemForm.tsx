import { FormEvent, useState } from "react";
import { useAuth } from "../../../auth/AuthContext";
import { useSectors } from "../../../hooks/useSectors";
import { MaintenancePeriodicity, Priority, WorkOrderType } from "../../../domain/enums";
import { MAINTENANCE_PERIODICITY_LABELS, PRIORITY_LABELS } from "../../../domain/labels";
import * as workOrdersApi from "../../../api/workorders";
import { Select } from "../../../components/Select";
import { SearchableSelect } from "../../../components/SearchableSelect";
import { Button } from "../../../components/Button";
import { getErrorMessage } from "../../../lib/errors";
import { ActionFormProps } from "./types";

export function TriagemForm({ workOrder, onSuccess, onClose }: ActionFormProps) {
  const { token } = useAuth();
  const { sectors, loading: loadingSectors } = useSectors(token);
  const [priority, setPriority] = useState<Priority>(Priority.MEDIA);
  const [targetSectorId, setTargetSectorId] = useState(workOrder.asset.sectorId);
  const [periodicity, setPeriodicity] = useState<MaintenancePeriodicity | "">(
    workOrder.maintenancePlan?.periodicity ?? ""
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isPreventiva = workOrder.type === WorkOrderType.PREVENTIVA;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token || !targetSectorId) return;
    setSubmitting(true);
    setError(null);
    try {
      const updated = await workOrdersApi.triagem(token, workOrder.id, {
        priority,
        targetSectorId,
        ...(isPreventiva && periodicity ? { periodicity } : {}),
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
      <Select label="Prioridade" value={priority} onChange={(e) => setPriority(e.target.value as Priority)} required>
        {Object.values(Priority).map((value) => (
          <option key={value} value={value}>
            {PRIORITY_LABELS[value]}
          </option>
        ))}
      </Select>

      <SearchableSelect
        label="Setor destino"
        value={targetSectorId}
        onChange={setTargetSectorId}
        options={sectors.map((sector) => ({ value: sector.id, label: sector.name }))}
        placeholder={loadingSectors ? "Carregando setores..." : "Selecione um setor"}
        disabled={loadingSectors}
        required
      />

      {isPreventiva && (
        <Select
          label="Periodicidade"
          value={periodicity}
          onChange={(e) => setPeriodicity(e.target.value as MaintenancePeriodicity | "")}
        >
          <option value="">Sem periodicidade definida</option>
          {Object.values(MaintenancePeriodicity).map((value) => (
            <option key={value} value={value}>
              {MAINTENANCE_PERIODICITY_LABELS[value]}
            </option>
          ))}
        </Select>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Salvando…" : "Confirmar triagem"}
        </Button>
      </div>
    </form>
  );
}
