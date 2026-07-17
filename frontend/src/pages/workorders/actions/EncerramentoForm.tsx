import { FormEvent, useState } from "react";
import { useAuth } from "../../../auth/AuthContext";
import * as workOrdersApi from "../../../api/workorders";
import { Textarea } from "../../../components/Textarea";
import { Checkbox } from "../../../components/Checkbox";
import { Button } from "../../../components/Button";
import { getErrorMessage } from "../../../lib/errors";
import { ActionFormProps } from "./types";

export function EncerramentoForm({ workOrder, onSuccess, onClose }: ActionFormProps) {
  const { token } = useAuth();
  const [testNotes, setTestNotes] = useState("");
  const [cleanupDone, setCleanupDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      const updated = await workOrdersApi.encerramentoTecnico(token, workOrder.id, { testNotes, cleanupDone });
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
        label="Notas de teste com a operação"
        value={testNotes}
        onChange={(e) => setTestNotes(e.target.value)}
        required
      />
      <Checkbox
        label="Limpeza e organização do local (5S) realizada"
        checked={cleanupDone}
        onChange={(e) => setCleanupDone(e.target.checked)}
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Salvando…" : "Enviar para validação"}
        </Button>
      </div>
    </form>
  );
}
