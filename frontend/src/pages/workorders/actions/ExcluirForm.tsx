import { FormEvent, useState } from "react";
import { useAuth } from "../../../auth/AuthContext";
import * as workOrdersApi from "../../../api/workorders";
import { Textarea } from "../../../components/Textarea";
import { Button } from "../../../components/Button";
import { getErrorMessage } from "../../../lib/errors";
import { ActionFormProps } from "./types";

// Só chamado quando a OS está ABERTA (getAvailableActions em DetalheOS.tsx
// já garante isso) — o backend também valida (§5.2 do CLAUDE.md). Diferente
// de cancelar: não é uma transição de status, a OS some das telas e
// indicadores mas continua íntegra no banco, visível só no Baú.
export function ExcluirForm({ workOrder, onSuccess, onClose }: ActionFormProps) {
  const { token } = useAuth();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      const updated = await workOrdersApi.excluir(token, workOrder.id, { reason });
      onSuccess(updated);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-slate-600">
        Use isto só para uma OS aberta por engano. A OS não é apagada — some das telas e indicadores, mas
        continua visível no Baú com este motivo. Se a OS já andou (triagem, planejamento, execução), cancele-a
        em vez de excluir.
      </p>
      <Textarea label="Motivo (obrigatório)" value={reason} onChange={(e) => setReason(e.target.value)} required />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Voltar
        </Button>
        <Button type="submit" variant="danger" disabled={submitting}>
          {submitting ? "Excluindo…" : "Excluir OS"}
        </Button>
      </div>
    </form>
  );
}
