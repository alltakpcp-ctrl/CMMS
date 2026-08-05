import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import * as purchaseOrdersApi from "../../api/purchaseOrders";
import { PurchaseOrder, PurchaseOrderComment } from "../../types";
import { Table } from "../../components/Table";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { Input } from "../../components/Input";
import { Textarea } from "../../components/Textarea";
import { EmptyState } from "../../components/EmptyState";
import { Badge } from "../../components/Badge";
import { getErrorMessage } from "../../lib/errors";
import { useToast } from "../../components/ToastProvider";
import { formatDateTime } from "../../lib/format";
import { PART_REQUEST_ITEM_TYPE_LABELS } from "../../domain/labels";

interface ItemDecision {
  approved: number;
  deferred: number;
}

export default function RevisaoPedidos() {
  const { token, user } = useAuth();
  const { showError, showSuccess } = useToast();

  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState<PurchaseOrder | null>(null);
  const [decisions, setDecisions] = useState<Record<string, ItemDecision>>({});
  const [reviewNotes, setReviewNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [comments, setComments] = useState<PurchaseOrderComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [newCommentSupplier, setNewCommentSupplier] = useState("");
  const [postingComment, setPostingComment] = useState(false);

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

  function loadComments(orderId: string) {
    if (!token) return;
    setCommentsLoading(true);
    purchaseOrdersApi
      .listPurchaseOrderComments(token, orderId)
      .then(setComments)
      .catch((err) => showError(getErrorMessage(err)))
      .finally(() => setCommentsLoading(false));
  }

  function openReview(order: PurchaseOrder) {
    setReviewing(order);
    setReviewNotes("");
    setDecisions(
      Object.fromEntries(order.items.map((item) => [item.id, { approved: item.quantity, deferred: 0 }]))
    );
    setComments([]);
    setNewComment("");
    setNewCommentSupplier("");
    loadComments(order.id);
  }

  async function handlePostComment() {
    if (!token || !reviewing) return;

    if (!newComment.trim()) {
      showError("Escreva um comentário.");
      return;
    }

    setPostingComment(true);
    try {
      await purchaseOrdersApi.createPurchaseOrderComment(token, reviewing.id, {
        body: newComment.trim(),
        ...(newCommentSupplier.trim() ? { supplierName: newCommentSupplier.trim() } : {}),
      });
      setNewComment("");
      setNewCommentSupplier("");
      loadComments(reviewing.id);
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setPostingComment(false);
    }
  }

  async function handleDeleteItem(itemId: string) {
    if (!token || !reviewing) return;

    if (!window.confirm("Excluir este item do pedido? Se for o último item, o pedido inteiro será excluído.")) {
      return;
    }

    setDeletingItemId(itemId);
    try {
      const result = await purchaseOrdersApi.deletePartRequestItem(token, itemId);
      if (result.orderDeleted) {
        showSuccess("Item excluído. O pedido ficou sem itens e foi removido.");
        setReviewing(null);
        reload();
      } else {
        showSuccess("Item excluído.");
        if (result.purchaseOrder) {
          setReviewing(result.purchaseOrder);
          setDecisions(
            Object.fromEntries(
              result.purchaseOrder.items.map((item) => [item.id, { approved: item.quantity, deferred: 0 }])
            )
          );
        }
        reload();
      }
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setDeletingItemId(null);
    }
  }

  async function handleReview(action: "APROVAR" | "DEVOLVER") {
    if (!token || !reviewing) return;

    if (action === "DEVOLVER") {
      if (!reviewNotes.trim()) {
        showError("Nota é obrigatória ao devolver o pedido.");
        return;
      }
      setSubmitting(true);
      try {
        await purchaseOrdersApi.reviewPurchaseOrder(token, reviewing.id, {
          action: "DEVOLVER",
          reviewNotes,
        });
        showSuccess("Pedido devolvido.");
        setReviewing(null);
        reload();
      } catch (err) {
        showError(getErrorMessage(err));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // action === "APROVAR"
    for (const item of reviewing.items) {
      const decision = decisions[item.id] ?? { approved: 0, deferred: 0 };
      if (decision.approved + decision.deferred > item.quantity) {
        showError(`Aprovado + postergado excede o solicitado no item "${item.description}".`);
        return;
      }
      if (decision.approved + decision.deferred < 1) {
        showError(`Informe ao menos 1 unidade aprovada ou postergada no item "${item.description}".`);
        return;
      }
    }

    const totalApproved = reviewing.items.reduce(
      (sum, item) => sum + (decisions[item.id]?.approved ?? 0),
      0
    );
    if (totalApproved < 1) {
      showError("Nenhum item aprovado. Use Devolver se não pretende aprovar nada.");
      return;
    }

    setSubmitting(true);
    try {
      const items = reviewing.items.map((item) => ({
        itemId: item.id,
        approvedQuantity: decisions[item.id]?.approved ?? 0,
        deferredQuantity: decisions[item.id]?.deferred ?? 0,
      }));
      await purchaseOrdersApi.reviewPurchaseOrder(token, reviewing.id, {
        action: "APROVAR",
        reviewNotes: reviewNotes || undefined,
        items,
      });
      showSuccess("Pedido aprovado e enviado a compras.");
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
                <div key={item.id} className="rounded border border-slate-200 p-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-slate-900">
                      {PART_REQUEST_ITEM_TYPE_LABELS[item.itemType]} — {item.description}
                    </p>
                    {user?.canReceivePartRequests && (
                      <Button
                        type="button"
                        variant="danger"
                        className="shrink-0"
                        disabled={deletingItemId === item.id}
                        onClick={() => handleDeleteItem(item.id)}
                      >
                        {deletingItemId === item.id ? "Excluindo…" : "Excluir"}
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    Indicado por {item.requestedBy.name} — solicitado: {item.quantity}
                  </p>
                  {item.supplierName && (
                    <p className="text-xs text-slate-500">Fornecedor sugerido: {item.supplierName}</p>
                  )}
                  {item.criticality != null && (
                    <p className="text-xs text-slate-500">Criticidade: {item.criticality}</p>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    <Input
                      label="Aprovar"
                      type="number"
                      min={0}
                      className="w-24"
                      value={decisions[item.id]?.approved ?? 0}
                      onChange={(e) =>
                        setDecisions((current) => ({
                          ...current,
                          [item.id]: {
                            approved: Number(e.target.value),
                            deferred: current[item.id]?.deferred ?? 0,
                          },
                        }))
                      }
                    />
                    <Input
                      label="Postergar"
                      type="number"
                      min={0}
                      className="w-24"
                      value={decisions[item.id]?.deferred ?? 0}
                      onChange={(e) =>
                        setDecisions((current) => ({
                          ...current,
                          [item.id]: {
                            approved: current[item.id]?.approved ?? 0,
                            deferred: Number(e.target.value),
                          },
                        }))
                      }
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2 border-t border-slate-200 pt-3">
              <p className="text-sm font-medium text-slate-900">Discussão / Sugestões de fornecedor</p>

              {commentsLoading && <p className="text-sm text-slate-500">Carregando comentários…</p>}

              {!commentsLoading && comments.length === 0 && (
                <p className="text-sm text-slate-500">Nenhum comentário ainda.</p>
              )}

              {!commentsLoading && comments.length > 0 && (
                <div className="space-y-2">
                  {comments.map((comment) => (
                    <div key={comment.id} className="rounded border border-slate-200 p-2">
                      <p className="text-xs text-slate-500">
                        {comment.author.name} — {formatDateTime(comment.createdAt)}
                      </p>
                      <p className="text-sm text-slate-900">{comment.body}</p>
                      {comment.supplierName && (
                        <div className="mt-1">
                          <Badge color="sky">Fornecedor sugerido: {comment.supplierName}</Badge>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {user?.canPurchase && (
                <div className="space-y-2">
                  <Textarea
                    label="Novo comentário"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Escreva um comentário ou sugestão…"
                  />
                  <Input
                    label="Fornecedor sugerido"
                    value={newCommentSupplier}
                    onChange={(e) => setNewCommentSupplier(e.target.value)}
                    placeholder="Fornecedor sugerido (opcional)"
                  />
                  <div className="flex justify-end">
                    <Button type="button" disabled={postingComment} onClick={handlePostComment}>
                      {postingComment ? "Enviando…" : "Comentar"}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <Textarea label="Notas da revisão" value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} />

            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setReviewing(null)}>
                Cancelar
              </Button>
              <Button type="button" variant="danger" disabled={submitting} onClick={() => handleReview("DEVOLVER")}>
                Devolver
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
