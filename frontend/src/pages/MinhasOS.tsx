import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { WorkOrderStatus } from "../domain/enums";
import { DISCIPLINA_LABELS, PRIORITY_COLORS, PRIORITY_LABELS, STATUS_LABELS } from "../domain/labels";
import * as workOrdersApi from "../api/workorders";
import { WorkOrder } from "../types";
import { Card } from "../components/Card";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { formatDateTime } from "../lib/format";
import { getErrorMessage } from "../lib/errors";
import { useToast } from "../components/ToastProvider";

const PRIORITY_BG: Record<string, string> = {
  BAIXA: "#e0f2fe",
  MEDIA: "#fef9c3",
  ALTA: "#ffedd5",
  URGENTE: "#fee2e2",
};
const DEFAULT_BG = "#ffffff"; // card branco quando priority é null

const ACTIVE_GROUPS: WorkOrderStatus[] = [
  WorkOrderStatus.PROGRAMADA,
  WorkOrderStatus.EM_EXECUCAO,
  WorkOrderStatus.AGUARDANDO_VALIDACAO,
];
const GROUPS: WorkOrderStatus[] = [...ACTIVE_GROUPS, WorkOrderStatus.ENCERRADA];
const CLOSED_PAGE_SIZE = 30;

export default function MinhasOS() {
  const { token, user } = useAuth();
  const { showError } = useToast();
  const navigate = useNavigate();

  const [active, setActive] = useState<WorkOrder[]>([]);
  const [closed, setClosed] = useState<WorkOrder[]>([]);
  const [closedTotal, setClosedTotal] = useState(0);
  const [closedPage, setClosedPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [mode, setMode] = useState<"principal" | "apoio">("principal");

  const baseFilters: workOrdersApi.ListWorkOrdersFilters | null = !user
    ? null
    : mode === "apoio"
    ? { asSupport: true }
    : { assignedToId: user.id };

  // OS ativas carregam inteiras (filas curtas); ENCERRADA cresce sem limite,
  // então vem paginada — antes a tela buscava 100 OS no total e, para quem
  // já tinha 100 encerradas, as ativas mais novas sumiam.
  useEffect(() => {
    if (!token || !baseFilters) return;
    setLoading(true);
    let stale = false;
    Promise.all([
      Promise.all(
        ACTIVE_GROUPS.map((status) => workOrdersApi.listAllWorkOrders(token, { ...baseFilters, status }))
      ),
      workOrdersApi.listWorkOrders(token, { ...baseFilters, status: WorkOrderStatus.ENCERRADA, page: 1, pageSize: CLOSED_PAGE_SIZE }),
    ])
      .then(([activeByStatus, closedPage1]) => {
        if (stale) return;
        setActive(activeByStatus.flat());
        setClosed(closedPage1.items);
        setClosedTotal(closedPage1.total);
        setClosedPage(1);
      })
      .catch((err) => !stale && showError(getErrorMessage(err)))
      .finally(() => !stale && setLoading(false));
    return () => {
      stale = true;
    };
    // baseFilters deriva de user + mode
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user, mode, showError]);

  function loadMoreClosed() {
    if (!token || !baseFilters) return;
    setLoadingMore(true);
    const next = closedPage + 1;
    workOrdersApi
      .listWorkOrders(token, { ...baseFilters, status: WorkOrderStatus.ENCERRADA, page: next, pageSize: CLOSED_PAGE_SIZE })
      .then((result) => {
        setClosed((prev) => [...prev, ...result.items]);
        setClosedTotal(result.total);
        setClosedPage(next);
      })
      .catch((err) => showError(getErrorMessage(err)))
      .finally(() => setLoadingMore(false));
  }

  if (loading) return <p className="text-sm text-slate-500">Carregando…</p>;

  const grouped = GROUPS.map((status) => ({
    status,
    items: status === WorkOrderStatus.ENCERRADA ? closed : active.filter((wo) => wo.status === status),
    total: status === WorkOrderStatus.ENCERRADA ? closedTotal : undefined,
  }));

  const hasAny = active.length > 0 || closed.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Minhas OS</h1>
        <p className="text-sm text-slate-500">
          {mode === "apoio"
            ? "Ordens de serviço onde você é manutentor de apoio, por status."
            : "Ordens de serviço atribuídas a você, por status."}
        </p>
      </div>

      <div className="flex gap-2">
        <Button
          variant={mode === "principal" ? "primary" : "secondary"}
          type="button"
          onClick={() => setMode("principal")}
        >
          Minhas OS
        </Button>
        <Button
          variant={mode === "apoio" ? "primary" : "secondary"}
          type="button"
          onClick={() => setMode("apoio")}
        >
          OS como apoio
        </Button>
      </div>

      {!hasAny && (
        <EmptyState
          title={mode === "apoio" ? "Nenhuma OS como apoio" : "Nenhuma OS atribuída"}
          description={
            mode === "apoio"
              ? "Você não é manutentor de apoio em nenhuma OS no momento."
              : "Você ainda não tem OS sob responsabilidade."
          }
        />
      )}

      {hasAny &&
        grouped.map(
          (group) =>
            group.items.length > 0 && (
              <div key={group.status}>
                <h2 className="mb-2 text-sm font-semibold text-slate-700">
                  {STATUS_LABELS[group.status]} ({group.total ?? group.items.length})
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
                          <div className="space-y-0.5 text-xs text-slate-600">
                            <p>
                              <span className="font-medium">Ativo:</span> {wo.asset.name}
                            </p>
                            <p>
                              <span className="font-medium">Disciplina:</span> {DISCIPLINA_LABELS[wo.disciplina]}
                            </p>
                            <p>
                              <span className="font-medium">Título:</span> {wo.title}
                            </p>
                            <p>
                              <span className="font-medium">Solicitante:</span> {wo.requester.name}
                            </p>
                            <p>
                              <span className="font-medium">Técnico:</span> {wo.assignedTo?.name ?? "Não designado"}
                            </p>
                            <p className="text-slate-500">{formatDateTime(wo.createdAt)}</p>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
                {group.total !== undefined && group.items.length < group.total && (
                  <div className="mt-3">
                    <Button variant="secondary" type="button" disabled={loadingMore} onClick={loadMoreClosed}>
                      {loadingMore
                        ? "Carregando…"
                        : `Carregar mais (${group.items.length} de ${group.total})`}
                    </Button>
                  </div>
                )}
              </div>
            )
        )}
    </div>
  );
}
