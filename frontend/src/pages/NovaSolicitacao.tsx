import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Sector, WorkOrderType } from "../domain/enums";
import { SECTOR_LABELS, TYPE_LABELS } from "../domain/labels";
import * as assetsApi from "../api/assets";
import * as workOrdersApi from "../api/workorders";
import { Asset } from "../types";
import { Card } from "../components/Card";
import { Input } from "../components/Input";
import { Select } from "../components/Select";
import { Textarea } from "../components/Textarea";
import { Button } from "../components/Button";
import { getErrorMessage } from "../lib/errors";
import { useToast } from "../components/ToastProvider";

export default function NovaSolicitacao() {
  const { token } = useAuth();
  const { showError, showSuccess } = useToast();
  const navigate = useNavigate();

  const [assets, setAssets] = useState<Asset[]>([]);
  const [type, setType] = useState<WorkOrderType>(WorkOrderType.CORRETIVA);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assetId, setAssetId] = useState("");
  const [targetSector, setTargetSector] = useState<Sector | "">("");
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
        title,
        description,
        assetId,
        targetSector: targetSector || undefined,
      });
      setCreatedNumber(workOrder.number);
      showSuccess(`Solicitação ${workOrder.number} aberta com sucesso.`);
      setTitle("");
      setDescription("");
      setAssetId("");
      setTargetSector("");
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

      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Select label="Tipo" value={type} onChange={(e) => setType(e.target.value as WorkOrderType)} required>
            {Object.values(WorkOrderType).map((value) => (
              <option key={value} value={value}>
                {TYPE_LABELS[value]}
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

          <Select label="Ativo" value={assetId} onChange={(e) => setAssetId(e.target.value)} required>
            <option value="" disabled>
              Selecione um ativo
            </option>
            {assets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.code} — {asset.name}
              </option>
            ))}
          </Select>

          <Select
            label="Setor destino (opcional)"
            value={targetSector}
            onChange={(e) => setTargetSector(e.target.value as Sector | "")}
          >
            <option value="">Não definido</option>
            {Object.values(Sector).map((value) => (
              <option key={value} value={value}>
                {SECTOR_LABELS[value]}
              </option>
            ))}
          </Select>

          <Button type="submit" disabled={submitting}>
            {submitting ? "Enviando…" : "Abrir solicitação"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
