import { FormEvent, useState } from "react";
import { useAuth } from "../../../auth/AuthContext";
import * as subtasksApi from "../../../api/subtasks";
import { useAssignableUsers } from "../../../hooks/useAssignableUsers";
import { Input } from "../../../components/Input";
import { Textarea } from "../../../components/Textarea";
import { SearchableSelect } from "../../../components/SearchableSelect";
import { Button } from "../../../components/Button";
import { getErrorMessage } from "../../../lib/errors";

interface AbrirSubtarefaFormProps {
  workOrderId: string;
  onSuccess: () => void;
  onClose: () => void;
}

export function AbrirSubtarefaForm({ workOrderId, onSuccess, onClose }: AbrirSubtarefaFormProps) {
  const { token, user } = useAuth();
  const { users } = useAssignableUsers();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState(30);
  const [assignedToId, setAssignedToId] = useState(user?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      await subtasksApi.createSubtask(token, workOrderId, {
        title,
        description: description || undefined,
        estimatedMinutes,
        assignedToId: assignedToId || undefined,
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
      <Input label="Título" value={title} onChange={(e) => setTitle(e.target.value)} required />
      <Textarea
        label="Descrição (opcional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <Input
        label="Estimativa (minutos)"
        type="number"
        min={1}
        value={estimatedMinutes}
        onChange={(e) => setEstimatedMinutes(Number(e.target.value))}
        required
      />
      <SearchableSelect
        label="Responsável"
        value={assignedToId}
        onChange={setAssignedToId}
        options={users.map((u) => ({ value: u.id, label: u.name }))}
        placeholder="Selecione o responsável"
        required
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Salvando…" : "Abrir subtarefa"}
        </Button>
      </div>
    </form>
  );
}
