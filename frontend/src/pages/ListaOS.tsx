import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Role, WorkOrderStatus, WorkOrderType } from "../domain/enums";
import { PRIORITY_COLORS, PRIORITY_LABELS, STATUS_COLORS, STATUS_LABELS, TYPE_LABELS } from "../domain/labels";
import * as assetsApi from "../api/assets";
import * as workOrdersApi from "../api/workorders";
import { Asset, WorkOrder } from "../types";
import { Select } from "../components/Select";
import { SearchableSelect } from "../components/SearchableSelect";
import { Button } from "../components/Button";
import { Badge } from "../components/Badge";
import { Table } from "../components/Table";
import { EmptyState } from "../components/EmptyState";
import { formatDate } from "../lib/format";
import { getErrorMessage } from "../lib/errors";
import { useToast } from "../components/ToastProvider";

export default function ListaOS() {
  const { token, user } = useAuth();
  const { showError } = useToast();
  const navigate = useNavigate();

  const [items, setItems] = useState<WorkOrder[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<WorkOrderStatus | "">("");
  const [type, setType] = useState<WorkOrderType | "">("");
  const [assetId, setAssetId] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);

  useEffect(() => {
    if (!token) return;
    assetsApi
      .listAssets(token)
      .then(setAssets)
      .catch((err) => showError(getErrorMessage(err)));
  }, [token, showError]);

  const visibleAssets =
    user?.role === Role.OPERADOR ? assets.filter((asset) => asset.sectorId === user.sectorId) : assets;

  useEffect(() => {
    if (!token || !user) return;
    setLoading(true);

    const filters: workOrdersApi.ListWorkOrdersFilters = {
      pageSize: 100,
      ...(status && { status }),
      ...(type && { type }),
      ...(assetId && { assetId }),
    };

    if (onlyMine) {
      if (user.role === "TECNICO") filters.assignedToId = user.id;
      else filters.requesterId = user.id;
    }

    workOrdersApi
      .listWorkOrders(token, filters)
      .then((result) => setItems(result.items))
      .catch((err) => showError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [token, user, status, type, assetId, onlyMine, showError]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Ordens de serviço</h1>
        <p className="text-sm text-slate-500">Todas as OS visíveis para o seu perfil.</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-44">
          <Select
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value as WorkOrderStatus | "")}
          >
            <option value="">Todos</option>
            {Object.values(WorkOrderStatus).map((value) => (
              <option key={value} value={value}>
                {STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>

        <div className="w-40">
          <Select label="Tipo" value={type} onChange={(e) => setType(e.target.value as WorkOrderType | "")}>
            <option value="">Todos</option>
            {Object.values(WorkOrderType).map((value) => (
              <option key={value} value={value}>
                {TYPE_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>

        <div className="w-48">
          <SearchableSelect
            label="Ativo"
            value={assetId}
            onChange={setAssetId}
            options={[
              { value: "", label: "Todos" },
              ...visibleAssets.map((asset) => ({ value: asset.id, label: `${asset.code} — ${asset.name}` })),
            ]}
          />
        </div>

        <Button variant={onlyMine ? "primary" : "secondary"} type="button" onClick={() => setOnlyMine((v) => !v)}>
          Minhas OS
        </Button>
      </div>

      {loading && <p className="text-sm text-slate-500">Carregando…</p>}

      {!loading && items.length === 0 && (
        <EmptyState title="Nenhuma OS encontrada" description="Ajuste os filtros ou abra uma nova solicitação." />
      )}

      {!loading && items.length > 0 && (
        <Table
          rows={items}
          rowKey={(wo) => wo.id}
          onRowClick={(wo) => navigate(`/ordens/${wo.id}`)}
          columns={[
            { header: "Número", cell: (wo) => <span className="font-medium text-slate-900">{wo.number}</span> },
            { header: "Ativo", cell: (wo) => wo.asset.name },
            { header: "Tipo", cell: (wo) => TYPE_LABELS[wo.type] },
            {
              header: "Status",
              cell: (wo) => <Badge color={STATUS_COLORS[wo.status]}>{STATUS_LABELS[wo.status]}</Badge>,
            },
            {
              header: "Prioridade",
              cell: (wo) =>
                wo.priority ? <Badge color={PRIORITY_COLORS[wo.priority]}>{PRIORITY_LABELS[wo.priority]}</Badge> : "—",
            },
            { header: "Setor", cell: (wo) => wo.targetSector?.name ?? "—" },
            { header: "Responsável", cell: (wo) => wo.assignedTo?.name ?? "—" },
            { header: "Data", cell: (wo) => formatDate(wo.createdAt) },
          ]}
        />
      )}
    </div>
  );
}
