import { FormEvent, useState } from "react";
import { useAuth } from "../../../auth/AuthContext";
import * as subtasksApi from "../../../api/subtasks";
import { PartsConsumptionFields, PartLine } from "../../../components/PartsConsumptionFields";
import { Button } from "../../../components/Button";
import { getErrorMessage } from "../../../lib/errors";
import { Subtask } from "../../../types";

interface FinalizarSubtarefaFormProps {
  subtask: Subtask;
  onSuccess: () => void;
  onClose: () => void;
}

export function FinalizarSubtarefaForm({ subtask, onSuccess, onClose }: FinalizarSubtarefaFormProps) {
  const { token } = useAuth();
  const [lines, setLines] = useState<PartLine[]>([]);
  const [partsNotApplicable, setPartsNotApplicable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const validLines = lines.filter((l) => l.partId && l.quantity > 0);
  const partsDeclared = partsNotApplicable || validLines.length > 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (!partsDeclared) {
      setError("Informe as peças utilizadas ou marque que não houve consumo.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await subtasksApi.finishSubtask(token, subtask.id, {
        parts: partsNotApplicable ? undefined : validLines,
        partsNotApplicable,
      });
      onSuccess();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PartsConsumptionFields
        lines={lines}
        notApplicable={partsNotApplicable}
        onLinesChange={setLines}
        onNotApplicableChange={setPartsNotApplicable}
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Salvando…" : "Finalizar"}
        </Button>
      </div>
    </form>
  );
}
