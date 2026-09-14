import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import * as partsApi from "../api/parts";
import { Part } from "../types";
import { SearchableSelect } from "./SearchableSelect";
import { Input } from "./Input";
import { Button } from "./Button";
import { Checkbox } from "./Checkbox";
import { getErrorMessage } from "../lib/errors";

export interface PartLine {
  partId: string;
  quantity: number;
}

interface PartsConsumptionFieldsProps {
  lines: PartLine[];
  notApplicable: boolean;
  onLinesChange: (lines: PartLine[]) => void;
  onNotApplicableChange: (value: boolean) => void;
}

// Declaração obrigatória de consumo de peças (OS: encerramento técnico;
// subtarefa: conclusão) — ou ao menos 1 linha, ou "não aplica". A baixa em
// si fica pendente de aprovação de quem tem canManageStock; aqui só se
// declara o que foi usado.
export function PartsConsumptionFields({
  lines,
  notApplicable,
  onLinesChange,
  onNotApplicableChange,
}: PartsConsumptionFieldsProps) {
  const { token } = useAuth();
  const [parts, setParts] = useState<Part[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    partsApi
      .listParts(token)
      .then(setParts)
      .catch((err) => setError(getErrorMessage(err)));
  }, [token]);

  function addLine() {
    onLinesChange([...lines, { partId: "", quantity: 1 }]);
  }

  function updateLine(index: number, patch: Partial<PartLine>) {
    onLinesChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function removeLine(index: number) {
    onLinesChange(lines.filter((_, i) => i !== index));
  }

  function toggleNotApplicable(checked: boolean) {
    onNotApplicableChange(checked);
    if (checked) {
      onLinesChange([]);
    }
  }

  function stockFor(partId: string) {
    return parts.find((p) => p.id === partId)?.stockQty ?? null;
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium text-slate-700">Peças utilizadas</p>
        {!notApplicable && (
          <Button type="button" variant="secondary" onClick={addLine}>
            + Adicionar peça
          </Button>
        )}
      </div>

      <Checkbox
        label="Nenhuma peça foi utilizada"
        checked={notApplicable}
        onChange={(e) => toggleNotApplicable(e.target.checked)}
      />

      {!notApplicable && (
        <div className="mt-2 space-y-2">
          {lines.map((line, index) => {
            const stock = stockFor(line.partId);
            const exceedsStock = stock !== null && line.quantity > stock;
            return (
              <div key={index} className="flex items-start gap-2">
                <div className="flex-1">
                  <SearchableSelect
                    value={line.partId}
                    onChange={(partId) => updateLine(index, { partId })}
                    options={parts.map((part) => ({
                      value: part.id,
                      label: `${part.code} — ${part.description} (saldo: ${part.stockQty})`,
                    }))}
                    placeholder="Selecione a peça"
                    required
                  />
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
          {lines.length === 0 && (
            <p className="text-sm text-slate-500">Nenhuma peça adicionada ainda.</p>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
