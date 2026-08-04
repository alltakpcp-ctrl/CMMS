import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import * as partsApi from "../../api/parts";
import * as purchaseOrdersApi from "../../api/purchaseOrders";
import { Part } from "../../types";
import { Button } from "../../components/Button";
import { Input } from "../../components/Input";
import { SearchableSelect } from "../../components/SearchableSelect";
import { getErrorMessage } from "../../lib/errors";
import { useToast } from "../../components/ToastProvider";

interface ItemRow {
  key: string;
  partId: string;
  quantity: number;
}

function emptyRow(): ItemRow {
  return { key: crypto.randomUUID(), partId: "", quantity: 1 };
}

export default function MontarPedido() {
  const { token } = useAuth();
  const { showError, showSuccess } = useToast();

  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ItemRow[]>([emptyRow()]);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    partsApi
      .listParts(token)
      .then(setParts)
      .catch((err) => showError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [token]);

  const partOptions = parts.map((p) => ({ value: p.id, label: `${p.code} — ${p.description}` }));

  function updateRow(key: string, changes: Partial<ItemRow>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...changes } : row)));
  }

  function addRow() {
    setRows((current) => [...current, emptyRow()]);
  }

  function removeRow(key: string) {
    setRows((current) => current.filter((row) => row.key !== key));
  }

  async function handleGenerate() {
    if (!token) return;

    if (rows.length === 0 || rows.some((row) => !row.partId || row.quantity < 1)) {
      showError("Preencha a peça e uma quantidade de ao menos 1 em todos os itens.");
      return;
    }

    setGenerating(true);
    try {
      const items = rows.map((row) => ({ partId: row.partId, quantity: row.quantity }));
      await purchaseOrdersApi.createPurchaseOrder(token, { items });
      showSuccess("Pedido de compra gerado.");
      setRows([emptyRow()]);
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Montar Pedido</h1>
        <p className="text-sm text-slate-500">Selecione as peças e quantidades para o pedido de compra.</p>
      </div>

      {loading && <p className="text-sm text-slate-500">Carregando…</p>}

      {!loading && (
        <div className="space-y-3">
          {rows.map((row, index) => (
            <div key={row.key} className="flex items-end gap-2">
              <div className="flex-1">
                <SearchableSelect
                  label={index === 0 ? "Peça" : undefined}
                  value={row.partId}
                  onChange={(partId) => updateRow(row.key, { partId })}
                  options={partOptions}
                  placeholder="Buscar peça…"
                />
              </div>
              <div className="w-28">
                <Input
                  label={index === 0 ? "Quantidade" : undefined}
                  type="number"
                  min={1}
                  value={row.quantity}
                  onChange={(e) => updateRow(row.key, { quantity: Number(e.target.value) })}
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => removeRow(row.key)}
                disabled={rows.length === 1}
              >
                Remover
              </Button>
            </div>
          ))}

          <div className="flex items-center justify-between">
            <Button type="button" variant="secondary" onClick={addRow}>
              Adicionar item
            </Button>
            <Button type="button" onClick={handleGenerate} disabled={generating}>
              {generating ? "Gerando…" : "Gerar pedido de compra"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
