import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { usePendencias } from "../pendencias/PendenciasContext";
import * as ptApi from "../api/permissaoTrabalho";
import { AssinaturaPendente } from "../api/permissaoTrabalho";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { formatDateTime } from "../lib/format";
import { getErrorMessage } from "../lib/errors";
import { useToast } from "../components/ToastProvider";

export default function AssinaturasPendentes() {
  const { token } = useAuth();
  const { refetch } = usePendencias();
  const { showError, showSuccess } = useToast();
  const navigate = useNavigate();

  const [items, setItems] = useState<AssinaturaPendente[]>([]);
  const [loading, setLoading] = useState(true);
  const [assinandoId, setAssinandoId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    ptApi
      .listarMinhasPendencias(token)
      .then(setItems)
      .catch((err) => showError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [token, showError]);

  async function handleAssinar(item: AssinaturaPendente) {
    if (!token) return;
    setAssinandoId(item.id);
    try {
      await ptApi.assinar(token, item.id);
      setItems((current) => current.filter((i) => i.id !== item.id));
      refetch();
      showSuccess("Assinatura registrada.");
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setAssinandoId(null);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Carregando…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Assinaturas Pendentes</h1>
        <p className="text-sm text-slate-500">Permissões de trabalho aguardando sua assinatura.</p>
      </div>

      {items.length === 0 && (
        <EmptyState title="Nenhuma assinatura pendente." />
      )}

      {items.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <Card key={item.id} className="cursor-pointer hover:border-slate-400">
              <div onClick={() => navigate(`/ordens/${item.permissaoTrabalho.workOrder.id}`)}>
                <div className="mb-1 font-medium text-slate-900">
                  {item.permissaoTrabalho.workOrder.number}
                </div>
                <p className="text-xs text-slate-600">
                  <span className="font-medium">Título:</span> {item.permissaoTrabalho.workOrder.title}
                </p>
                <p className="mt-1 text-xs text-slate-500">Solicitada em {formatDateTime(item.requestedAt)}</p>
              </div>
              <div className="mt-3">
                <Button
                  type="button"
                  disabled={assinandoId === item.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAssinar(item);
                  }}
                >
                  {assinandoId === item.id ? "Assinando…" : "Assinar"}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
