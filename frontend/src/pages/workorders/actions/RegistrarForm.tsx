import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../../../auth/AuthContext";
import * as workOrdersApi from "../../../api/workorders";
import * as partsApi from "../../../api/parts";
import { Part } from "../../../types";
import { Textarea } from "../../../components/Textarea";
import { Select } from "../../../components/Select";
import { Input } from "../../../components/Input";
import { Button } from "../../../components/Button";
import { getErrorMessage } from "../../../lib/errors";
import { ActionFormProps } from "./types";

interface PartLine {
  partId: string;
  quantity: number;
}

export function RegistrarForm({ workOrder, onSuccess, onClose }: ActionFormProps) {
  const { token } = useAuth();
  const [parts, setParts] = useState<Part[]>([]);
  const [rootCause, setRootCause] = useState("");
  const [repairDescription, setRepairDescription] = useState("");
  const [lines, setLines] = useState<PartLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    partsApi
      .listParts(token)
      .then(setParts)
      .catch((err) => setError(getErrorMessage(err)));
  }, [token]);

  function addLine() {
    setLines((current) => [...current, { partId: "", quantity: 1 }]);
  }

  function updateLine(index: number, patch: Partial<PartLine>) {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function removeLine(index: number) {
    setLines((current) => current.filter((_, i) => i !== index));
  }

  function stockFor(partId: string) {
    return parts.find((p) => p.id === partId)?.stockQty ?? null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      const validLines = lines.filter((l) => l.partId && l.quantity > 0);
      const updated = await workOrdersApi.registrar(token, workOrder.id, {
        rootCause,
        repairDescription,
        parts: validLines.length > 0 ? validLines : undefined,
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
      <Textarea label="Causa raiz" value={rootCause} onChange={(e) => setRootCause(e.target.value)} required />
      <Textarea
        label="Descrição do reparo"
        value={repairDescription}
        onChange={(e) => setRepairDescription(e.target.value)}
        required
      />

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium text-slate-700">Peças utilizadas (opcional)</p>
          <Button type="button" variant="secondary" onClick={addLine}>
            + Adicionar peça
          </Button>
        </div>

        <div className="space-y-2">
          {lines.map((line, index) => {
            const stock = stockFor(line.partId);
            const exceedsStock = stock !== null && line.quantity > stock;
            return (
              <div key={index} className="flex items-start gap-2">
                <div className="flex-1">
                  <Select
                    value={line.partId}
                    onChange={(e) => updateLine(index, { partId: e.target.value })}
                    required
                  >
                    <option value="" disabled>
                      Selecione a peça
                    </option>
                    {parts.map((part) => (
                      <option key={part.id} value={part.id}>
                        {part.code} — {part.description} (saldo: {part.stockQty})
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="w-28">
                  <Input
                    type="number"
                    min={1}
                    value={line.quantity}
                    onChange={(e) => updateLine(index, { quantity: Number(e.target.value) })}
                    error={exceedsStock ? "Acima do saldo" : undefined}
                  />
                </div>
                <Button type="button" variant="ghost" onClick={() => removeLine(index)}>
                  Remover
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Salvando…" : "Registrar execução"}
        </Button>
      </div>
    </form>
  );
}
