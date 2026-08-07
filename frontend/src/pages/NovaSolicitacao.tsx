import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Disciplina, Priority, Role, WorkOrderType } from "../domain/enums";
import { DISCIPLINA_LABELS, PRIORITY_LABELS, TYPE_LABELS } from "../domain/labels";
import * as assetsApi from "../api/assets";
import * as workOrdersApi from "../api/workorders";
import { Asset } from "../types";
import { Card } from "../components/Card";
import { Input } from "../components/Input";
import { Select } from "../components/Select";
import { SearchableSelect } from "../components/SearchableSelect";
import { Textarea } from "../components/Textarea";
import { Checkbox } from "../components/Checkbox";
import { Button } from "../components/Button";
import { getErrorMessage } from "../lib/errors";
import { useToast } from "../components/ToastProvider";

export default function NovaSolicitacao() {
  const { token, user } = useAuth();
  const { showError, showSuccess } = useToast();
  const navigate = useNavigate();

  const isOperadorSemSetor = user?.role === Role.OPERADOR && !user.sectorId;

  const [assets, setAssets] = useState<Asset[]>([]);
  const [type, setType] = useState<WorkOrderType>(WorkOrderType.CORRETIVA);
  const [disciplina, setDisciplina] = useState<Disciplina>(Disciplina.ELETRICA);
  const [priority, setPriority] = useState<Priority>(Priority.MEDIA);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assetId, setAssetId] = useState("");
  const [trabalhoEmAltura, setTrabalhoEmAltura] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createdNumber, setCreatedNumber] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    assetsApi
      .listAssets(token)
      .then(setAssets)
      .catch((err) => showError(getErrorMessage(err)));
  }, [token, showError]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setCreatedNumber(null);
    try {
      const workOrder = await workOrdersApi.createWorkOrder(token, {
        type,
        disciplina,
        priority,
        title,
        description,
        assetId,
        trabalhoEmAltura,
      });
      setCreatedNumber(workOrder.number);
      showSuccess(`Solicitação ${workOrder.number} aberta com sucesso.`);
      setTitle("");
      setDescription("");
      setAssetId("");
      setTrabalhoEmAltura(false);
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Nova solicitação</h1>
        <p className="text-sm text-slate-500">Abra uma solicitação de manutenção (Etapa 1).</p>
      </div>

      {createdNumber && (
        <Card className="border-green-200 bg-green-50">
          <p className="text-sm text-green-800">
            Solicitação criada com o número <span className="font-semibold">{createdNumber}</span>.
          </p>
        </Card>
      )}

      {isOperadorSemSetor && (
        <Card className="border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-800">
            Seu usuário não tem um setor atrelado. Fale com o supervisor para configurar seu setor antes de abrir
            solicitações.
          </p>
        </Card>
      )}

      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Select label="Tipo" value={type} onChange={(e) => setType(e.target.value as WorkOrderType)} required>
            {Object.values(WorkOrderType).map((value) => (
              <option key={value} value={value}>
                {TYPE_LABELS[value]}
              </option>
            ))}
          </Select>

          <Select
            label="Disciplina"
            value={disciplina}
            onChange={(e) => setDisciplina(e.target.value as Disciplina)}
            required
          >
            {Object.values(Disciplina).map((value) => (
              <option key={value} value={value}>
                {DISCIPLINA_LABELS[value]}
              </option>
            ))}
          </Select>

          <Select
            label="Prioridade"
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            required
          >
            {Object.values(Priority).map((value) => (
              <option key={value} value={value}>
                {PRIORITY_LABELS[value]}
              </option>
            ))}
          </Select>

          <Input label="Título" value={title} onChange={(e) => setTitle(e.target.value)} required />

          <Textarea
            label="Descrição"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descreva o problema ou serviço solicitado."
            required
          />

          <Checkbox
            label="Trabalho em altura (exige Permissão de Trabalho)"
            checked={trabalhoEmAltura}
            onChange={(e) => setTrabalhoEmAltura(e.target.checked)}
          />

          <SearchableSelect
            label="Ativo"
            value={assetId}
            onChange={setAssetId}
            options={assets.map((asset) => ({ value: asset.id, label: `${asset.code} — ${asset.name}` }))}
            placeholder="Selecione um ativo"
            required
          />

          <Button type="submit" disabled={submitting || isOperadorSemSetor}>
            {submitting ? "Enviando…" : "Abrir solicitação"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
