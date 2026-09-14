import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import * as stockApi from "../../api/stock";
import * as partsApi from "../../api/parts";
import * as stockWithdrawalsApi from "../../api/stockWithdrawals";
import { Part, StockMovement, StockWithdrawalRequest } from "../../types";
import { Role, StockStatus } from "../../domain/enums";
import {
  STOCK_MOVEMENT_TYPE_COLORS,
  STOCK_MOVEMENT_TYPE_LABELS,
  STOCK_STATUS_COLORS,
  STOCK_STATUS_LABELS,
} from "../../domain/labels";
import { Table } from "../../components/Table";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { Input } from "../../components/Input";
import { Select } from "../../components/Select";
import { Textarea } from "../../components/Textarea";
import { SearchableSelect } from "../../components/SearchableSelect";
import { EmptyState } from "../../components/EmptyState";
import { Badge } from "../../components/Badge";
import { Checkbox } from "../../components/Checkbox";
import { useToast } from "../../components/ToastProvider";
import { getErrorMessage } from "../../lib/errors";
import { formatDateTime } from "../../lib/format";
import { EstoqueDashboard } from "./EstoqueDashboard";

type ModalType = "entry" | "adjust" | "return" | "part" | null;

const isLowStock = (p: Part) => p.minStock !== null && p.stockQty <= p.minStock;

// Combining diacritical marks (U+0300-U+036F), built from char codes to dodge editor unicode normalization.
const DIACRITICS_PATTERN = new RegExp(String.fromCharCode(0x5b, 0x5c, 0x75, 0x30, 0x33, 0x30, 0x30, 0x2d, 0x5c, 0x75, 0x30, 0x33, 0x36, 0x66, 0x5d), "g");

const normalize = (s: string) =>
  s.normalize("NFD").replace(DIACRITICS_PATTERN, "").toLowerCase().trim();

const emptyEntryForm = { partId: "", quantity: 1, unitCost: "", reason: "" };
const emptyAdjustForm = {
  partId: "",
  quantity: 1,
  direction: "increase" as "increase" | "decrease",
  reason: "",
  stockStatusOverride: "" as "" | StockStatus, // "" = automático
  orderRef: "",
};
const emptyReturnForm = { partId: "", quantity: 1, workOrderId: "", reason: "" };
const emptyPartForm = {
  code: "",
  description: "",
  unit: "",
  minStock: "" as string,
  maxStock: "" as string,
  location: "",
};

export default function Estoque() {
  const { token, user } = useAuth();
  const { showError, showSuccess } = useToast();
  const podeMovimentar = user?.role === Role.SUPERVISOR || user?.canManageStock === true;

  const [tab, setTab] = useState<"dashboard" | "movimentacao" | "extrato" | "aprovacoes">("dashboard");
  const [onlyLowStock, setOnlyLowStock] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalType>(null);
  const [submitting, setSubmitting] = useState(false);

  const [entryForm, setEntryForm] = useState(emptyEntryForm);
  const [adjustForm, setAdjustForm] = useState(emptyAdjustForm);
  const [returnForm, setReturnForm] = useState(emptyReturnForm);
  const [partForm, setPartForm] = useState(emptyPartForm);
  const [editingPart, setEditingPart] = useState<Part | null>(null);

  const [selectedPartId, setSelectedPartId] = useState("");
  const [ledger, setLedger] = useState<StockMovement[]>([]);
  const [loadingLedger, setLoadingLedger] = useState(false);

  const [withdrawals, setWithdrawals] = useState<StockWithdrawalRequest[]>([]);
  const [loadingWithdrawals, setLoadingWithdrawals] = useState(false);
  const [reviewing, setReviewing] = useState<StockWithdrawalRequest | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  function reload() {
    if (!token) return;
    setLoading(true);
    partsApi
      .listParts(token)
      .then(setParts)
      .catch((err) => showError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }

  useEffect(reload, [token]);

  function reloadWithdrawals() {
    if (!token) return;
    setLoadingWithdrawals(true);
    stockWithdrawalsApi
      .listPendingStockWithdrawals(token)
      .then(setWithdrawals)
      .catch((err) => showError(getErrorMessage(err)))
      .finally(() => setLoadingWithdrawals(false));
  }

  useEffect(() => {
    if (tab === "aprovacoes") reloadWithdrawals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, token]);

  async function handleReviewWithdrawal(action: "APROVAR" | "REJEITAR") {
    if (!token || !reviewing) return;
    if (action === "REJEITAR" && !reviewNotes.trim()) {
      showError("Motivo é obrigatório ao rejeitar.");
      return;
    }
    setReviewSubmitting(true);
    try {
      await stockWithdrawalsApi.reviewStockWithdrawal(token, reviewing.id, {
        action,
        reviewNotes: reviewNotes.trim() || undefined,
      });
      showSuccess(action === "APROVAR" ? "Baixa aprovada — estoque atualizado." : "Solicitação rejeitada.");
      setReviewing(null);
      reloadWithdrawals();
      reload();
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setReviewSubmitting(false);
    }
  }

  function openModal(type: ModalType) {
    setEntryForm(emptyEntryForm);
    setAdjustForm(emptyAdjustForm);
    setReturnForm(emptyReturnForm);
    setPartForm(emptyPartForm);
    setEditingPart(null);
    setModal(type);
  }

  function closeModal() {
    setModal(null);
  }

  function openEditPart(part: Part) {
    setEditingPart(part);
    setPartForm({
      code: part.code,
      description: part.description,
      unit: part.unit,
      minStock: part.minStock === null ? "" : String(part.minStock),
      maxStock: part.maxStock === null ? "" : String(part.maxStock),
      location: part.location ?? "",
    });
    setModal("part");
  }

  async function handleEntrySubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (!entryForm.partId) return showError("Selecione uma peça.");
    if (Number(entryForm.quantity) <= 0) return showError("Quantidade deve ser maior que zero.");
    if (!entryForm.reason.trim()) return showError("Observação é obrigatória.");

    setSubmitting(true);
    try {
      await stockApi.stockEntry(token, {
        partId: entryForm.partId,
        quantity: Number(entryForm.quantity),
        reason: entryForm.reason,
        unitCost: entryForm.unitCost === "" ? undefined : Number(entryForm.unitCost),
      });
      showSuccess("Entrada registrada.");
      closeModal();
      reload();
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAdjustSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (!adjustForm.partId) return showError("Selecione uma peça.");
    if (Number(adjustForm.quantity) <= 0) return showError("Quantidade deve ser maior que zero.");
    if (!adjustForm.reason.trim()) return showError("Observação é obrigatória.");

    setSubmitting(true);
    try {
      await stockApi.stockAdjust(token, {
        partId: adjustForm.partId,
        quantity: Number(adjustForm.quantity),
        direction: adjustForm.direction,
        reason: adjustForm.reason,
        stockStatusOverride: adjustForm.stockStatusOverride === "" ? null : adjustForm.stockStatusOverride,
        orderRef: adjustForm.orderRef.trim() || undefined,
      });
      showSuccess("Ajuste registrado.");
      closeModal();
      reload();
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReturnSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (!returnForm.partId) return showError("Selecione uma peça.");
    if (Number(returnForm.quantity) <= 0) return showError("Quantidade deve ser maior que zero.");
    if (!returnForm.reason.trim()) return showError("Observação é obrigatória.");

    setSubmitting(true);
    try {
      await stockApi.stockReturn(token, {
        partId: returnForm.partId,
        quantity: Number(returnForm.quantity),
        reason: returnForm.reason,
        workOrderId: returnForm.workOrderId === "" ? undefined : returnForm.workOrderId,
      });
      showSuccess("Devolução registrada.");
      closeModal();
      reload();
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePartSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (!editingPart && !partForm.code.trim()) return showError("Código é obrigatório.");
    if (!editingPart && !partForm.description.trim()) return showError("Descrição é obrigatória.");
    if (!partForm.unit.trim()) return showError("Unidade é obrigatória.");

    const minStock = partForm.minStock === "" ? undefined : Number(partForm.minStock);
    const maxStock = partForm.maxStock === "" ? undefined : Number(partForm.maxStock);
    const location = partForm.location.trim() === "" ? undefined : partForm.location.trim();

    setSubmitting(true);
    try {
      if (editingPart) {
        await partsApi.updatePart(token, editingPart.id, {
          unit: partForm.unit,
          minStock: partForm.minStock === "" ? null : Number(partForm.minStock),
          maxStock: partForm.maxStock === "" ? null : Number(partForm.maxStock),
          location: partForm.location.trim() === "" ? null : partForm.location.trim(),
        });
        showSuccess("Peça atualizada.");
      } else {
        await partsApi.createPart(token, {
          code: partForm.code,
          description: partForm.description,
          unit: partForm.unit,
          minStock,
          maxStock,
          location,
        });
        showSuccess("Peça criada.");
      }
      closeModal();
      reload();
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const partOptions = parts.map((p) => ({ value: p.id, label: `${p.code} — ${p.description}` }));
  const visibleParts = parts.filter((p) => {
    if (onlyLowStock && !isLowStock(p)) return false;
    const q = normalize(searchTerm);
    if (!q) return true;
    return normalize(p.description).includes(q) || normalize(p.code).includes(q);
  });

  function handleSelectLedgerPart(partId: string) {
    setSelectedPartId(partId);
    if (partId === "") {
      setLedger([]);
      return;
    }
    if (!token) return;
    setLoadingLedger(true);
    stockApi
      .getLedger(token, partId)
      .then(setLedger)
      .catch((err) => showError(getErrorMessage(err)))
      .finally(() => setLoadingLedger(false));
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Estoque</h1>
        <p className="text-sm text-slate-500">Controle de estoque e movimentações.</p>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        <button
          onClick={() => setTab("dashboard")}
          className={`px-4 py-2 text-sm font-medium ${
            tab === "dashboard" ? "border-b-2 border-slate-900 text-slate-900" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Dashboard
        </button>
        <button
          onClick={() => setTab("movimentacao")}
          className={`px-4 py-2 text-sm font-medium ${
            tab === "movimentacao" ? "border-b-2 border-slate-900 text-slate-900" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Movimentação
        </button>
        <button
          onClick={() => setTab("extrato")}
          className={`px-4 py-2 text-sm font-medium ${
            tab === "extrato" ? "border-b-2 border-slate-900 text-slate-900" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Extrato
        </button>
        {podeMovimentar && (
          <button
            onClick={() => setTab("aprovacoes")}
            className={`px-4 py-2 text-sm font-medium ${
              tab === "aprovacoes" ? "border-b-2 border-slate-900 text-slate-900" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Aprovações de baixa
          </button>
        )}
      </div>

      {tab === "dashboard" && <EstoqueDashboard />}

      {tab === "movimentacao" && (
        <div className="space-y-4">
          {podeMovimentar && (
            <div className="flex gap-2">
              <Button onClick={() => openModal("entry")}>Entrada</Button>
              <Button variant="secondary" onClick={() => openModal("adjust")}>
                Ajuste
              </Button>
              <Button variant="secondary" onClick={() => openModal("return")}>
                Devolução
              </Button>
              <Button variant="secondary" onClick={() => openModal("part")}>
                Nova peça
              </Button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4">
            <Input
              type="text"
              placeholder="Buscar por descrição ou código..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-xs"
            />
            <Checkbox
              label="Só peças em reposição"
              checked={onlyLowStock}
              onChange={(e) => setOnlyLowStock(e.target.checked)}
            />
          </div>

          {loading && <p className="text-sm text-slate-500">Carregando…</p>}

          {!loading && visibleParts.length === 0 && <EmptyState title="Nenhuma peça cadastrada" />}

          {!loading && visibleParts.length > 0 && (
            <Table
              rows={visibleParts}
              rowKey={(p) => p.id}
              onRowClick={podeMovimentar ? openEditPart : undefined}
              columns={[
                { header: "Código", cell: (p) => p.code },
                { header: "Descrição", cell: (p) => p.description },
                { header: "Unidade", cell: (p) => p.unit },
                { header: "Saldo", cell: (p) => p.stockQty },
                { header: "Mínimo", cell: (p) => p.minStock ?? "—" },
                { header: "Máximo", cell: (p) => p.maxStock ?? "—" },
                {
                  header: "Status",
                  cell: (p) => (
                    <Badge color={STOCK_STATUS_COLORS[p.stockStatus]}>{STOCK_STATUS_LABELS[p.stockStatus]}</Badge>
                  ),
                },
                { header: "Localização", cell: (p) => p.location ?? "—" },
              ]}
            />
          )}
        </div>
      )}

      {tab === "extrato" && (
        <div className="space-y-4">
          <SearchableSelect
            label="Peça"
            value={selectedPartId}
            onChange={handleSelectLedgerPart}
            options={partOptions}
          />

          {!selectedPartId && <EmptyState title="Selecione uma peça para ver o extrato" />}

          {selectedPartId && loadingLedger && <p className="text-sm text-slate-500">Carregando…</p>}

          {selectedPartId && !loadingLedger && ledger.length === 0 && (
            <EmptyState title="Nenhuma movimentação para esta peça" />
          )}

          {selectedPartId && !loadingLedger && ledger.length > 0 && (
            <Table
              rows={ledger}
              rowKey={(m) => m.id}
              columns={[
                { header: "Data", cell: (m) => formatDateTime(m.createdAt) },
                {
                  header: "Tipo",
                  cell: (m) => (
                    <Badge color={STOCK_MOVEMENT_TYPE_COLORS[m.type]}>{STOCK_MOVEMENT_TYPE_LABELS[m.type]}</Badge>
                  ),
                },
                { header: "Quantidade", cell: (m) => m.quantity },
                { header: "Saldo após", cell: (m) => m.balanceAfter },
                { header: "Observação", cell: (m) => m.reason ?? "—" },
                { header: "OS", cell: (m) => m.workOrderId ?? "—" },
              ]}
            />
          )}
        </div>
      )}

      {tab === "aprovacoes" && podeMovimentar && (
        <div className="space-y-4">
          {loadingWithdrawals && <p className="text-sm text-slate-500">Carregando…</p>}

          {!loadingWithdrawals && withdrawals.length === 0 && (
            <EmptyState title="Nenhuma solicitação de baixa pendente" />
          )}

          {!loadingWithdrawals && withdrawals.length > 0 && (
            <Table
              rows={withdrawals}
              rowKey={(r) => r.id}
              onRowClick={(r) => {
                setReviewing(r);
                setReviewNotes("");
              }}
              columns={[
                { header: "OS", cell: (r) => r.workOrder?.number ?? "—" },
                { header: "Subtarefa", cell: (r) => r.subtask?.title ?? "—" },
                { header: "Solicitado por", cell: (r) => r.requestedBy.name },
                { header: "Itens", cell: (r) => r.items.length },
                { header: "Data", cell: (r) => formatDateTime(r.createdAt) },
              ]}
            />
          )}
        </div>
      )}

      {reviewing && (
        <Modal
          title={`Solicitação de baixa — OS ${reviewing.workOrder?.number ?? "—"}`}
          onClose={() => setReviewing(null)}
        >
          <div className="space-y-4">
            {reviewing.subtask && (
              <p className="text-sm text-slate-500">Subtarefa: {reviewing.subtask.title}</p>
            )}
            <p className="text-sm text-slate-500">Solicitado por: {reviewing.requestedBy.name}</p>

            <div className="space-y-2">
              {reviewing.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded border border-slate-200 p-2 text-sm"
                >
                  <span>
                    {item.part.code} — {item.part.description}
                  </span>
                  <span className="font-medium">
                    {item.quantity} {item.part.unit}
                  </span>
                </div>
              ))}
            </div>

            <Textarea
              label="Motivo (obrigatório ao rejeitar)"
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
            />

            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setReviewing(null)}>
                Cancelar
              </Button>
              <Button
                type="button"
                variant="danger"
                disabled={reviewSubmitting}
                onClick={() => handleReviewWithdrawal("REJEITAR")}
              >
                Rejeitar
              </Button>
              <Button type="button" disabled={reviewSubmitting} onClick={() => handleReviewWithdrawal("APROVAR")}>
                {reviewSubmitting ? "Salvando…" : "Aprovar"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {modal === "entry" && (
        <Modal title="Entrada de estoque" onClose={closeModal}>
          <form onSubmit={handleEntrySubmit} className="space-y-4">
            <SearchableSelect
              label="Peça"
              value={entryForm.partId}
              onChange={(partId) => setEntryForm({ ...entryForm, partId })}
              options={partOptions}
              required
            />
            <Input
              label="Quantidade"
              type="number"
              min={1}
              value={entryForm.quantity}
              onChange={(e) => setEntryForm({ ...entryForm, quantity: Number(e.target.value) })}
              required
            />
            <Input
              label="Custo unitário (opcional)"
              type="number"
              min={0}
              value={entryForm.unitCost}
              onChange={(e) => setEntryForm({ ...entryForm, unitCost: e.target.value })}
            />
            <Textarea
              label="Observação"
              value={entryForm.reason}
              onChange={(e) => setEntryForm({ ...entryForm, reason: e.target.value })}
              required
            />

            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={closeModal}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {modal === "adjust" && (
        <Modal title="Ajuste de estoque" onClose={closeModal}>
          <form onSubmit={handleAdjustSubmit} className="space-y-4">
            <SearchableSelect
              label="Peça"
              value={adjustForm.partId}
              onChange={(partId) => setAdjustForm({ ...adjustForm, partId })}
              options={partOptions}
              required
            />
            <Select
              label="Direção"
              value={adjustForm.direction}
              onChange={(e) =>
                setAdjustForm({ ...adjustForm, direction: e.target.value as "increase" | "decrease" })
              }
            >
              <option value="increase">Aumentar</option>
              <option value="decrease">Diminuir</option>
            </Select>
            <Input
              label="Quantidade (magnitude)"
              type="number"
              min={1}
              value={adjustForm.quantity}
              onChange={(e) => setAdjustForm({ ...adjustForm, quantity: Number(e.target.value) })}
              required
            />
            <Textarea
              label="Observação"
              value={adjustForm.reason}
              onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
              required
            />
            <Select
              label="Status (opcional — automático se vazio)"
              value={adjustForm.stockStatusOverride}
              onChange={(e) =>
                setAdjustForm((f) => ({ ...f, stockStatusOverride: e.target.value as "" | StockStatus }))
              }
            >
              <option value="">Automático</option>
              {Object.values(StockStatus).map((s) => (
                <option key={s} value={s}>
                  {STOCK_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
            <Input
              label="Nº do pedido (opcional)"
              value={adjustForm.orderRef}
              onChange={(e) => setAdjustForm((f) => ({ ...f, orderRef: e.target.value }))}
              placeholder="Ex.: PC-2026-0142"
            />

            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={closeModal}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {modal === "return" && (
        <Modal title="Devolução ao estoque" onClose={closeModal}>
          <form onSubmit={handleReturnSubmit} className="space-y-4">
            <SearchableSelect
              label="Peça"
              value={returnForm.partId}
              onChange={(partId) => setReturnForm({ ...returnForm, partId })}
              options={partOptions}
              required
            />
            <Input
              label="Quantidade"
              type="number"
              min={1}
              value={returnForm.quantity}
              onChange={(e) => setReturnForm({ ...returnForm, quantity: Number(e.target.value) })}
              required
            />
            <Input
              label="OS vinculada (opcional)"
              value={returnForm.workOrderId}
              onChange={(e) => setReturnForm({ ...returnForm, workOrderId: e.target.value })}
            />
            <Textarea
              label="Observação"
              value={returnForm.reason}
              onChange={(e) => setReturnForm({ ...returnForm, reason: e.target.value })}
              required
            />

            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={closeModal}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {modal === "part" && (
        <Modal title={editingPart ? "Editar peça" : "Nova peça"} onClose={closeModal}>
          <form onSubmit={handlePartSubmit} className="space-y-4">
            {!editingPart && (
              <>
                <Input
                  label="Código"
                  value={partForm.code}
                  onChange={(e) => setPartForm({ ...partForm, code: e.target.value })}
                  required
                />
                <Input
                  label="Descrição"
                  value={partForm.description}
                  onChange={(e) => setPartForm({ ...partForm, description: e.target.value })}
                  required
                />
              </>
            )}
            {editingPart && (
              <div className="text-sm text-slate-500">
                {editingPart.code} — {editingPart.description}
              </div>
            )}
            <Input
              label="Unidade"
              value={partForm.unit}
              onChange={(e) => setPartForm({ ...partForm, unit: e.target.value })}
              required
            />
            <Input
              label="Estoque mínimo (opcional)"
              type="number"
              min={0}
              value={partForm.minStock}
              onChange={(e) => setPartForm({ ...partForm, minStock: e.target.value })}
            />
            <Input
              label="Estoque máximo (opcional)"
              type="number"
              min={0}
              value={partForm.maxStock}
              onChange={(e) => setPartForm({ ...partForm, maxStock: e.target.value })}
            />
            <Input
              label="Localização (opcional)"
              value={partForm.location}
              onChange={(e) => setPartForm({ ...partForm, location: e.target.value })}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={closeModal}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
