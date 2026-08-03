import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import * as stockApi from "../../api/stock";
import * as partsApi from "../../api/parts";
import { Part } from "../../types";
import { Role } from "../../domain/enums";
import { Table } from "../../components/Table";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { Input } from "../../components/Input";
import { Select } from "../../components/Select";
import { Textarea } from "../../components/Textarea";
import { SearchableSelect } from "../../components/SearchableSelect";
import { EmptyState } from "../../components/EmptyState";
import { useToast } from "../../components/ToastProvider";
import { getErrorMessage } from "../../lib/errors";

type ModalType = "entry" | "adjust" | "return" | null;

const emptyEntryForm = { partId: "", quantity: 1, unitCost: "", reason: "" };
const emptyAdjustForm = { partId: "", quantity: 1, direction: "increase" as "increase" | "decrease", reason: "" };
const emptyReturnForm = { partId: "", quantity: 1, workOrderId: "", reason: "" };

export default function Estoque() {
  const { token, user } = useAuth();
  const { showError, showSuccess } = useToast();
  const podeMovimentar = user?.role === Role.SUPERVISOR || user?.canManageStock === true;

  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalType>(null);
  const [submitting, setSubmitting] = useState(false);

  const [entryForm, setEntryForm] = useState(emptyEntryForm);
  const [adjustForm, setAdjustForm] = useState(emptyAdjustForm);
  const [returnForm, setReturnForm] = useState(emptyReturnForm);

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

  function openModal(type: ModalType) {
    setEntryForm(emptyEntryForm);
    setAdjustForm(emptyAdjustForm);
    setReturnForm(emptyReturnForm);
    setModal(type);
  }

  function closeModal() {
    setModal(null);
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

  const partOptions = parts.map((p) => ({ value: p.id, label: `${p.code} — ${p.description}` }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Estoque</h1>
        <p className="text-sm text-slate-500">Controle de estoque e movimentações.</p>
      </div>

      {podeMovimentar && (
        <div className="flex gap-2">
          <Button onClick={() => openModal("entry")}>Entrada</Button>
          <Button variant="secondary" onClick={() => openModal("adjust")}>
            Ajuste
          </Button>
          <Button variant="secondary" onClick={() => openModal("return")}>
            Devolução
          </Button>
        </div>
      )}

      {loading && <p className="text-sm text-slate-500">Carregando…</p>}

      {!loading && parts.length === 0 && <EmptyState title="Nenhuma peça cadastrada" />}

      {!loading && parts.length > 0 && (
        <Table
          rows={parts}
          rowKey={(p) => p.id}
          columns={[
            { header: "Código", cell: (p) => p.code },
            { header: "Descrição", cell: (p) => p.description },
            { header: "Unidade", cell: (p) => p.unit },
            { header: "Saldo", cell: (p) => p.stockQty },
            { header: "Mínimo", cell: (p) => p.minStock ?? "—" },
            { header: "Localização", cell: (p) => p.location ?? "—" },
          ]}
        />
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
    </div>
  );
}
