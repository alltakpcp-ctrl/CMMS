import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { WorkOrderStatus } from "../domain/enums";
import { STATUS_COLORS, STATUS_LABELS, TYPE_LABELS } from "../domain/labels";
import * as workOrdersApi from "../api/workorders";
import { WorkOrder } from "../types";
import { Table } from "../components/Table";
import { Badge } from "../components/Badge";
import { EmptyState } from "../components/EmptyState";
import { formatDate } from "../lib/format";
import { getErrorMessage } from "../lib/errors";
import { useToast } from "../components/ToastProvider";

const QUEUE_STATUSES: WorkOrderStatus[] = [WorkOrderStatus.ABERTA, WorkOrderStatus.TRIAGEM, WorkOrderStatus.PLANEJADA];

export default function FilaTriagem() {
  const { token } = useAuth();
  const { showError } = useToast();
  const navigate = useNavigate();

  const [items, setItems] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    setLoading(true);

    Promise.all(QUEUE_STATUSES.map((status) => workOrdersApi.listWorkOrders(token, { status, pageSize: 100 })))
      .then((results) => {
        const all = results.flatMap((r) => r.items);
        all.sort((a, b) => b.asset.criticality - a.asset.criticality);
        setItems(all);
      })
      .catch((err) => showError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [token, showError]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Fila de triagem e planejamento</h1>
        <p className="text-sm text-slate-500">
          OS abertas, em triagem ou planejadas, ordenadas pela criticidade do ativo.
        </p>
      </div>

      {loading && <p className="text-sm text-slate-500">Carregando…</p>}

      {!loading && items.length === 0 && (
        <EmptyState title="Fila vazia" description="Não há OS pendentes de triagem ou planejamento." />
      )}

      {!loading && items.length > 0 && (
        <Table
          rows={items}
          rowKey={(wo) => wo.id}
          onRowClick={(wo) => navigate(`/ordens/${wo.id}`)}
          columns={[
            { header: "Número", cell: (wo) => <span className="font-medium text-slate-900">{wo.number}</span> },
            { header: "Ativo", cell: (wo) => `${wo.asset.name} (criticidade ${wo.asset.criticality})` },
            { header: "Tipo", cell: (wo) => TYPE_LABELS[wo.type] },
            {
              header: "Status",
              cell: (wo) => <Badge color={STATUS_COLORS[wo.status]}>{STATUS_LABELS[wo.status]}</Badge>,
            },
            { header: "Data", cell: (wo) => formatDate(wo.createdAt) },
          ]}
        />
      )}
    </div>
  );
}
