import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { WorkOrderStatus, WorkOrderType } from "../../domain/enums";
import { STATUS_COLORS, STATUS_LABELS } from "../../domain/labels";
import * as workOrdersApi from "../../api/workorders";
import { WorkOrder } from "../../types";
import { Table } from "../../components/Table";
import { Badge } from "../../components/Badge";
import { EmptyState } from "../../components/EmptyState";
import { Card } from "../../components/Card";
import { formatDateTime, formatHours } from "../../lib/format";
import { getErrorMessage } from "../../lib/errors";
import { useToast } from "../../components/ToastProvider";
import { MaintenanceCalendar } from "./MaintenanceCalendar";

const SCHEDULED_STATUSES = new Set<WorkOrderStatus>([WorkOrderStatus.PROGRAMADA, WorkOrderStatus.EM_EXECUCAO]);

export default function PreventivasTecnico() {
  const { token, user } = useAuth();
  const { showError } = useToast();
  const navigate = useNavigate();

  const [items, setItems] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || !user) return;
    setLoading(true);

    Promise.all([
      workOrdersApi.listWorkOrders(token, { type: WorkOrderType.PREVENTIVA, assignedToId: user.id, pageSize: 100 }),
      workOrdersApi.listWorkOrders(token, { type: WorkOrderType.PREVENTIVA, asSupport: true, pageSize: 100 }),
    ])
      .then(([principal, apoio]) => {
        const byId = new Map<string, WorkOrder>();
        for (const wo of [...principal.items, ...apoio.items]) byId.set(wo.id, wo);
        const scheduled = Array.from(byId.values())
          .filter((wo) => SCHEDULED_STATUSES.has(wo.status))
          .sort((a, b) => (a.scheduledStart ?? "").localeCompare(b.scheduledStart ?? ""));
        setItems(scheduled);
      })
      .catch((err) => showError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [token, user, showError]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Preventivas</h1>
        <p className="text-sm text-slate-500">
          Calendário de preventivas — adicione novas preventivas (gera a OS na hora) e veja as já programadas.
        </p>
      </div>

      <MaintenanceCalendar />

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Minhas OS preventivas programadas</h2>
        {loading ? (
          <p className="text-sm text-slate-500">Carregando…</p>
        ) : items.length === 0 ? (
          <EmptyState
            title="Nenhuma preventiva programada"
            description="Você não tem OS preventivas programadas ou em execução no momento."
          />
        ) : (
          <Table
            rows={items}
            rowKey={(wo) => wo.id}
            onRowClick={(wo) => navigate(`/ordens/${wo.id}`)}
            columns={[
              { header: "Número", cell: (wo) => <span className="font-medium text-slate-900">{wo.number}</span> },
              { header: "Ativo", cell: (wo) => wo.asset.name },
              { header: "Início", cell: (wo) => formatDateTime(wo.scheduledStart) },
              { header: "Fim", cell: (wo) => formatDateTime(wo.scheduledEnd) },
              { header: "Tempo estimado", cell: (wo) => formatHours(wo.estimatedHours) },
              {
                header: "Status",
                cell: (wo) => <Badge color={STATUS_COLORS[wo.status]}>{STATUS_LABELS[wo.status]}</Badge>,
              },
            ]}
          />
        )}
      </Card>
    </div>
  );
}
