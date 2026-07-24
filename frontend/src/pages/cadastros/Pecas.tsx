import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import * as partsApi from "../../api/parts";
import * as partRequestsApi from "../../api/partRequests";
import { Part, PartRequest } from "../../types";
import { Table } from "../../components/Table";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { Input } from "../../components/Input";
import { Select } from "../../components/Select";
import { SearchableSelect } from "../../components/SearchableSelect";
import { Textarea } from "../../components/Textarea";
import { Badge } from "../../components/Badge";
import { EmptyState } from "../../components/EmptyState";
import { getErrorMessage } from "../../lib/errors";
import { useToast } from "../../components/ToastProvider";
import { formatDateTime } from "../../lib/format";
import { PartRequestItemType, Role } from "../../domain/enums";
import {
  PART_REQUEST_ITEM_TYPE_LABELS,
  PART_REQUEST_STATUS_COLORS,
  PART_REQUEST_STATUS_LABELS,
} from "../../domain/labels";

const emptyForm = { code: "", description: "", unit: "", stockQty: 0 };

const emptyIndicateForm = {
  itemType: PartRequestItemType.PECA as PartRequestItemType,
  partId: "",
  description: "",
  quantity: 1,
  notes: "",
  osId: "",
};

export default function Pecas() {
  const { token, user } = useAuth();
  const { showError, showSuccess } = useToast();
  const canManageCadastro = user?.role === Role.SUPERVISOR;

  const [tab, setTab] = useState<"cadastro" | "indicar">(() => (canManageCadastro ? "cadastro" : "indicar"));

  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Part | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const [myRequests, setMyRequests] = useState<PartRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [showIndicateForm, setShowIndicateForm] = useState(false);
  const [indicateForm, setIndicateForm] = useState(emptyIndicateForm);
  const [submittingIndicate, setSubmittingIndicate] = useState(false);

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

  function reloadRequests() {
    if (!token) return;
    setLoadingRequests(true);
    partRequestsApi
      .listMyPartRequests(token)
      .then(setMyRequests)
      .catch((err) => showError(getErrorMessage(err)))
      .finally(() => setLoadingRequests(false));
  }

  useEffect(reloadRequests, [token]);

  function openIndicateForm() {
    setIndicateForm(emptyIndicateForm);
    setShowIndicateForm(true);
  }

  async function handleIndicateSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSubmittingIndicate(true);
    try {
      await partRequestsApi.createPartRequest(token, {
        itemType: indicateForm.itemType,
        description: indicateForm.description,
        quantity: Number(indicateForm.quantity),
        partId:
          indicateForm.itemType === PartRequestItemType.PECA && indicateForm.partId
            ? indicateForm.partId
            : undefined,
        notes: indicateForm.notes || undefined,
        osId: indicateForm.osId || undefined,
      });
      showSuccess("Indicação registrada.");
      setShowIndicateForm(false);
      reloadRequests();
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setSubmittingIndicate(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(part: Part) {
    setEditing(part);
    setForm({ code: part.code, description: part.description, unit: part.unit, stockQty: part.stockQty });
    setShowForm(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSubmitting(true);
    try {
      const payload = { ...form, stockQty: Number(form.stockQty) };
      if (editing) {
        await partsApi.updatePart(token, editing.id, payload);
        showSuccess("Peça atualizada.");
      } else {
        await partsApi.createPart(token, payload);
        showSuccess("Peça criada.");
      }
      setShowForm(false);
      reload();
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(part: Part) {
    if (!token) return;
    if (!confirm(`Remover a peça ${part.code}?`)) return;
    try {
      await partsApi.deletePart(token, part.id);
      showSuccess("Peça removida.");
      reload();
    } catch (err) {
      showError(getErrorMessage(err));
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Peças</h1>
        <p className="text-sm text-slate-500">Cadastro de itens do almoxarifado.</p>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {canManageCadastro && (
          <button
            onClick={() => setTab("cadastro")}
            className={`px-4 py-2 text-sm font-medium ${
              tab === "cadastro" ? "border-b-2 border-slate-900 text-slate-900" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Cadastro
          </button>
        )}
        <button
          onClick={() => setTab("indicar")}
          className={`px-4 py-2 text-sm font-medium ${
            tab === "indicar" ? "border-b-2 border-slate-900 text-slate-900" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Indicar falta
        </button>
      </div>

      {tab === "cadastro" && canManageCadastro && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={openCreate}>Nova peça</Button>
          </div>

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
                {
                  header: "Ações",
                  isActions: true,
                  cell: (p) => (
                    <div className="flex gap-2">
                      <Button variant="secondary" onClick={() => openEdit(p)}>
                        Editar
                      </Button>
                      <Button variant="danger" onClick={() => handleDelete(p)}>
                        Remover
                      </Button>
                    </div>
                  ),
                },
              ]}
            />
          )}

          {showForm && (
            <Modal title={editing ? "Editar peça" : "Nova peça"} onClose={() => setShowForm(false)}>
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label="Código"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  required
                />
                <Input
                  label="Descrição"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  required
                />
                <Input
                  label="Unidade (un, m, L…)"
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  required
                />
                <Input
                  label="Saldo em estoque"
                  type="number"
                  min={0}
                  value={form.stockQty}
                  onChange={(e) => setForm({ ...form, stockQty: Number(e.target.value) })}
                  required
                />

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
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
      )}

      {tab === "indicar" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={openIndicateForm}>Indicar peça/ferramenta em falta</Button>
          </div>

          {loadingRequests && <p className="text-sm text-slate-500">Carregando…</p>}

          {!loadingRequests && myRequests.length === 0 && (
            <EmptyState title="Nenhuma indicação registrada" />
          )}

          {!loadingRequests && myRequests.length > 0 && (
            <Table
              rows={myRequests}
              rowKey={(r) => r.id}
              columns={[
                { header: "Item", cell: (r) => PART_REQUEST_ITEM_TYPE_LABELS[r.itemType] },
                { header: "Descrição", cell: (r) => r.description },
                { header: "Qtd", cell: (r) => r.quantity },
                {
                  header: "Status",
                  cell: (r) => (
                    <Badge color={PART_REQUEST_STATUS_COLORS[r.status]}>
                      {PART_REQUEST_STATUS_LABELS[r.status]}
                    </Badge>
                  ),
                },
                { header: "Data", cell: (r) => formatDateTime(r.createdAt) },
              ]}
            />
          )}

          {showIndicateForm && (
            <Modal title="Indicar peça/ferramenta em falta" onClose={() => setShowIndicateForm(false)}>
              <form onSubmit={handleIndicateSubmit} className="space-y-4">
                <Select
                  label="Tipo"
                  value={indicateForm.itemType}
                  onChange={(e) =>
                    setIndicateForm({
                      ...indicateForm,
                      itemType: e.target.value as PartRequestItemType,
                      partId: "",
                    })
                  }
                >
                  {Object.values(PartRequestItemType).map((value) => (
                    <option key={value} value={value}>
                      {PART_REQUEST_ITEM_TYPE_LABELS[value]}
                    </option>
                  ))}
                </Select>

                {indicateForm.itemType === PartRequestItemType.PECA && (
                  <SearchableSelect
                    label="Peça já cadastrada (opcional)"
                    value={indicateForm.partId}
                    onChange={(partId) => setIndicateForm({ ...indicateForm, partId })}
                    options={[
                      { value: "", label: "Não cadastrada" },
                      ...parts.map((p) => ({ value: p.id, label: `${p.code} — ${p.description}` })),
                    ]}
                  />
                )}

                <Input
                  label="Descrição"
                  value={indicateForm.description}
                  onChange={(e) => setIndicateForm({ ...indicateForm, description: e.target.value })}
                  required
                />
                <Input
                  label="Quantidade"
                  type="number"
                  min={1}
                  value={indicateForm.quantity}
                  onChange={(e) => setIndicateForm({ ...indicateForm, quantity: Number(e.target.value) })}
                  required
                />
                <Textarea
                  label="Observações (opcional)"
                  value={indicateForm.notes}
                  onChange={(e) => setIndicateForm({ ...indicateForm, notes: e.target.value })}
                />
                <Input
                  label="OS vinculada (opcional)"
                  value={indicateForm.osId}
                  onChange={(e) => setIndicateForm({ ...indicateForm, osId: e.target.value })}
                />

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={() => setShowIndicateForm(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={submittingIndicate}>
                    {submittingIndicate ? "Enviando…" : "Enviar indicação"}
                  </Button>
                </div>
              </form>
            </Modal>
          )}
        </div>
      )}
    </div>
  );
}
