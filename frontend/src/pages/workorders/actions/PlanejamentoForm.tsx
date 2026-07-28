import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../../../auth/AuthContext";
import { useTecnicos } from "../../../hooks/useTecnicos";
import * as workOrdersApi from "../../../api/workorders";
import * as partsApi from "../../../api/parts";
import { Part } from "../../../types";
import { Textarea } from "../../../components/Textarea";
import { SearchableSelect } from "../../../components/SearchableSelect";
import { MultiSearchableSelect } from "../../../components/MultiSearchableSelect";
import { Input } from "../../../components/Input";
import { Button } from "../../../components/Button";
import { getErrorMessage } from "../../../lib/errors";
import { ActionFormProps } from "./types";

interface PartLine {
  partId: string;
  quantity: number;
}

export function PlanejamentoForm({ workOrder, onSuccess, onClose }: ActionFormProps) {
  const { token, user } = useAuth();
  const [availableParts, setAvailableParts] = useState<Part[]>([]);
  const [plan, setPlan] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [partLines, setPartLines] = useState<PartLine[]>([]);
  const [tools, setTools] = useState<string[]>([]);
  const [toolInput, setToolInput] = useState("");
  const [ppe, setPpe] = useState<string[]>([]);
  const [ppeInput, setPpeInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    partsApi
      .listParts(token)
      .then(setAvailableParts)
      .catch((err) => setError(getErrorMessage(err)));
  }, [token]);

  // Exclui o responsável já designado (se houver) e o próprio usuário — nenhum
  // dos dois pode constar como manutentor de apoio (ver workorders/service.ts).
  const { tecnicos } = useTecnicos(workOrder.assignedToId ?? user?.id);
  const tecnicoOptions = tecnicos
    .filter((t) => t.id !== workOrder.assignedToId)
    .map((t) => ({ value: t.id, label: t.name }));

  function addPartLine() {
    setPartLines((current) => [...current, { partId: "", quantity: 1 }]);
  }

  function updatePartLine(index: number, patch: Partial<PartLine>) {
    setPartLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function removePartLine(index: number) {
    setPartLines((current) => current.filter((_, i) => i !== index));
  }

  function addTool() {
    const value = toolInput.trim();
    if (!value) return;
    setTools((current) => [...current, value]);
    setToolInput("");
  }

  function removeTool(index: number) {
    setTools((current) => current.filter((_, i) => i !== index));
  }

  function addPpe() {
    const value = ppeInput.trim();
    if (!value) return;
    setPpe((current) => [...current, value]);
    setPpeInput("");
  }

  function removePpe(index: number) {
    setPpe((current) => current.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      const validPartLines = partLines.filter((l) => l.partId && l.quantity > 0);
      const updated = await workOrdersApi.planejamento(token, workOrder.id, {
        plan,
        plannedParts: validPartLines.length > 0 ? validPartLines : undefined,
        tools: tools.length > 0 ? tools : undefined,
        ppe: ppe.length > 0 ? ppe : undefined,
        assigneeIds,
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
      <Textarea
        label="Plano (escopo, procedimentos, observações)"
        value={plan}
        onChange={(e) => setPlan(e.target.value)}
        required
      />

      <div>
        <MultiSearchableSelect
          label="Manutentores de apoio (além do responsável principal)"
          value={assigneeIds}
          onChange={setAssigneeIds}
          options={tecnicoOptions}
          placeholder="Buscar técnico…"
        />
        <p className="mt-1 text-xs text-slate-500">
          Manutentores envolvidos: {1 + assigneeIds.length} (1 responsável principal + {assigneeIds.length} de apoio)
        </p>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium text-slate-700">Peças</p>
          <Button type="button" variant="secondary" onClick={addPartLine}>
            + Adicionar peça
          </Button>
        </div>

        <div className="space-y-2">
          {partLines.map((line, index) => (
            <div key={index} className="flex items-start gap-2">
              <div className="flex-1">
                <SearchableSelect
                  value={line.partId}
                  onChange={(partId) => updatePartLine(index, { partId })}
                  options={availableParts.map((part) => ({ value: part.id, label: `${part.code} — ${part.description}` }))}
                  placeholder="Selecione a peça"
                  required
                />
              </div>
              <div className="w-28">
                <Input
                  type="number"
                  min={1}
                  value={line.quantity}
                  onChange={(e) => updatePartLine(index, { quantity: Number(e.target.value) })}
                />
              </div>
              <Button type="button" variant="ghost" onClick={() => removePartLine(index)}>
                Remover
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">Ferramentas</p>
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <Input
              value={toolInput}
              onChange={(e) => setToolInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTool();
                }
              }}
              placeholder="Ex.: Chave de fenda"
            />
          </div>
          <Button type="button" variant="secondary" onClick={addTool}>
            + Adicionar
          </Button>
        </div>
        {tools.length > 0 && (
          <ul className="mt-2 space-y-1">
            {tools.map((tool, index) => (
              <li key={index} className="flex items-center justify-between rounded border border-slate-200 px-3 py-1 text-sm">
                {tool}
                <Button type="button" variant="ghost" onClick={() => removeTool(index)}>
                  Remover
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">EPIs</p>
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <Input
              value={ppeInput}
              onChange={(e) => setPpeInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addPpe();
                }
              }}
              placeholder="Ex.: Óculos de proteção"
            />
          </div>
          <Button type="button" variant="secondary" onClick={addPpe}>
            + Adicionar
          </Button>
        </div>
        {ppe.length > 0 && (
          <ul className="mt-2 space-y-1">
            {ppe.map((item, index) => (
              <li key={index} className="flex items-center justify-between rounded border border-slate-200 px-3 py-1 text-sm">
                {item}
                <Button type="button" variant="ghost" onClick={() => removePpe(index)}>
                  Remover
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Salvando…" : "Confirmar planejamento"}
        </Button>
      </div>
    </form>
  );
}
