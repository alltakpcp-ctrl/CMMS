import { FormEvent, useState } from "react";
import { useAuth } from "../../../auth/AuthContext";
import * as workOrdersApi from "../../../api/workorders";
import { Textarea } from "../../../components/Textarea";
import { Button } from "../../../components/Button";
import { getErrorMessage } from "../../../lib/errors";
import { ActionFormProps } from "./types";

export function ValidarForm({ workOrder, onSuccess, onClose }: ActionFormProps) {
  const { token } = useAuth();
  const [approve, setApprove] = useState(true);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      const updated = await workOrdersApi.validar(token, workOrder.id, {
        approve,
        note: approve ? undefined : note,
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
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" checked={approve} onChange={() => setApprove(true)} />
          Aprovar e encerrar
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" checked={!approve} onChange={() => setApprove(false)} />
          Reprovar (retorna para execução)
        </label>
      </div>

      {!approve && (
        <Textarea
          label="Nota (obrigatória ao reprovar)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          required
        />
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Salvando…" : approve ? "Aprovar e encerrar" : "Reprovar validação"}
        </Button>
      </div>
    </form>
  );
}
