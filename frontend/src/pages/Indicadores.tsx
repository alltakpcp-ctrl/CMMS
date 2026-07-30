import { useEffect, useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { useAuth } from "../auth/AuthContext";
import { useSectors } from "../hooks/useSectors";
import * as indicatorsApi from "../api/indicators";
import {
  AssetIndicator,
  BacklogResult,
  DistributionResult,
  LifecycleResult,
  Overview,
  TechnicianEfficiency,
} from "../api/indicators";
import { WorkOrderStatus } from "../domain/enums";
import { STATUS_LABELS, TYPE_LABELS } from "../domain/labels";
import { Card } from "../components/Card";
import { Input } from "../components/Input";
import { SearchableSelect } from "../components/SearchableSelect";
import { EmptyState } from "../components/EmptyState";
import { getErrorMessage } from "../lib/errors";
import { useToast } from "../components/ToastProvider";
import { formatHours, formatPercentage } from "../lib/format";
import { BacklogChart } from "./indicators/BacklogChart";
import { PhaseDurationChart, BarItem } from "./indicators/PhaseDurationChart";
import { TechnicianEfficiencyPanel } from "./indicators/TechnicianEfficiencyPanel";

type SortKey = "name" | "mttrHours" | "mtbfHours";

// Ordem canônica do ciclo de vida da OS (§6 do CLAUDE.md) — usada para manter
// a leitura da fase/donut sempre na mesma sequência, independente da ordem em
// que os status aparecem nos dados filtrados (cor segue a entidade, não o
// ranking do período — ver skill de dataviz).
const STATUS_ORDER: string[] = [
  WorkOrderStatus.ABERTA,
  WorkOrderStatus.TRIAGEM,
  WorkOrderStatus.PLANEJADA,
  WorkOrderStatus.PROGRAMADA,
  WorkOrderStatus.EM_EXECUCAO,
  WorkOrderStatus.AGUARDANDO_VALIDACAO,
  WorkOrderStatus.ENCERRADA,
  WorkOrderStatus.CANCELADA,
];

// Paleta categórica de 8 cores distinguíveis (ordem validada — ver skill de
// dataviz, references/palette.md), local a esta tela. NÃO é o STATUS_COLORS
// de labels.ts — aquele serve ao Badge e reaproveita cores de propósito.
const STATUS_DONUT_COLORS: Record<string, string> = {
  ABERTA: "#2a78d6",
  TRIAGEM: "#eb6834",
  PLANEJADA: "#1baf7a",
  PROGRAMADA: "#eda100",
  EM_EXECUCAO: "#e87ba4",
  AGUARDANDO_VALIDACAO: "#008300",
  ENCERRADA: "#4a3aa7",
  CANCELADA: "#e34948",
};
const FALLBACK_COLOR = "#c3c2b7";

function statusLabel(status: string): string {
  return (STATUS_LABELS as Record<string, string>)[status] ?? status;
}

function typeLabel(type: string): string {
  return (TYPE_LABELS as Record<string, string>)[type] ?? type;
}

function orderByCanonicalStatus<T extends { status: string }>(items: T[]): T[] {
  const known = STATUS_ORDER.map((status) => items.find((item) => item.status === status)).filter(
    (item): item is T => Boolean(item)
  );
  const unknown = items.filter((item) => !STATUS_ORDER.includes(item.status));
  return [...known, ...unknown];
}

export default function Indicadores() {
  const { token } = useAuth();
  const { showError } = useToast();
  const { sectors, loading: loadingSectors } = useSectors(token);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [targetSectorId, setTargetSectorId] = useState("");

  const [overview, setOverview] = useState<Overview | null>(null);
  const [byAsset, setByAsset] = useState<AssetIndicator[]>([]);
  const [backlog, setBacklog] = useState<BacklogResult | null>(null);
  const [lifecycle, setLifecycle] = useState<LifecycleResult | null>(null);
  const [distribution, setDistribution] = useState<DistributionResult | null>(null);
  const [technicians, setTechnicians] = useState<TechnicianEfficiency[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDesc, setSortDesc] = useState(false);

  useEffect(() => {
    if (!token) return;
    setLoading(true);

    const filters: indicatorsApi.IndicatorsFilters = {
      ...(from && { from: new Date(from).toISOString() }),
      ...(to && { to: new Date(to).toISOString() }),
      ...(targetSectorId && { targetSectorId }),
    };

    Promise.all([
      indicatorsApi.getOverview(token, filters),
      indicatorsApi.getByAsset(token, filters),
      indicatorsApi.getBacklog(token, filters),
      indicatorsApi.getLifecycle(token, filters),
      indicatorsApi.getDistribution(token, filters),
      indicatorsApi.getTechnicianEfficiency(token, filters),
    ])
      .then(([overviewResult, byAssetResult, backlogResult, lifecycleResult, distributionResult, technicianEfficiencyResult]) => {
        setOverview(overviewResult);
        setByAsset(byAssetResult);
        setBacklog(backlogResult);
        setLifecycle(lifecycleResult);
        setDistribution(distributionResult);
        setTechnicians(technicianEfficiencyResult.technicians);
      })
      .catch((err) => showError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [token, from, to, targetSectorId, showError]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDesc((d) => !d);
    } else {
      setSortKey(key);
      setSortDesc(true);
    }
  }

  const sortedAssets = [...byAsset].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "name") cmp = a.name.localeCompare(b.name);
    else {
      const av = a[sortKey] ?? -1;
      const bv = b[sortKey] ?? -1;
      cmp = av - bv;
    }
    return sortDesc ? -cmp : cmp;
  });

  const phaseDurationItems: BarItem[] =
    lifecycle && lifecycle.phaseDurations.byPhase.length > 0
      ? orderByCanonicalStatus(lifecycle.phaseDurations.byPhase).map((phase) => ({
          key: phase.status,
          label: statusLabel(phase.status),
          value: phase.avgHours ?? 0,
          displayValue: formatHours(phase.avgHours),
          note: phase.openCount > 0 ? "inclui OS em andamento" : undefined,
        }))
      : [];

  const oldestOpenSorted = lifecycle
    ? [...lifecycle.phaseDurations.oldestOpen].sort((a, b) => b.hours - a.hours)
    : [];

  const byStatusOrdered = distribution ? orderByCanonicalStatus(distribution.distribution.byStatus) : [];

  const typeItems: BarItem[] = distribution
    ? [...distribution.distribution.byType]
        .sort((a, b) => b.count - a.count)
        .map((t) => ({
          key: t.type,
          label: typeLabel(t.type),
          value: t.count,
          displayValue: String(t.count),
        }))
    : [];

  const trend = distribution?.trend ?? null;
  const showTrendArrow = trend !== null && trend.deltaPercent !== null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Indicadores</h1>
        <p className="text-sm text-slate-500">MTBF, MTTR, aderência à programação e backlog.</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-44">
          <Input label="De" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="w-44">
          <Input label="Até" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="w-44">
          <SearchableSelect
            label="Setor"
            value={targetSectorId}
            onChange={setTargetSectorId}
            disabled={loadingSectors}
            options={[
              { value: "", label: loadingSectors ? "Carregando setores..." : "Todos" },
              ...sectors.map((sector) => ({ value: sector.id, label: sector.name })),
            ]}
          />
        </div>
      </div>

      {loading && <p className="text-sm text-slate-500">Carregando…</p>}

      {!loading && overview && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <Card>
            <p className="text-sm text-slate-500">MTTR (tempo médio de reparo)</p>
            <p className="mt-1 text-3xl font-semibold text-slate-900">{formatHours(overview.mttrHours)}</p>
          </Card>
          <Card>
            <p className="text-sm text-slate-500">MTBF (tempo médio entre falhas)</p>
            <p className="mt-1 text-3xl font-semibold text-slate-900">{formatHours(overview.mtbfHours)}</p>
          </Card>
          <Card>
            <p className="text-sm text-slate-500">Aderência à programação</p>
            <p className="mt-1 text-3xl font-semibold text-slate-900">
              {formatPercentage(overview.adherencePercentage)}
            </p>
          </Card>
          <Card>
            <p className="text-sm text-slate-500">Backlog total</p>
            <p className="mt-1 text-3xl font-semibold text-slate-900">{overview.backlogTotal}</p>
            {showTrendArrow && trend && (
              <p
                className={`mt-1 text-xs font-medium ${
                  trend.deltaPercent! < 0 ? "text-green-700" : trend.deltaPercent! > 0 ? "text-red-700" : "text-slate-500"
                }`}
              >
                {trend.deltaPercent! < 0 ? "▼" : trend.deltaPercent! > 0 ? "▲" : "—"}{" "}
                {Math.abs(trend.deltaPercent!).toFixed(1)}% na abertura de OS vs. período anterior
              </p>
            )}
          </Card>
          <Card>
            <p className="text-sm text-slate-500">OS encerradas no período</p>
            <p className="mt-1 text-3xl font-semibold text-slate-900">{lifecycle?.throughput.total ?? "—"}</p>
          </Card>
        </div>
      )}

      {!loading && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Tempo médio por fase</h2>
            {phaseDurationItems.length > 0 ? (
              <PhaseDurationChart items={phaseDurationItems} barColor="#2a78d6" />
            ) : (
              <EmptyState title="Sem dados de ciclo de vida" description="Nenhuma transição de status no período/setor filtrado." />
            )}
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Gargalo em tempo real</h2>
            {oldestOpenSorted.length > 0 ? (
              <div className="space-y-2">
                {oldestOpenSorted.map((item) => (
                  <div
                    key={item.workOrderId}
                    className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm"
                  >
                    <p className="font-medium text-slate-900">{statusLabel(item.status)}</p>
                    <div className="mt-0.5 flex items-center justify-between">
                      <span className="text-xs text-slate-500">{item.workOrderId}</span>
                      <span className="tabular-nums font-semibold text-slate-900">{formatHours(item.hours)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="Nenhuma OS parada no momento" />
            )}
          </Card>
        </div>
      )}

      {!loading && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <h2 className="mb-3 text-sm font-semibold text-slate-900">OS por status</h2>
            {byStatusOrdered.length > 0 ? (
              <div className="flex flex-col items-center gap-4 sm:flex-row">
                <div style={{ width: "100%", maxWidth: 220, height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={byStatusOrdered}
                        dataKey="count"
                        nameKey="status"
                        innerRadius="55%"
                        outerRadius="80%"
                        paddingAngle={1}
                      >
                        {byStatusOrdered.map((entry) => (
                          <Cell key={entry.status} fill={STATUS_DONUT_COLORS[entry.status] ?? FALLBACK_COLOR} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value, name) => [value, statusLabel(String(name))]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-1 flex-col gap-1.5 text-sm">
                  {byStatusOrdered.map((entry) => (
                    <div key={entry.status} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                          style={{ backgroundColor: STATUS_DONUT_COLORS[entry.status] ?? FALLBACK_COLOR }}
                        />
                        <span className="text-slate-700">{statusLabel(entry.status)}</span>
                      </div>
                      <span className="tabular-nums font-medium text-slate-900">{entry.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState title="Sem OS no período/setor filtrado" />
            )}
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Mix por tipo</h2>
            {typeItems.length > 0 ? (
              <PhaseDurationChart items={typeItems} barColor="#eb6834" />
            ) : (
              <EmptyState title="Sem OS no período/setor filtrado" />
            )}
          </Card>
        </div>
      )}

      {!loading && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Painel de Eficiência</h2>
          <TechnicianEfficiencyPanel technicians={technicians} />
        </div>
      )}

      {!loading && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Backlog por setor e prioridade</h2>
          {backlog && backlog.total > 0 ? (
            <BacklogChart groups={backlog.bySectorAndPriority} sectors={sectors} />
          ) : (
            <EmptyState title="Sem backlog" description="Não há OS pendentes de execução no período/setor filtrado." />
          )}
        </Card>
      )}

      {!loading && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Indicadores por ativo</h2>
          {sortedAssets.length === 0 ? (
            <EmptyState title="Sem dados" />
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  <th className="cursor-pointer select-none pb-2" onClick={() => toggleSort("name")}>
                    Ativo {sortKey === "name" && (sortDesc ? "▼" : "▲")}
                  </th>
                  <th className="cursor-pointer select-none pb-2" onClick={() => toggleSort("mtbfHours")}>
                    MTBF {sortKey === "mtbfHours" && (sortDesc ? "▼" : "▲")}
                  </th>
                  <th className="cursor-pointer select-none pb-2" onClick={() => toggleSort("mttrHours")}>
                    MTTR {sortKey === "mttrHours" && (sortDesc ? "▼" : "▲")}
                  </th>
                  <th className="pb-2">Criticidade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedAssets.map((asset) => (
                  <tr key={asset.assetId} className={asset.criticality >= 4 ? "bg-red-50" : ""}>
                    <td className="py-2 font-medium text-slate-900">
                      {asset.code} — {asset.name}
                    </td>
                    <td className="py-2 tabular-nums text-slate-700">{formatHours(asset.mtbfHours)}</td>
                    <td className="py-2 tabular-nums text-slate-700">{formatHours(asset.mttrHours)}</td>
                    <td className="py-2 tabular-nums text-slate-700">{asset.criticality}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </div>
  );
}
