import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import * as sectorsApi from "../../api/sectors";
import { Sector } from "../../api/sectors";
import { Table } from "../../components/Table";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { Input } from "../../components/Input";
import { Checkbox } from "../../components/Checkbox";
import { EmptyState } from "../../components/EmptyState";
import { getErrorMessage } from "../../lib/errors";
import { useToast } from "../../components/ToastProvider";

interface SectorFormState {
  name: string;
  active: boolean;
}

const emptyForm: SectorFormState = {
  name: "",
  active: true,
};

export default function Setores() {
  const { token } = useAuth();
  const { showError, showSuccess } = useToast();

  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Sector | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  function reload() {
    if (!token) return;
    setLoading(true);
    sectorsApi
      .listSectors(token)
      .then(setSectors)
      .catch((err) => showError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }

  useEffect(reload, [token]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(sector: Sector) {
    setEditing(sector);
    setForm({ name: sector.name, active: sector.active });
    setShowForm(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSubmitting(true);
    try {
      if (editing) {
        await sectorsApi.updateSector(token, editing.id, { name: form.name, active: form.active });
        showSuccess("Setor atualizado.");
      } else {
        await sectorsApi.createSector(token, { name: form.name });
        showSuccess("Setor criado.");
      }
      setShowForm(false);
      reload();
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(sector: Sector) {
    if (!token) return;
    if (!confirm(`Remover o setor ${sector.name}?`)) return;
    try {
      await sectorsApi.deleteSector(token, sector.id);
      showSuccess("Setor removido.");
      reload();
    } catch (err) {
      showError(getErrorMessage(err));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Setores</h1>
          <p className="text-sm text-slate-500">Cadastro de setores da planta.</p>
        </div>
        <Button onClick={openCreate}>Novo setor</Button>
      </div>

      {loading && <p className="text-sm text-slate-500">Carregando…</p>}

      {!loading && sectors.length === 0 && <EmptyState title="Nenhum setor cadastrado" />}

      {!loading && sectors.length > 0 && (
        <Table
          rows={sectors}
          rowKey={(s) => s.id}
          columns={[
            { header: "Nome", cell: (s) => s.name },
            { header: "Status", cell: (s) => (s.active ? "Ativo" : "Inativo") },
            {
              header: "Ações",
              isActions: true,
              cell: (s) => (
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => openEdit(s)}>
                    Editar
                  </Button>
                  <Button variant="danger" onClick={() => handleDelete(s)}>
                    Remover
                  </Button>
                </div>
              ),
            },
          ]}
        />
      )}

      {showForm && (
        <Modal title={editing ? "Editar setor" : "Novo setor"} onClose={() => setShowForm(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />

            {editing && (
              <Checkbox
                label="Ativo"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />
            )}

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
