import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import * as purchaseOrdersApi from "../../api/purchaseOrders";
import { PurchaseOrder } from "../../types";
import { Table } from "../../components/Table";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { Input } from "../../components/Input";
import { Textarea } from "../../components/Textarea";
import { EmptyState } from "../../components/EmptyState";
import { getErrorMessage } from "../../lib/errors";
import { useToast } from "../../components/ToastProvider";
import { formatDateTime } from "../../lib/format";
import { PART_REQUEST_ITEM_TYPE_LABELS } from "../../domain/labels";

export default function RevisaoPedidos() {
  const { token } = useAuth();
  const { showError, showSuccess } = useToast();

  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState<PurchaseOrder | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reviewNotes, setReviewNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function reload() {
    if (!token) return;
    setLoading(true);
    purchaseOrdersApi
      .listPurchaseOrders(token)
      .then(setOrders)
      .catch((err) => showError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }

  useEffect(reload, [token]);

  function openReview(order: PurchaseOrder) {
    setReviewing(order);
    setReviewNotes("");
    setQuantities(Object.fromEntries(order.items.map((item) => [item.id, item.quantity])));
  }

  function changedItems(order: PurchaseOrder) {
    return order.items
      .filter((item) => quantities[item.id] !== item.quantity)
      .map((item) => ({ itemId: item.id, quantity: quantities[item.id] }));
  }

  async function handleReview(action: "APROVAR" | "REJEITAR") {
    if (!token || !reviewing) return;
    if (action === "REJEITAR" && !reviewNotes.trim()) {
      showError("Nota é obrigatória ao rejeitar o pedido.");
      return;
    }
    setSubmitting(true);
    try {
      const items = action === "APROVAR" ? changedItems(reviewing) : undefined;
      await purchaseOrdersApi.reviewPurchaseOrder(token, reviewing.id, {
        action,
        reviewNotes: reviewNotes || undefined,
        items: items && items.length > 0 ? items : undefined,
      });
      showSuccess(action === "APROVAR" ? "Pedido aprovado." : "Pedido rejeitado.");
      setReviewing(null);
      reload();
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Revisão de Pedidos</h1>
        <p className="text-sm text-slate-500">Pedidos de compra enviados, aguardando aprovação.</p>
      </div>

      {loading && <p className="text-sm text-slate-500">Carregando…</p>}

      {!loading && orders.length === 0 && <EmptyState title="Nenhum pedido aguardando revisão" />}

      {!loading && orders.length > 0 && (
        <Table
          rows={orders}
          rowKey={(o) => o.id}
          onRowClick={openReview}
          columns={[
            { header: "Número", cell: (o) => o.number },
            { header: "Criado por", cell: (o) => o.createdBy.name },
            { header: "Itens", cell: (o) => o.items.length },
            { header: "Data", cell: (o) => formatDateTime(o.createdAt) },
          ]}
        />
      )}

      {reviewing && (
        <Modal title={`Pedido ${reviewing.number}`} onClose={() => setReviewing(null)}>
          <div className="space-y-4">
            <div className="space-y-2">
              {reviewing.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-2 rounded border border-slate-200 p-2"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {PART_REQUEST_ITEM_TYPE_LABELS[item.itemType]} — {item.description}
                    </p>
                    <p className="text-xs text-slate-500">Indicado por {item.requestedBy.name}</p>
                  </div>
                  <Input
                    type="number"
                    min={1}
                    className="w-24"
                    value={quantities[item.id] ?? item.quantity}
                    onChange={(e) =>
                      setQuantities((current) => ({ ...current, [item.id]: Number(e.target.value) }))
                    }
                  />
                </div>
              ))}
            </div>

            <Textarea label="Notas da revisão" value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} />

            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setReviewing(null)}>
                Cancelar
              </Button>
              <Button type="button" variant="danger" disabled={submitting} onClick={() => handleReview("REJEITAR")}>
                Rejeitar
              </Button>
              <Button type="button" disabled={submitting} onClick={() => handleReview("APROVAR")}>
                Aprovar
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
