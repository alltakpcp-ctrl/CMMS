import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Role, WorkOrderStatus } from "../domain/enums";
import { STATUS_LABELS, TYPE_LABELS } from "../domain/labels";
import * as workOrdersApi from "../api/workorders";
import * as stockApi from "../api/stock";
import * as indicatorsApi from "../api/indicators";
import type { Overview } from "../api/indicators";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { getErrorMessage } from "../lib/errors";
import { useToast } from "../components/ToastProvider";
import { formatDate } from "../lib/format";

const SHEETS_PER_REAM = 500;

const STATUS_ORDER: WorkOrderStatus[] = [
  WorkOrderStatus.ABERTA,
  WorkOrderStatus.TRIAGEM,
  WorkOrderStatus.PLANEJADA,
  WorkOrderStatus.PROGRAMADA,
  WorkOrderStatus.EM_EXECUCAO,
  WorkOrderStatus.AGUARDANDO_VALIDACAO,
  WorkOrderStatus.ENCERRADA,
  WorkOrderStatus.CANCELADA,
];

export default function Dashboard() {
  const { user, token } = useAuth();
  const { showError } = useToast();
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [overview, setOverview] = useState<Overview | null>(null);

  useEffect(() => {
    if (!token || !user) return;

    const filters =
      user.role === Role.OPERADOR
        ? { requesterId: user.id, pageSize: 100 }
        : user.role === Role.TECNICO
        ? { assignedToId: user.id, pageSize: 100 }
        : { pageSize: 100 };

    workOrdersApi
      .listWorkOrders(token, filters)
      .then((result) => {
        const tally: Record<string, number> = {};
        for (const status of STATUS_ORDER) tally[status] = 0;
        for (const wo of result.items) tally[wo.status] = (tally[wo.status] ?? 0) + 1;
        setCounts(tally);
      })
      .catch((err) => showError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [token, user, showError]);

  useEffect(() => {
    if (!token) return;
    if (user?.role !== Role.SUPERVISOR && user?.role !== Role.TECNICO) return;
    stockApi
      .getLowStock(token)
      .then((parts) => setLowStockCount(parts.length))
      .catch((err) => showError(getErrorMessage(err)));
  }, [token, user?.role]);

  useEffect(() => {
    if (!token) return;
    if (user?.role !== Role.SUPERVISOR && user?.role !== Role.TECNICO) return;
    indicatorsApi
      .getOverview(token)
      .then(setOverview)
      .catch((err) => showError(getErrorMessage(err)));
  }, [token, user?.role, showError]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">
          Olá, {user?.name?.split(" ")[0]}
        </h1>
        <p className="text-sm text-slate-500">
          {user?.role === Role.OPERADOR && "Acompanhe suas solicitações de manutenção."}
          {user?.role === Role.TECNICO && "Suas ordens de serviço atribuídas, por status."}
          {user?.role === Role.SUPERVISOR && "Visão geral de todas as ordens de serviço."}
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        {(user?.role === Role.OPERADOR || user?.role === Role.SUPERVISOR) && (
          <Link to="/solicitacoes/nova">
            <Button>Nova solicitação</Button>
          </Link>
        )}
        <Link to="/ordens">
          <Button variant="secondary">Ver todas as OS</Button>
        </Link>
        {(user?.role === Role.TECNICO || user?.role === Role.SUPERVISOR) && (
          <Link to="/fila">
            <Button variant="secondary">Fila de triagem</Button>
          </Link>
        )}
        {user?.role === Role.TECNICO && (
          <Link to="/minhas-os">
            <Button variant="secondary">Minhas OS</Button>
          </Link>
        )}
        {user?.role === Role.SUPERVISOR && (
          <Link to="/agenda">
            <Button variant="secondary">Agenda</Button>
          </Link>
        )}
      </div>

      {overview && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">Overview do sistema</h2>

          <Card className="border-green-200 bg-green-50">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="text-sm text-green-700">Papel economizado desde {formatDate(overview.firstWorkOrderAt)}</p>
                <p className="mt-1 text-3xl font-semibold text-green-800">
                  {overview.totalWorkOrders.toLocaleString("pt-BR")} folhas
                </p>
              </div>
              {overview.totalWorkOrders >= SHEETS_PER_REAM && (
                <p className="text-sm text-green-700">
                  ≈ {Math.floor(overview.totalWorkOrders / SHEETS_PER_REAM).toLocaleString("pt-BR")}{" "}
                  {Math.floor(overview.totalWorkOrders / SHEETS_PER_REAM) === 1 ? "resma" : "resmas"} de papel
                </p>
              )}
            </div>
            <p className="mt-1 text-xs text-green-700">
              Cada OS aberta no sistema substitui uma folha que antes seria impressa ou preenchida à mão.
            </p>
          </Card>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card>
              <p className="text-2xl font-semibold text-slate-900">{overview.totalWorkOrders}</p>
              <p className="text-sm text-slate-500">OS desde o início</p>
              {overview.daysSinceFirst !== null && (
                <p className="text-xs text-slate-400">{overview.daysSinceFirst} dias de operação</p>
              )}
            </Card>
            <Card>
              <p className="text-2xl font-semibold text-slate-900">{overview.closedWorkOrders}</p>
              <p className="text-sm text-slate-500">OS encerradas</p>
              {overview.totalWorkOrders > 0 && (
                <p className="text-xs text-slate-400">
                  {((overview.closedWorkOrders / overview.totalWorkOrders) * 100).toFixed(0)}% do total
                </p>
              )}
            </Card>
            <Card>
              <p className="text-2xl font-semibold text-slate-900">{overview.backlogTotal}</p>
              <p className="text-sm text-slate-500">Backlog atual</p>
            </Card>
            <Card>
              <p className="text-2xl font-semibold text-slate-900">
                {overview.daysSinceFirst ? (overview.totalWorkOrders / overview.daysSinceFirst).toFixed(1) : "—"}
              </p>
              <p className="text-sm text-slate-500">OS abertas por dia (média)</p>
            </Card>
          </div>

          {overview.byType.length > 0 && (
            <Card>
              <p className="text-sm text-slate-500">OS por tipo, desde o início</p>
              <div className="mt-2 flex flex-wrap gap-4">
                {overview.byType.map((entry) => (
                  <div key={entry.type}>
                    <p className="text-lg font-semibold text-slate-900">{entry.count}</p>
                    <p className="text-xs text-slate-500">
                      {TYPE_LABELS[entry.type as keyof typeof TYPE_LABELS] ?? entry.type}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {lowStockCount > 0 && (
        <Link to="/estoque" className="block">
          <Card className="border-red-200 bg-red-50 hover:bg-red-100 transition-colors">
            <p className="text-2xl font-semibold text-red-700">{lowStockCount}</p>
            <p className="text-sm text-red-600">
              {lowStockCount === 1 ? "peça em reposição" : "peças em reposição"}
            </p>
          </Card>
        </Link>
      )}

      {loading && <p className="text-sm text-slate-500">Carregando indicadores…</p>}

      {!loading && counts && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {STATUS_ORDER.map((status) => (
            <Link key={status} to={`/ordens?status=${status}`}>
              <Card>
                <p className="text-2xl font-semibold text-slate-900">{counts[status] ?? 0}</p>
                <p className="text-sm text-slate-500">{STATUS_LABELS[status]}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
