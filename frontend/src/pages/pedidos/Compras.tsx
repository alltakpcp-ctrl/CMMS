import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import * as purchaseOrdersApi from "../../api/purchaseOrders";
import { PurchaseOrder } from "../../types";
import { Table } from "../../components/Table";
import { Modal } from "../../components/Modal";
import { Badge } from "../../components/Badge";
import { EmptyState } from "../../components/EmptyState";
import { getErrorMessage } from "../../lib/errors";
import { useToast } from "../../components/ToastProvider";
import { formatDateTime } from "../../lib/format";
import { PART_REQUEST_ITEM_TYPE_LABELS } from "../../domain/labels";

export default function Compras() {
  const { token } = useAuth();
  const { showError } = useToast();

  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<PurchaseOrder | null>(null);

  function reload() {
    if (!token) return;
    setLoading(true);
    purchaseOrdersApi
      .listPurchasing(token)
      .then(setOrders)
      .catch((err) => showError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }

  useEffect(reload, [token]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Compras</h1>
        <p className="text-sm text-slate-500">Pedidos aprovados, aguardando compra.</p>
      </div>

      {loading && <p className="text-sm text-slate-500">Carregando…</p>}

      {!loading && orders.length === 0 && <EmptyState title="Nenhum pedido aguardando compra" />}

      {!loading && orders.length > 0 && (
        <Table
          rows={orders}
          rowKey={(o) => o.id}
          onRowClick={setViewing}
          columns={[
            { header: "Número", cell: (o) => o.number },
            { header: "Criado por", cell: (o) => o.createdBy.name },
            { header: "Revisado por", cell: (o) => o.reviewedBy?.name ?? "—" },
            { header: "Itens", cell: (o) => o.items.length },
            {
              header: "Parcial?",
              cell: (o) => ((o.children?.length ?? 0) > 0 ? <Badge color="amber">Parcial</Badge> : "—"),
            },
            { header: "Data", cell: (o) => formatDateTime(o.reviewedAt ?? o.createdAt) },
          ]}
        />
      )}

      {viewing && (
        <Modal title={`Pedido ${viewing.number}`} onClose={() => setViewing(null)}>
          <div className="space-y-4">
            <div className="space-y-2">
              {viewing.items.map((item) => (
                <div key={item.id} className="rounded border border-slate-200 p-2">
                  <p className="text-sm font-medium text-slate-900">
                    {PART_REQUEST_ITEM_TYPE_LABELS[item.itemType]} — {item.description}
                  </p>
                  <p className="text-xs text-slate-500">Quantidade: {item.quantity}</p>
                </div>
              ))}
            </div>

            {(viewing.children?.length ?? 0) > 0 && (
              <p className="text-sm text-slate-700">
                Pedido(s) postergado(s): {viewing.children!.map((child) => child.number).join(", ")}
              </p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
