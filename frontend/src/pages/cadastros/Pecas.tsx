import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import * as partsApi from "../../api/parts";
import { Part } from "../../types";
import { Table } from "../../components/Table";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { Input } from "../../components/Input";
import { EmptyState } from "../../components/EmptyState";
import { getErrorMessage } from "../../lib/errors";
import { useToast } from "../../components/ToastProvider";

const emptyForm = { code: "", description: "", unit: "", stockQty: 0 };

export default function Pecas() {
  const { token } = useAuth();
  const { showError, showSuccess } = useToast();

  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Part | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Peças</h1>
          <p className="text-sm text-slate-500">Cadastro de itens do almoxarifado.</p>
        </div>
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
            <Input label="Código" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
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
  );
}
