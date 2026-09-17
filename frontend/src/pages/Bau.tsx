import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import * as workOrdersApi from "../api/workorders";
import { BauItem } from "../types";
import { TYPE_LABELS } from "../domain/labels";
import { Badge } from "../components/Badge";
import { Table } from "../components/Table";
import { EmptyState } from "../components/EmptyState";
import { formatDateTime } from "../lib/format";
import { getErrorMessage } from "../lib/errors";
import { useToast } from "../components/ToastProvider";

// Baú (Fase 7, §5.2 do CLAUDE.md): OS CANCELADA + excluída, com
// motivo/quem/quando de cada uma — SUPERVISOR-only (guardado também em
// App.tsx via RequireRole). Consome GET /workorders/bau (Fase 5).
export default function Bau() {
  const { token } = useAuth();
  const { showError } = useToast();
  const navigate = useNavigate();

  const [items, setItems] = useState<BauItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    workOrdersApi
      .getBau(token, { pageSize: 100 })
      .then((result) => setItems(result.items))
      .catch((err) => showError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [token, showError]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Baú</h1>
        <p className="text-sm text-slate-500">
          OS canceladas e excluídas — nada aqui foi apagado do banco, só saiu das telas ativas e dos indicadores.
        </p>
      </div>

      {loading && <p className="text-sm text-slate-500">Carregando…</p>}

      {!loading && items.length === 0 && (
        <EmptyState title="Nada no Baú" description="Nenhuma OS cancelada ou excluída até agora." />
      )}

      {!loading && items.length > 0 && (
        <Table
          rows={items}
          rowKey={(wo) => wo.id}
          onRowClick={(wo) => navigate(`/ordens/${wo.id}`)}
          columns={[
            { header: "Número", cell: (wo) => <span className="font-medium text-slate-900">{wo.number}</span> },
            { header: "Título", cell: (wo) => wo.title },
            { header: "Ativo", cell: (wo) => wo.asset.name },
            { header: "Tipo", cell: (wo) => TYPE_LABELS[wo.type] },
            {
              header: "Situação",
              cell: (wo) => (
                <Badge color="red">{wo.bauInfo.kind === "EXCLUIDA" ? "Excluída" : "Cancelada"}</Badge>
              ),
            },
            { header: "Motivo", cell: (wo) => wo.bauInfo.reason ?? "—" },
            { header: "Por", cell: (wo) => wo.bauInfo.by?.name ?? "—" },
            { header: "Quando", cell: (wo) => formatDateTime(wo.bauInfo.at) },
          ]}
        />
      )}
    </div>
  );
}
