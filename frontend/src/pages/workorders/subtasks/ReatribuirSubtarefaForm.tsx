import { FormEvent, useState } from "react";
import { useAuth } from "../../../auth/AuthContext";
import * as subtasksApi from "../../../api/subtasks";
import { useAssignableUsers } from "../../../hooks/useAssignableUsers";
import { SearchableSelect } from "../../../components/SearchableSelect";
import { Button } from "../../../components/Button";
import { getErrorMessage } from "../../../lib/errors";
import { Subtask } from "../../../types";

interface ReatribuirSubtarefaFormProps {
  subtask: Subtask;
  onSuccess: () => void;
  onClose: () => void;
}

export function ReatribuirSubtarefaForm({ subtask, onSuccess, onClose }: ReatribuirSubtarefaFormProps) {
  const { token } = useAuth();
  const { users } = useAssignableUsers(subtask.assignedToId);
  const [assignedToId, setAssignedToId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      await subtasksApi.updateSubtask(token, subtask.id, { assignedToId });
      onSuccess();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <SearchableSelect
        label="Novo responsável"
        value={assignedToId}
        onChange={setAssignedToId}
        options={users.map((u) => ({ value: u.id, label: u.name }))}
        placeholder="Selecione o novo responsável"
        required
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting || !assignedToId}>
          {submitting ? "Salvando…" : "Reatribuir"}
        </Button>
      </div>
    </form>
  );
}
