import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { WorkOrderStatus } from "../domain/enums";
import { PRIORITY_COLORS, PRIORITY_LABELS, STATUS_LABELS } from "../domain/labels";
import * as workOrdersApi from "../api/workorders";
import { WorkOrder } from "../types";
import { Card } from "../components/Card";
import { Badge } from "../components/Badge";
import { EmptyState } from "../components/EmptyState";
import { formatDate } from "../lib/format";
import { getErrorMessage } from "../lib/errors";
import { useToast } from "../components/ToastProvider";

const PRIORITY_BG: Record<string, string> = {
  BAIXA: "#e0f2fe",
  MEDIA: "#fef9c3",
  ALTA: "#ffedd5",
  URGENTE: "#fee2e2",
};
const DEFAULT_BG = "#ffffff"; // card branco quando priority é null

const GROUPS: WorkOrderStatus[] = [
  WorkOrderStatus.PROGRAMADA,
  WorkOrderStatus.EM_EXECUCAO,
  WorkOrderStatus.AGUARDANDO_VALIDACAO,
  WorkOrderStatus.ENCERRADA,
];

export default function MinhasOS() {
  const { token, user } = useAuth();
  const { showError } = useToast();
  const navigate = useNavigate();

  const [items, setItems] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || !user) return;
    setLoading(true);
    workOrdersApi
      .listWorkOrders(token, { assignedToId: user.id, pageSize: 100 })
      .then((result) => setItems(result.items))
      .catch((err) => showError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [token, user, showError]);

  if (loading) return <p className="text-sm text-slate-500">Carregando…</p>;

  const grouped = GROUPS.map((status) => ({
    status,
    items: items.filter((wo) => wo.status === status),
  }));

  const hasAny = items.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Minhas OS</h1>
        <p className="text-sm text-slate-500">Ordens de serviço atribuídas a você, por status.</p>
      </div>

      {!hasAny && <EmptyState title="Nenhuma OS atribuída" description="Você ainda não tem OS sob responsabilidade." />}

      {hasAny &&
        grouped.map(
          (group) =>
            group.items.length > 0 && (
              <div key={group.status}>
                <h2 className="mb-2 text-sm font-semibold text-slate-700">
                  {STATUS_LABELS[group.status]} ({group.items.length})
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {group.items.map((wo) => {
                    const bg = wo.priority ? PRIORITY_BG[wo.priority] ?? DEFAULT_BG : DEFAULT_BG;
                    return (
                      <Card
                        key={wo.id}
                        className="cursor-pointer hover:border-slate-400"
                        style={{ backgroundColor: bg }}
                      >
                        <div onClick={() => navigate(`/ordens/${wo.id}`)}>
                          <div className="mb-1 flex items-center justify-between">
                            <span className="font-medium text-slate-900">{wo.number}</span>
                            {wo.priority && (
                              <Badge color={PRIORITY_COLORS[wo.priority]}>{PRIORITY_LABELS[wo.priority]}</Badge>
                            )}
                          </div>
                          <p className="text-sm text-slate-600">{wo.title}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {wo.asset.name} · {formatDate(wo.createdAt)}
                          </p>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )
        )}
    </div>
  );
}
