import { FormEvent, useState } from "react";
import { useAuth } from "../../../auth/AuthContext";
import { useSectors } from "../../../hooks/useSectors";
import { Priority } from "../../../domain/enums";
import { PRIORITY_LABELS } from "../../../domain/labels";
import * as workOrdersApi from "../../../api/workorders";
import { Select } from "../../../components/Select";
import { Button } from "../../../components/Button";
import { getErrorMessage } from "../../../lib/errors";
import { ActionFormProps } from "./types";

export function TriagemForm({ workOrder, onSuccess, onClose }: ActionFormProps) {
  const { token } = useAuth();
  const { sectors, loading: loadingSectors } = useSectors(token);
  const [priority, setPriority] = useState<Priority>(Priority.MEDIA);
  const [targetSectorId, setTargetSectorId] = useState(workOrder.asset.sectorId);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token || !targetSectorId) return;
    setSubmitting(true);
    setError(null);
    try {
      const updated = await workOrdersApi.triagem(token, workOrder.id, { priority, targetSectorId });
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

      <Select
        label="Setor destino"
        value={targetSectorId}
        onChange={(e) => setTargetSectorId(e.target.value)}
        disabled={loadingSectors}
        required
      >
        <option value="" disabled>
          {loadingSectors ? "Carregando setores..." : "Selecione um setor"}
        </option>
        {sectors.map((sector) => (
          <option key={sector.id} value={sector.id}>
            {sector.name}
          </option>
        ))}
      </Select>

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
