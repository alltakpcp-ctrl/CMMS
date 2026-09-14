import { useEffect, useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { useAuth } from "../../auth/AuthContext";
import * as stockApi from "../../api/stock";
import { StockDashboard } from "../../types";
import { StockStatus } from "../../domain/enums";
import { STOCK_MOVEMENT_TYPE_COLORS, STOCK_MOVEMENT_TYPE_LABELS, STOCK_STATUS_LABELS } from "../../domain/labels";
import { Card } from "../../components/Card";
import { Table } from "../../components/Table";
import { Badge } from "../../components/Badge";
import { EmptyState } from "../../components/EmptyState";
import { useToast } from "../../components/ToastProvider";
import { getErrorMessage } from "../../lib/errors";
import { formatCurrency, formatDateTime } from "../../lib/format";
import { PhaseDurationChart, BarItem } from "../indicators/PhaseDurationChart";

// Mesma paleta categórica validada usada no donut de status de OS em
// Indicadores.tsx (ver skill de dataviz, references/palette.md) — reaproveitada
// aqui por severidade (URGENTE=crítico .. EXCESSO=informativo), não reciclada
// de outro papel.
const STATUS_DASHBOARD_COLORS: Record<StockStatus, string> = {
  URGENTE: "#e34948",
  ALERTA: "#eda100",
  BOM: "#1baf7a",
  EXCESSO: "#2a78d6",
};
const FALLBACK_COLOR = "#c3c2b7";

function situacaoGiro(days: number | null): string {
  if (days === null) return "Nunca teve saída";
  return `${days} dias sem saída`;
}

export function EstoqueDashboard() {
  const { token } = useAuth();
  const { showError } = useToast();
  const [data, setData] = useState<StockDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    stockApi
      .getStockDashboard(token)
      .then(setData)
      .catch((err) => showError(getErrorMessage(err)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (loading) return <p className="text-sm text-slate-500">Carregando…</p>;
  if (!data) return <EmptyState title="Não foi possível carregar o dashboard" />;

  const armarioItems: BarItem[] = data.byArmario.map((a) => ({
    key: a.armario,
    label: a.armario,
    value: a.stockQty,
    displayValue: `${a.stockQty} un.`,
    note: `${a.count} peça(s)`,
  }));

  const topUsedItems: BarItem[] = data.topUsedParts.map((p) => ({
    key: p.partId,
    label: `${p.code} — ${p.description}`,
    value: p.totalQuantity,
    displayValue: `${p.totalQuantity} ${p.unit}`,
  }));

  const topConsumingAssetItems: BarItem[] = data.topConsumingAssets.map((a) => ({
    key: a.assetId,
    label: `${a.assetCode} — ${a.assetName}`,
    value: a.totalQuantity,
    displayValue: `${a.totalQuantity} un.`,
    note: a.topPart
      ? `mais consumida: ${a.topPart.code} — ${a.topPart.description} (${a.topPart.quantity} un.)`
      : `${a.distinctPartsCount} peça(s) diferentes`,
  }));

  const statusTotal = data.byStatus.reduce((sum, s) => sum + s.count, 0);
  const urgentCount = data.byStatus.find((s) => s.status === "URGENTE")?.count ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Card>
          <p className="text-sm text-slate-500">Peças ativas</p>
          <p className="mt-1 text-3xl font-semibold text-slate-900">{data.summary.totalParts}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Saldo total (unidades)</p>
          <p className="mt-1 text-3xl font-semibold text-slate-900">{data.summary.totalStockQty}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Valor total em estoque</p>
          <p className="mt-1 text-3xl font-semibold text-slate-900">{formatCurrency(data.summary.totalValue)}</p>
          {data.summary.partsWithoutCost > 0 && (
            <p className="mt-1 text-xs text-slate-500">
              {data.summary.partsWithoutCost} peça(s) sem custo cadastrado — valor parcial
            </p>
          )}
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Peças em urgência</p>
          <p className={`mt-1 text-3xl font-semibold ${urgentCount > 0 ? "text-red-700" : "text-slate-900"}`}>
            {urgentCount}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Sem giro (90+ dias)</p>
          <p className="mt-1 text-3xl font-semibold text-slate-900">{data.deadStock.length}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Status do estoque</h2>
          {statusTotal > 0 ? (
            <div className="flex flex-col items-center gap-4 sm:flex-row">
              <div style={{ width: "100%", maxWidth: 200, height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.byStatus}
                      dataKey="count"
                      nameKey="status"
                      innerRadius="55%"
                      outerRadius="80%"
                      paddingAngle={1}
                    >
                      {data.byStatus.map((entry) => (
                        <Cell key={entry.status} fill={STATUS_DASHBOARD_COLORS[entry.status] ?? FALLBACK_COLOR} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, name) => [value, STOCK_STATUS_LABELS[name as StockStatus] ?? String(name)]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-1 flex-col gap-1.5 text-sm">
                {data.byStatus.map((entry) => (
                  <div key={entry.status} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                        style={{ backgroundColor: STATUS_DASHBOARD_COLORS[entry.status] ?? FALLBACK_COLOR }}
                      />
                      <span className="text-slate-700">{STOCK_STATUS_LABELS[entry.status]}</span>
                    </div>
                    <span className="tabular-nums font-medium text-slate-900">{entry.count} peças</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState title="Nenhuma peça cadastrada" />
          )}
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Top 10 ativos que mais consomem peças</h2>
          {topConsumingAssetItems.length > 0 ? (
            <PhaseDurationChart items={topConsumingAssetItems} barColor="#4a3aa7" />
          ) : (
            <EmptyState
              title="Nenhum consumo de peça registrado ainda"
              description="Calculado a partir das baixas de peças aprovadas, atreladas ao ativo da OS."
            />
          )}
        </Card>
      </div>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Quantidade por armário</h2>
        {armarioItems.length > 0 ? (
          <PhaseDurationChart items={armarioItems} barColor="#2a78d6" />
        ) : (
          <EmptyState title="Nenhuma peça com localização cadastrada" />
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Peças mais utilizadas (Top 20)</h2>
        {topUsedItems.length > 0 ? (
          <PhaseDurationChart items={topUsedItems} barColor="#eb6834" />
        ) : (
          <EmptyState
            title="Nenhuma saída de estoque registrada ainda"
            description="O ranking é calculado a partir das baixas de peças aprovadas em OS."
          />
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="text-sm font-semibold text-slate-900">Peças sem giro</h2>
          <p className="mb-3 mt-1 text-xs text-slate-500">
            Saldo positivo sem nenhuma saída nos últimos 90 dias (ou nunca movimentadas).
          </p>
          {data.deadStock.length > 0 ? (
            <Table
              rows={data.deadStock}
              rowKey={(p) => p.id}
              columns={[
                { header: "Peça", cell: (p) => `${p.code} — ${p.description}` },
                { header: "Saldo", cell: (p) => p.stockQty },
                { header: "Situação", cell: (p) => situacaoGiro(p.daysSinceLastOutbound) },
              ]}
            />
          ) : (
            <EmptyState title="Nenhuma peça parada" />
          )}
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Últimas movimentações</h2>
          {data.recentMovements.length > 0 ? (
            <Table
              rows={data.recentMovements}
              rowKey={(m) => m.id}
              columns={[
                { header: "Data", cell: (m) => formatDateTime(m.createdAt) },
                { header: "Peça", cell: (m) => `${m.partCode} — ${m.partDescription}` },
                {
                  header: "Tipo",
                  cell: (m) => (
                    <Badge color={STOCK_MOVEMENT_TYPE_COLORS[m.type]}>{STOCK_MOVEMENT_TYPE_LABELS[m.type]}</Badge>
                  ),
                },
                { header: "Qtd.", cell: (m) => m.quantity },
                { header: "Por", cell: (m) => m.userName ?? "—" },
              ]}
            />
          ) : (
            <EmptyState title="Nenhuma movimentação registrada" />
          )}
        </Card>
      </div>
    </div>
  );
}
