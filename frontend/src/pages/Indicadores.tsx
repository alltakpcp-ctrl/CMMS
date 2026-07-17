import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { Sector } from "../domain/enums";
import { SECTOR_LABELS } from "../domain/labels";
import * as indicatorsApi from "../api/indicators";
import { AssetIndicator, BacklogResult, Overview } from "../api/indicators";
import { Card } from "../components/Card";
import { Input } from "../components/Input";
import { Select } from "../components/Select";
import { EmptyState } from "../components/EmptyState";
import { getErrorMessage } from "../lib/errors";
import { useToast } from "../components/ToastProvider";
import { BacklogChart } from "./indicators/BacklogChart";

type SortKey = "name" | "mttrHours" | "mtbfHours";

function formatHours(value: number | null): string {
  if (value === null) return "—";
  return `${value.toFixed(1)} h`;
}

function formatPercentage(value: number | null): string {
  if (value === null) return "—";
  return `${value.toFixed(1)}%`;
}

export default function Indicadores() {
  const { token } = useAuth();
  const { showError } = useToast();

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [targetSector, setTargetSector] = useState<Sector | "">("");

  const [overview, setOverview] = useState<Overview | null>(null);
  const [byAsset, setByAsset] = useState<AssetIndicator[]>([]);
  const [backlog, setBacklog] = useState<BacklogResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDesc, setSortDesc] = useState(false);

  useEffect(() => {
    if (!token) return;
    setLoading(true);

    const filters: indicatorsApi.IndicatorsFilters = {
      ...(from && { from: new Date(from).toISOString() }),
      ...(to && { to: new Date(to).toISOString() }),
      ...(targetSector && { targetSector }),
    };

    Promise.all([
      indicatorsApi.getOverview(token, filters),
      indicatorsApi.getByAsset(token, filters),
      indicatorsApi.getBacklog(token, filters),
    ])
      .then(([overviewResult, byAssetResult, backlogResult]) => {
        setOverview(overviewResult);
        setByAsset(byAssetResult);
        setBacklog(backlogResult);
      })
      .catch((err) => showError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [token, from, to, targetSector, showError]);

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
          <Select label="Setor" value={targetSector} onChange={(e) => setTargetSector(e.target.value as Sector | "")}>
            <option value="">Todos</option>
            {Object.values(Sector).map((value) => (
              <option key={value} value={value}>
                {SECTOR_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {loading && <p className="text-sm text-slate-500">Carregando…</p>}

      {!loading && overview && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
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
          </Card>
        </div>
      )}

      {!loading && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Backlog por setor e prioridade</h2>
          {backlog && backlog.total > 0 ? (
            <BacklogChart groups={backlog.bySectorAndPriority} />
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
