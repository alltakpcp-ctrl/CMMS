import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Role, WorkOrderStatus } from "../domain/enums";
import { STATUS_LABELS } from "../domain/labels";
import * as workOrdersApi from "../api/workorders";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { getErrorMessage } from "../lib/errors";
import { useToast } from "../components/ToastProvider";

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
        <Link to="/solicitacoes/nova">
          <Button>Nova solicitação</Button>
        </Link>
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

      {loading && <p className="text-sm text-slate-500">Carregando indicadores…</p>}

      {!loading && counts && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {STATUS_ORDER.map((status) => (
            <Card key={status}>
              <p className="text-2xl font-semibold text-slate-900">{counts[status] ?? 0}</p>
              <p className="text-sm text-slate-500">{STATUS_LABELS[status]}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
