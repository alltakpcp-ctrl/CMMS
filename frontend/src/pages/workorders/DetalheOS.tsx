import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { Role, WorkOrderStatus } from "../../domain/enums";
import {
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
  TYPE_LABELS,
} from "../../domain/labels";
import * as workOrdersApi from "../../api/workorders";
import { WorkOrder } from "../../types";
import { Card } from "../../components/Card";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { formatDateTime } from "../../lib/format";
import { getErrorMessage } from "../../lib/errors";
import { useToast } from "../../components/ToastProvider";
import { TriagemForm } from "./actions/TriagemForm";
import { PlanejamentoForm } from "./actions/PlanejamentoForm";
import { ProgramacaoForm } from "./actions/ProgramacaoForm";
import { IniciarForm } from "./actions/IniciarForm";
import { RegistrarForm } from "./actions/RegistrarForm";
import { EncerramentoForm } from "./actions/EncerramentoForm";
import { ValidarForm } from "./actions/ValidarForm";
import { CancelarForm } from "./actions/CancelarForm";
import { MoverFaseForm } from "./actions/MoverFaseForm";

type ActionKey =
  | "triagem"
  | "planejamento"
  | "programacao"
  | "iniciar"
  | "registrar"
  | "encerramento"
  | "validar"
  | "cancelar"
  | "moverFase";

const ACTION_LABELS: Record<ActionKey, string> = {
  triagem: "Fazer triagem",
  planejamento: "Planejar",
  programacao: "Programar",
  iniciar: "Iniciar execução",
  registrar: "Adicionar registro",
  encerramento: "Encerramento técnico",
  validar: "Validar",
  cancelar: "Cancelar OS",
  moverFase: "Mover fase",
};

function getAvailableActions(wo: WorkOrder, role: Role, userId: string): ActionKey[] {
  const actions: ActionKey[] = [];
  const isAssignedTech = role === Role.TECNICO && userId === wo.assignedToId;

  if (wo.status === WorkOrderStatus.ABERTA && (role === Role.TECNICO || role === Role.SUPERVISOR)) {
    actions.push("triagem");
  }
  if (wo.status === WorkOrderStatus.TRIAGEM && (role === Role.TECNICO || role === Role.SUPERVISOR)) {
    actions.push("planejamento");
  }
  // Em qualquer prioridade, o próprio TECNICO pode iniciar direto da triagem
  // ou do planejamento, sem passar pela programação do SUPERVISOR
  // (ver workOrderStateMachine.ts).
  if (
    (wo.status === WorkOrderStatus.TRIAGEM || wo.status === WorkOrderStatus.PLANEJADA) &&
    role === Role.TECNICO
  ) {
    actions.push("iniciar");
  }
  if (wo.status === WorkOrderStatus.PLANEJADA && role === Role.SUPERVISOR) {
    actions.push("programacao");
  }
  if (wo.status === WorkOrderStatus.PROGRAMADA && (isAssignedTech || role === Role.SUPERVISOR)) {
    actions.push("iniciar");
  }
  if (wo.status === WorkOrderStatus.EM_EXECUCAO && (isAssignedTech || role === Role.SUPERVISOR)) {
    actions.push("registrar", "encerramento");
  }
  if (wo.status === WorkOrderStatus.AGUARDANDO_VALIDACAO && role === Role.SUPERVISOR) {
    actions.push("validar");
  }
  if (
    role === Role.SUPERVISOR &&
    wo.status !== WorkOrderStatus.ENCERRADA &&
    wo.status !== WorkOrderStatus.CANCELADA
  ) {
    actions.push("cancelar");
  }
  // Override de timeline: SUPERVISOR pode mover a OS para qualquer fase,
  // em qualquer status, inclusive ENCERRADA/CANCELADA (fora da máquina de
  // estados normal — ver PATCH /:id/timeline no backend).
  if (role === Role.SUPERVISOR) {
    actions.push("moverFase");
  }

  return actions;
}

export default function DetalheOS() {
  const { id } = useParams<{ id: string }>();
  const { token, user } = useAuth();
  const { showError, showSuccess } = useToast();

  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeAction, setActiveAction] = useState<ActionKey | null>(null);

  function reload() {
    if (!token || !id) return;
    setLoading(true);
    workOrdersApi
      .getWorkOrder(token, id)
      .then(setWorkOrder)
      .catch((err) => showError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }

  useEffect(reload, [token, id]);

  function handleActionSuccess(updated: WorkOrder) {
    setWorkOrder(updated);
    setActiveAction(null);
    showSuccess("Ação registrada com sucesso.");
    reload();
  }

  if (loading) return <p className="text-sm text-slate-500">Carregando…</p>;
  if (!workOrder || !user) return <p className="text-sm text-slate-500">OS não encontrada.</p>;

  const actions = getAvailableActions(workOrder, user.role, user.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{workOrder.number}</h1>
          <p className="text-sm text-slate-500">{workOrder.title}</p>
        </div>
        <div className="flex gap-2">
          <Badge color={STATUS_COLORS[workOrder.status]}>{STATUS_LABELS[workOrder.status]}</Badge>
          {workOrder.priority && (
            <Badge color={PRIORITY_COLORS[workOrder.priority]}>{PRIORITY_LABELS[workOrder.priority]}</Badge>
          )}
        </div>
      </div>

      {actions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {actions.map((action) => (
            <Button
              key={action}
              variant={action === "cancelar" ? "danger" : "primary"}
              onClick={() => setActiveAction(action)}
            >
              {ACTION_LABELS[action]}
            </Button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Dados da solicitação</h2>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
              <dt className="text-slate-500">Tipo</dt>
              <dd className="text-slate-900">{TYPE_LABELS[workOrder.type]}</dd>
              <dt className="text-slate-500">Ativo</dt>
              <dd className="text-slate-900">
                {workOrder.asset.code} — {workOrder.asset.name}
              </dd>
              <dt className="text-slate-500">Setor destino</dt>
              <dd className="text-slate-900">{workOrder.targetSector?.name ?? "—"}</dd>
              <dt className="text-slate-500">Solicitante</dt>
              <dd className="text-slate-900">{workOrder.requester.name}</dd>
              <dt className="text-slate-500">Responsável</dt>
              <dd className="text-slate-900">{workOrder.assignedTo?.name ?? "—"}</dd>
              {workOrder.assignees.length > 0 && (
                <>
                  <dt className="text-slate-500">Apoio</dt>
                  <dd className="flex flex-wrap gap-1">
                    {workOrder.assignees.map((assignee) => (
                      <span
                        key={assignee.id}
                        className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700"
                      >
                        {assignee.user.name}
                      </span>
                    ))}
                  </dd>
                </>
              )}
              <dt className="text-slate-500">Programação</dt>
              <dd className="text-slate-900">
                {workOrder.scheduledStart ? formatDateTime(workOrder.scheduledStart) : "—"}
                {workOrder.scheduledEnd ? ` até ${formatDateTime(workOrder.scheduledEnd)}` : ""}
              </dd>
            </dl>
            <div className="mt-4">
              <p className="text-sm font-medium text-slate-700">Descrição</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{workOrder.description}</p>
            </div>
            {workOrder.plan && (
              <div className="mt-4">
                <p className="text-sm font-medium text-slate-700">Plano</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{workOrder.plan}</p>
              </div>
            )}
          </Card>

          {workOrder.executions.length > 0 &&
            workOrder.executions.map((execution, index) => (
              <Card key={execution.id}>
                <h2 className="mb-3 text-sm font-semibold text-slate-900">
                  Execução — Ciclo {index + 1}
                  {execution.startedAt ? ` (${formatDateTime(execution.startedAt)})` : ""}
                </h2>
                <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                  <dt className="text-slate-500">Início</dt>
                  <dd className="text-slate-900">{formatDateTime(execution.startedAt)}</dd>
                  <dt className="text-slate-500">Fim</dt>
                  <dd className="text-slate-900">{formatDateTime(execution.finishedAt)}</dd>
                  <dt className="text-slate-500">5S / Limpeza</dt>
                  <dd className="text-slate-900">{execution.cleanupDone ? "Sim" : "Não"}</dd>
                </dl>
                {execution.riskAnalysis && (
                  <div className="mt-3">
                    <p className="text-sm font-medium text-slate-700">Análise de risco</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{execution.riskAnalysis}</p>
                  </div>
                )}
                {execution.rootCause && (
                  <div className="mt-3">
                    <p className="text-sm font-medium text-slate-700">Causa raiz</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{execution.rootCause}</p>
                  </div>
                )}
                {execution.repairDescription && (
                  <div className="mt-3">
                    <p className="text-sm font-medium text-slate-700">Reparo realizado</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">
                      {execution.repairDescription}
                    </p>
                  </div>
                )}
                {execution.logs.length > 0 && (
                  <div className="mt-3">
                    <p className="text-sm font-medium text-slate-700">Histórico de registros</p>
                    <ul className="mt-1 space-y-2">
                      {execution.logs.map((log) => (
                        <li key={log.id} className="border-l-2 border-slate-200 pl-2">
                          <p className="whitespace-pre-line text-sm text-slate-600">{log.note}</p>
                          <p className="mt-0.5 text-xs text-slate-400">
                            {log.author.name} — {formatDateTime(log.createdAt)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {execution.testNotes && (
                  <div className="mt-3">
                    <p className="text-sm font-medium text-slate-700">Notas de teste</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{execution.testNotes}</p>
                  </div>
                )}
              </Card>
            ))}

          {workOrder.parts.length > 0 && (
            <Card>
              <h2 className="mb-3 text-sm font-semibold text-slate-900">Peças utilizadas</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-slate-500">
                    <tr>
                      <th className="pb-2">Peça</th>
                      <th className="pb-2">Quantidade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {workOrder.parts.map((wp) => (
                      <tr key={wp.id}>
                        <td className="py-2">
                          {wp.part.code} — {wp.part.description}
                        </td>
                        <td className="py-2">
                          {wp.quantity} {wp.part.unit}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>

        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Linha do tempo</h2>
          <ol className="space-y-4">
            {workOrder.statusHistory?.map((entry) => (
              <li key={entry.id} className="border-l-2 border-slate-200 pl-3">
                <p className="text-sm font-medium text-slate-900">
                  {entry.fromStatus ? `${STATUS_LABELS[entry.fromStatus]} → ` : ""}
                  {STATUS_LABELS[entry.toStatus]}
                </p>
                <p className="text-xs text-slate-500">
                  {entry.changedBy.name} · {formatDateTime(entry.changedAt)}
                </p>
                {entry.note && <p className="mt-1 text-xs text-slate-600">"{entry.note}"</p>}
              </li>
            ))}
          </ol>
        </Card>
      </div>

      {activeAction === "triagem" && (
        <Modal title={ACTION_LABELS.triagem} onClose={() => setActiveAction(null)}>
          <TriagemForm workOrder={workOrder} onSuccess={handleActionSuccess} onClose={() => setActiveAction(null)} />
        </Modal>
      )}
      {activeAction === "planejamento" && (
        <Modal title={ACTION_LABELS.planejamento} onClose={() => setActiveAction(null)}>
          <PlanejamentoForm
            workOrder={workOrder}
            onSuccess={handleActionSuccess}
            onClose={() => setActiveAction(null)}
          />
        </Modal>
      )}
      {activeAction === "programacao" && (
        <Modal title={ACTION_LABELS.programacao} onClose={() => setActiveAction(null)}>
          <ProgramacaoForm
            workOrder={workOrder}
            onSuccess={handleActionSuccess}
            onClose={() => setActiveAction(null)}
          />
        </Modal>
      )}
      {activeAction === "iniciar" && (
        <Modal title={ACTION_LABELS.iniciar} onClose={() => setActiveAction(null)}>
          <IniciarForm workOrder={workOrder} onSuccess={handleActionSuccess} onClose={() => setActiveAction(null)} />
        </Modal>
      )}
      {activeAction === "registrar" && (
        <Modal title={ACTION_LABELS.registrar} onClose={() => setActiveAction(null)}>
          <RegistrarForm
            workOrder={workOrder}
            onSuccess={handleActionSuccess}
            onClose={() => setActiveAction(null)}
          />
        </Modal>
      )}
      {activeAction === "encerramento" && (
        <Modal title={ACTION_LABELS.encerramento} onClose={() => setActiveAction(null)}>
          <EncerramentoForm
            workOrder={workOrder}
            onSuccess={handleActionSuccess}
            onClose={() => setActiveAction(null)}
          />
        </Modal>
      )}
      {activeAction === "validar" && (
        <Modal title={ACTION_LABELS.validar} onClose={() => setActiveAction(null)}>
          <ValidarForm workOrder={workOrder} onSuccess={handleActionSuccess} onClose={() => setActiveAction(null)} />
        </Modal>
      )}
      {activeAction === "cancelar" && (
        <Modal title={ACTION_LABELS.cancelar} onClose={() => setActiveAction(null)}>
          <CancelarForm workOrder={workOrder} onSuccess={handleActionSuccess} onClose={() => setActiveAction(null)} />
        </Modal>
      )}
      {activeAction === "moverFase" && (
        <Modal title={ACTION_LABELS.moverFase} onClose={() => setActiveAction(null)}>
          <MoverFaseForm
            workOrder={workOrder}
            onSuccess={handleActionSuccess}
            onClose={() => setActiveAction(null)}
          />
        </Modal>
      )}
    </div>
  );
}
