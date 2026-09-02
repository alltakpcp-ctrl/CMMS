import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import * as maintenancePlansApi from "../api/maintenancePlans";
import * as assetsApi from "../api/assets";
import { Asset, MaintenancePlan } from "../types";
import { MaintenanceDiscipline, MaintenancePeriodicity, Priority } from "../domain/enums";
import { MAINTENANCE_DISCIPLINE_LABELS, MAINTENANCE_PERIODICITY_LABELS, PRIORITY_LABELS } from "../domain/labels";
import { Modal } from "../components/Modal";
import { Input } from "../components/Input";
import { Textarea } from "../components/Textarea";
import { Select } from "../components/Select";
import { SearchableSelect } from "../components/SearchableSelect";
import { Button } from "../components/Button";
import { getErrorMessage } from "../lib/errors";
import { useToast } from "../components/ToastProvider";

interface MaintenancePlanModalProps {
  planId?: string;
  onClose: () => void;
  onSaved: () => void;
}

interface FormState {
  assetId: string;
  discipline: MaintenanceDiscipline;
  title: string;
  description: string;
  priority: Priority;
  periodicity: MaintenancePeriodicity;
  estimatedMinutes: string;
  responsible: string;
  action01: string;
  action02: string;
  action03: string;
  action04: string;
  action05: string;
  action06: string;
  active: boolean;
}

const emptyForm: FormState = {
  assetId: "",
  discipline: MaintenanceDiscipline.MECANICA,
  title: "",
  description: "",
  priority: Priority.MEDIA,
  periodicity: MaintenancePeriodicity.MENSAL,
  estimatedMinutes: "",
  responsible: "",
  action01: "",
  action02: "",
  action03: "",
  action04: "",
  action05: "",
  action06: "",
  active: true,
};

function planToForm(plan: MaintenancePlan): FormState {
  return {
    assetId: plan.assetId,
    discipline: plan.discipline,
    title: plan.title,
    description: plan.description ?? "",
    priority: plan.priority,
    periodicity: plan.periodicity,
    estimatedMinutes: plan.estimatedMinutes?.toString() ?? "",
    responsible: plan.responsible ?? "",
    action01: plan.action01 ?? "",
    action02: plan.action02 ?? "",
    action03: plan.action03 ?? "",
    action04: plan.action04 ?? "",
    action05: plan.action05 ?? "",
    action06: plan.action06 ?? "",
    active: plan.active,
  };
}

export function MaintenancePlanModal({ planId, onClose, onSaved }: MaintenancePlanModalProps) {
  const { token } = useAuth();
  const { showError, showSuccess } = useToast();

  const [assets, setAssets] = useState<Asset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [loadingPlan, setLoadingPlan] = useState(!!planId);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!token) return;
    assetsApi
      .listAssets(token)
      .then(setAssets)
      .catch((err) => showError(getErrorMessage(err)))
      .finally(() => setLoadingAssets(false));
  }, [token, showError]);

  useEffect(() => {
    if (!token || !planId) return;
    setLoadingPlan(true);
    maintenancePlansApi
      .getMaintenancePlan(token, planId)
      .then((plan) => setForm(planToForm(plan)))
      .catch((err) => showError(getErrorMessage(err)))
      .finally(() => setLoadingPlan(false));
  }, [token, planId, showError]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSubmitting(true);
    try {
      const payload = {
        assetId: form.assetId,
        discipline: form.discipline,
        title: form.title,
        description: form.description || undefined,
        priority: form.priority,
        periodicity: form.periodicity,
        estimatedMinutes: form.estimatedMinutes ? Number(form.estimatedMinutes) : undefined,
        responsible: form.responsible || undefined,
        action01: form.action01 || undefined,
        action02: form.action02 || undefined,
        action03: form.action03 || undefined,
        action04: form.action04 || undefined,
        action05: form.action05 || undefined,
        action06: form.action06 || undefined,
      };
      if (planId) {
        await maintenancePlansApi.updateMaintenancePlan(token, planId, { ...payload, active: form.active });
        showSuccess("Plano de manutenção atualizado.");
      } else {
        await maintenancePlansApi.createMaintenancePlan(token, payload);
        showSuccess("Plano de manutenção criado.");
      }
      onSaved();
      onClose();
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!token || !planId) return;
    if (!window.confirm("Excluir este plano de manutenção?")) return;
    setDeleting(true);
    try {
      await maintenancePlansApi.deleteMaintenancePlan(token, planId);
      showSuccess("Plano de manutenção excluído.");
      onSaved();
      onClose();
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  }

  const assetOptions = assets.map((asset) => ({ value: asset.id, label: `${asset.code} — ${asset.name}` }));

  return (
    <Modal title={planId ? "Editar plano de manutenção" : "Novo plano de manutenção"} onClose={onClose}>
      {loadingPlan ? (
        <p className="text-sm text-slate-500">Carregando…</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <SearchableSelect
            label="Ativo"
            value={form.assetId}
            onChange={(assetId) => setForm({ ...form, assetId })}
            options={assetOptions}
            placeholder={loadingAssets ? "Carregando ativos..." : "Buscar ativo…"}
            disabled={loadingAssets}
            required
          />

          <Select
            label="Disciplina"
            value={form.discipline}
            onChange={(e) => setForm({ ...form, discipline: e.target.value as MaintenanceDiscipline })}
            required
          >
            {Object.values(MaintenanceDiscipline).map((value) => (
              <option key={value} value={value}>
                {MAINTENANCE_DISCIPLINE_LABELS[value]}
              </option>
            ))}
          </Select>

          <Input
            label="Título"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />

          <Textarea
            label="Descrição (opcional)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />

          <Select
            label="Prioridade"
            value={form.priority}
            onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}
            required
          >
            {Object.values(Priority).map((value) => (
              <option key={value} value={value}>
                {PRIORITY_LABELS[value]}
              </option>
            ))}
          </Select>

          <Select
            label="Periodicidade"
            value={form.periodicity}
            onChange={(e) => setForm({ ...form, periodicity: e.target.value as MaintenancePeriodicity })}
            required
          >
            {Object.values(MaintenancePeriodicity).map((value) => (
              <option key={value} value={value}>
                {MAINTENANCE_PERIODICITY_LABELS[value]}
              </option>
            ))}
          </Select>

          <Input
            label="Tempo estimado (minutos, opcional)"
            type="number"
            min={1}
            value={form.estimatedMinutes}
            onChange={(e) => setForm({ ...form, estimatedMinutes: e.target.value })}
          />

          <Input
            label="Responsável (opcional)"
            value={form.responsible}
            onChange={(e) => setForm({ ...form, responsible: e.target.value })}
          />

          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Ações do checklist (opcionais)</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                label="Ação 01"
                placeholder="Passo do checklist"
                value={form.action01}
                onChange={(e) => setForm({ ...form, action01: e.target.value })}
              />
              <Input
                label="Ação 02"
                placeholder="Passo do checklist"
                value={form.action02}
                onChange={(e) => setForm({ ...form, action02: e.target.value })}
              />
              <Input
                label="Ação 03"
                placeholder="Passo do checklist"
                value={form.action03}
                onChange={(e) => setForm({ ...form, action03: e.target.value })}
              />
              <Input
                label="Ação 04"
                placeholder="Passo do checklist"
                value={form.action04}
                onChange={(e) => setForm({ ...form, action04: e.target.value })}
              />
              <Input
                label="Ação 05"
                placeholder="Passo do checklist"
                value={form.action05}
                onChange={(e) => setForm({ ...form, action05: e.target.value })}
              />
              <Input
                label="Ação 06"
                placeholder="Passo do checklist"
                value={form.action06}
                onChange={(e) => setForm({ ...form, action06: e.target.value })}
              />
            </div>
          </div>

          {planId && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />
              Ativo
            </label>
          )}

          <div className="flex items-center justify-between gap-2 pt-2">
            <div>
              {planId && (
                <Button type="button" variant="danger" onClick={handleDelete} disabled={deleting || submitting}>
                  {deleting ? "Excluindo…" : "Excluir"}
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={onClose} disabled={submitting || deleting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting || deleting}>
                {submitting ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
