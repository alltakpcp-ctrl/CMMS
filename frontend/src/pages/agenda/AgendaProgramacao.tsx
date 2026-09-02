import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { WorkOrderStatus } from "../../domain/enums";
import { STATUS_COLORS, STATUS_LABELS, TYPE_LABELS } from "../../domain/labels";
import * as workOrdersApi from "../../api/workorders";
import { WorkOrder } from "../../types";
import { Table } from "../../components/Table";
import { Badge } from "../../components/Badge";
import { EmptyState } from "../../components/EmptyState";
import { Card } from "../../components/Card";
import { formatDateTime } from "../../lib/format";
import { getErrorMessage } from "../../lib/errors";
import { useToast } from "../../components/ToastProvider";
import { AgendaTabs } from "./AgendaTabs";

export default function AgendaProgramacao() {
  const { token } = useAuth();
  const { showError } = useToast();
  const navigate = useNavigate();

  const [toSchedule, setToSchedule] = useState<WorkOrder[]>([]);
  const [scheduled, setScheduled] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    setLoading(true);

    Promise.all([
      workOrdersApi.listWorkOrders(token, { status: WorkOrderStatus.PLANEJADA, pageSize: 100 }),
      workOrdersApi.listWorkOrders(token, { status: WorkOrderStatus.PROGRAMADA, pageSize: 100 }),
    ])
      .then(([planejadas, programadas]) => {
        setToSchedule(planejadas.items);
        setScheduled(
          programadas.items.sort((a, b) => (a.scheduledStart ?? "").localeCompare(b.scheduledStart ?? ""))
        );
      })
      .catch((err) => showError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [token, showError]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Agenda</h1>
        <p className="text-sm text-slate-500">OS planejadas a programar e OS já programadas.</p>
      </div>

      <AgendaTabs />

      {loading ? (
        <p className="text-sm text-slate-500">Carregando…</p>
      ) : (
        <div className="space-y-8">
          <Card>
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Planejadas — a programar</h2>
            {toSchedule.length === 0 ? (
              <EmptyState title="Nada a programar" description="Não há OS planejadas aguardando programação." />
            ) : (
              <Table
                rows={toSchedule}
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
                ]}
              />
            )}
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Programadas</h2>
            {scheduled.length === 0 ? (
              <EmptyState title="Nenhuma OS programada" />
            ) : (
              <Table
                rows={scheduled}
                rowKey={(wo) => wo.id}
                onRowClick={(wo) => navigate(`/ordens/${wo.id}`)}
                columns={[
                  { header: "Número", cell: (wo) => <span className="font-medium text-slate-900">{wo.number}</span> },
                  { header: "Ativo", cell: (wo) => wo.asset.name },
                  { header: "Início", cell: (wo) => formatDateTime(wo.scheduledStart) },
                  { header: "Fim", cell: (wo) => formatDateTime(wo.scheduledEnd) },
                  { header: "Técnico", cell: (wo) => wo.assignedTo?.name ?? "—" },
                ]}
              />
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
