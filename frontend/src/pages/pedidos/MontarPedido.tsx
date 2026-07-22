import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import * as partRequestsApi from "../../api/partRequests";
import * as purchaseOrdersApi from "../../api/purchaseOrders";
import { PartRequest } from "../../types";
import { Table } from "../../components/Table";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { Textarea } from "../../components/Textarea";
import { Checkbox } from "../../components/Checkbox";
import { Badge } from "../../components/Badge";
import { EmptyState } from "../../components/EmptyState";
import { getErrorMessage } from "../../lib/errors";
import { useToast } from "../../components/ToastProvider";
import { formatDateTime } from "../../lib/format";
import {
  PART_REQUEST_ITEM_TYPE_LABELS,
  PART_REQUEST_STATUS_COLORS,
  PART_REQUEST_STATUS_LABELS,
} from "../../domain/labels";

export default function MontarPedido() {
  const { token } = useAuth();
  const { showError, showSuccess } = useToast();

  const [queue, setQueue] = useState<PartRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [rejecting, setRejecting] = useState<PartRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [submittingReject, setSubmittingReject] = useState(false);

  function reload() {
    if (!token) return;
    setLoading(true);
    partRequestsApi
      .listPendingPartRequests(token)
      .then((items) => {
        setQueue(items);
        setSelected(new Set());
      })
      .catch((err) => showError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }

  useEffect(reload, [token]);

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleGenerate() {
    if (!token || selected.size === 0) return;
    setGenerating(true);
    try {
      await purchaseOrdersApi.createPurchaseOrder(token, { partRequestIds: Array.from(selected) });
      showSuccess("Pedido de compra gerado.");
      reload();
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setGenerating(false);
    }
  }

  async function handleReject(e: FormEvent) {
    e.preventDefault();
    if (!token || !rejecting) return;
    setSubmittingReject(true);
    try {
      await purchaseOrdersApi.rejectPartRequest(token, rejecting.id, { rejectedReason: rejectReason });
      showSuccess("Indicação rejeitada.");
      setRejecting(null);
      setRejectReason("");
      reload();
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setSubmittingReject(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Montar Pedido</h1>
          <p className="text-sm text-slate-500">Fila de indicações de peças e ferramentas em falta.</p>
        </div>
        <Button onClick={handleGenerate} disabled={selected.size === 0 || generating}>
          {generating ? "Gerando…" : `Gerar pedido de compra (${selected.size})`}
        </Button>
      </div>

      {loading && <p className="text-sm text-slate-500">Carregando…</p>}

      {!loading && queue.length === 0 && <EmptyState title="Nenhuma indicação pendente" />}

      {!loading && queue.length > 0 && (
        <Table
          rows={queue}
          rowKey={(r) => r.id}
          columns={[
            {
              header: "",
              cell: (r) => (
                <Checkbox label="" checked={selected.has(r.id)} onChange={() => toggleSelected(r.id)} />
              ),
            },
            { header: "Item", cell: (r) => PART_REQUEST_ITEM_TYPE_LABELS[r.itemType] },
            { header: "Descrição", cell: (r) => r.description },
            { header: "Qtd", cell: (r) => r.quantity },
            {
              header: "Status",
              cell: (r) => (
                <Badge color={PART_REQUEST_STATUS_COLORS[r.status]}>{PART_REQUEST_STATUS_LABELS[r.status]}</Badge>
              ),
            },
            { header: "Indicado por", cell: (r) => r.requestedBy.name },
            { header: "Data", cell: (r) => formatDateTime(r.createdAt) },
            {
              header: "Ações",
              cell: (r) => (
                <Button variant="danger" onClick={() => setRejecting(r)}>
                  Rejeitar
                </Button>
              ),
            },
          ]}
        />
      )}

      {rejecting && (
        <Modal title={`Rejeitar indicação — ${rejecting.description}`} onClose={() => setRejecting(null)}>
          <form onSubmit={handleReject} className="space-y-4">
            <Textarea
              label="Motivo da rejeição"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              required
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setRejecting(null)}>
                Cancelar
              </Button>
              <Button type="submit" variant="danger" disabled={submittingReject}>
                {submittingReject ? "Rejeitando…" : "Rejeitar"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
