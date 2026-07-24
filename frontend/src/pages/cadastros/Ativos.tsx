import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { useSectors } from "../../hooks/useSectors";
import * as assetsApi from "../../api/assets";
import { Asset } from "../../types";
import { Table } from "../../components/Table";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { Input } from "../../components/Input";
import { SearchableSelect } from "../../components/SearchableSelect";
import { EmptyState } from "../../components/EmptyState";
import { getErrorMessage } from "../../lib/errors";
import { useToast } from "../../components/ToastProvider";

interface AssetFormState {
  code: string;
  name: string;
  sectorId: string;
  location: string;
  criticality: number;
  preventivePeriodicityDays: string;
}

const emptyForm: AssetFormState = {
  code: "",
  name: "",
  sectorId: "",
  location: "",
  criticality: 3,
  preventivePeriodicityDays: "",
};

export default function Ativos() {
  const { token } = useAuth();
  const { showError, showSuccess } = useToast();
  const { sectors, loading: loadingSectors } = useSectors(token);

  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  function reload() {
    if (!token) return;
    setLoading(true);
    assetsApi
      .listAssets(token)
      .then(setAssets)
      .catch((err) => showError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }

  useEffect(reload, [token]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(asset: Asset) {
    setEditing(asset);
    setForm({
      code: asset.code,
      name: asset.name,
      sectorId: asset.sectorId,
      location: asset.location,
      criticality: asset.criticality,
      preventivePeriodicityDays: asset.preventivePeriodicityDays?.toString() ?? "",
    });
    setShowForm(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token || !form.sectorId) return;
    setSubmitting(true);
    try {
      const payload = {
        code: form.code,
        name: form.name,
        sectorId: form.sectorId,
        location: form.location,
        criticality: Number(form.criticality),
        preventivePeriodicityDays: form.preventivePeriodicityDays
          ? Number(form.preventivePeriodicityDays)
          : undefined,
      };
      if (editing) {
        await assetsApi.updateAsset(token, editing.id, payload);
        showSuccess("Ativo atualizado.");
      } else {
        await assetsApi.createAsset(token, payload);
        showSuccess("Ativo criado.");
      }
      setShowForm(false);
      reload();
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(asset: Asset) {
    if (!token) return;
    if (!confirm(`Remover o ativo ${asset.code}?`)) return;
    try {
      await assetsApi.deleteAsset(token, asset.id);
      showSuccess("Ativo removido.");
      reload();
    } catch (err) {
      showError(getErrorMessage(err));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Ativos</h1>
          <p className="text-sm text-slate-500">Cadastro de equipamentos e instalações.</p>
        </div>
        <Button onClick={openCreate}>Novo ativo</Button>
      </div>

      {loading && <p className="text-sm text-slate-500">Carregando…</p>}

      {!loading && assets.length === 0 && <EmptyState title="Nenhum ativo cadastrado" />}

      {!loading && assets.length > 0 && (
        <Table
          rows={assets}
          rowKey={(a) => a.id}
          columns={[
            { header: "Código", cell: (a) => a.code },
            { header: "Nome", cell: (a) => a.name },
            { header: "Setor", cell: (a) => a.sector?.name ?? "—" },
            { header: "Local", cell: (a) => a.location },
            { header: "Criticidade", cell: (a) => a.criticality },
            {
              header: "Ações",
              isActions: true,
              cell: (a) => (
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => openEdit(a)}>
                    Editar
                  </Button>
                  <Button variant="danger" onClick={() => handleDelete(a)}>
                    Remover
                  </Button>
                </div>
              ),
            },
          ]}
        />
      )}

      {showForm && (
        <Modal title={editing ? "Editar ativo" : "Novo ativo"} onClose={() => setShowForm(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="Código" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
            <Input label="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <SearchableSelect
              label="Setor"
              value={form.sectorId}
              onChange={(sectorId) => setForm({ ...form, sectorId })}
              options={sectors.map((sector) => ({ value: sector.id, label: sector.name }))}
              placeholder={loadingSectors ? "Carregando setores..." : "Selecione um setor"}
              disabled={loadingSectors}
              required
            />
            <Input
              label="Localização"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              required
            />
            <Input
              label="Criticidade (1–5)"
              type="number"
              min={1}
              max={5}
              value={form.criticality}
              onChange={(e) => setForm({ ...form, criticality: Number(e.target.value) })}
              required
            />
            <Input
              label="Periodicidade preventiva em dias (opcional)"
              type="number"
              min={1}
              value={form.preventivePeriodicityDays}
              onChange={(e) => setForm({ ...form, preventivePeriodicityDays: e.target.value })}
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
