import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import * as partsApi from "../../api/parts";
import * as assetsApi from "../../api/assets";
import * as purchaseOrdersApi from "../../api/purchaseOrders";
import { Asset, Part } from "../../types";
import { Button } from "../../components/Button";
import { Input } from "../../components/Input";
import { Checkbox } from "../../components/Checkbox";
import { SearchableSelect } from "../../components/SearchableSelect";
import { getErrorMessage } from "../../lib/errors";
import { useToast } from "../../components/ToastProvider";

interface ItemRow {
  key: string;
  partId: string;
  quantity: number;
  supplierName: string;
  specificDestination: boolean;
  assetId: string;
}

function emptyRow(): ItemRow {
  return {
    key: crypto.randomUUID(),
    partId: "",
    quantity: 1,
    supplierName: "",
    specificDestination: false,
    assetId: "",
  };
}

export default function MontarPedido() {
  const { token } = useAuth();
  const { showError, showSuccess } = useToast();

  const [parts, setParts] = useState<Part[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ItemRow[]>([emptyRow()]);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    Promise.all([partsApi.listParts(token), assetsApi.listAssets(token)])
      .then(([partsResult, assetsResult]) => {
        setParts(partsResult);
        setAssets(assetsResult);
      })
      .catch((err) => showError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [token]);

  const partOptions = parts.map((p) => ({ value: p.id, label: `${p.code} — ${p.description}` }));
  const assetOptions = assets.map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }));

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

    if (rows.some((row) => row.specificDestination && !row.assetId)) {
      showError("Selecione o ativo de destino nos itens com destino específico.");
      return;
    }

    setGenerating(true);
    try {
      const items = rows.map((row) => ({
        partId: row.partId,
        quantity: row.quantity,
        ...(row.supplierName.trim() ? { supplierName: row.supplierName.trim() } : {}),
        ...(row.specificDestination && row.assetId ? { assetId: row.assetId } : {}),
      }));
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
            <div key={row.key} className="space-y-2 rounded border border-slate-200 p-3">
              <div className="flex items-end gap-2">
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

              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Input
                    label={index === 0 ? "Fornecedor" : undefined}
                    value={row.supplierName}
                    onChange={(e) => updateRow(row.key, { supplierName: e.target.value })}
                    placeholder="Opcional"
                  />
                </div>
                <div className="flex h-9 items-center">
                  <Checkbox
                    label="Destino específico"
                    checked={row.specificDestination}
                    onChange={(e) =>
                      updateRow(row.key, {
                        specificDestination: e.target.checked,
                        assetId: e.target.checked ? row.assetId : "",
                      })
                    }
                  />
                </div>
              </div>

              {row.specificDestination && (
                <SearchableSelect
                  value={row.assetId}
                  onChange={(assetId) => updateRow(row.key, { assetId })}
                  options={assetOptions}
                  placeholder="Buscar ativo…"
                />
              )}
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
