import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../../../auth/AuthContext";
import { Role } from "../../../domain/enums";
import * as workOrdersApi from "../../../api/workorders";
import * as usersApi from "../../../api/users";
import { PublicUser } from "../../../types";
import { Input } from "../../../components/Input";
import { Select } from "../../../components/Select";
import { Button } from "../../../components/Button";
import { getErrorMessage } from "../../../lib/errors";
import { ActionFormProps } from "./types";

export function ProgramacaoForm({ workOrder, onSuccess, onClose }: ActionFormProps) {
  const { token } = useAuth();
  const [tecnicos, setTecnicos] = useState<PublicUser[]>([]);
  const [scheduledStart, setScheduledStart] = useState("");
  const [scheduledEnd, setScheduledEnd] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    usersApi
      .listUsers(token)
      .then((users) => setTecnicos(users.filter((u) => u.role === Role.TECNICO && u.active)))
      .catch((err) => setError(getErrorMessage(err)));
  }, [token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      const updated = await workOrdersApi.programacao(token, workOrder.id, {
        scheduledStart: new Date(scheduledStart).toISOString(),
        scheduledEnd: new Date(scheduledEnd).toISOString(),
        assignedToId,
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
      <Select label="Técnico responsável" value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)} required>
        <option value="" disabled>
          Selecione um técnico
        </option>
        {tecnicos.map((tecnico) => (
          <option key={tecnico.id} value={tecnico.id}>
            {tecnico.name}
          </option>
        ))}
      </Select>

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
