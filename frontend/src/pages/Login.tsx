import { FormEvent, useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../api/client";
import { getPublicOpenWorkOrders, PublicOpenWorkOrder } from "../api/publicWorkorders";
import { Badge } from "../components/Badge";
import { Card } from "../components/Card";
import { PRIORITY_COLORS, PRIORITY_LABELS } from "../domain/labels";
import { formatDateTime } from "../lib/format";

const POLL_INTERVAL_MS = 30000;

function NovasSolicitacoesBoard() {
  const [items, setItems] = useState<PublicOpenWorkOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await getPublicOpenWorkOrders();
        if (!cancelled) setItems(data);
      } catch {
        // Quadro público: falha silenciosa, mantém a última lista carregada.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="w-full max-w-md">
      <h2 className="mb-1 text-lg font-semibold text-slate-900">Novas solicitações</h2>
      <p className="mb-4 text-sm text-slate-500">Ordens de serviço em aberto</p>

      {loading ? (
        <p className="text-sm text-slate-500">Carregando…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhuma solicitação em aberto.</p>
      ) : (
        <div className="max-h-[32rem] space-y-3 overflow-y-auto pr-1">
          {items.map((wo) => (
            <Card key={wo.number}>
              <div className="mb-1 flex items-start justify-between gap-2">
                <span className="text-sm font-semibold text-slate-900">{wo.number}</span>
                <Badge color={PRIORITY_COLORS[wo.priority]}>{PRIORITY_LABELS[wo.priority]}</Badge>
              </div>
              <p className="text-sm font-medium text-slate-800">{wo.title}</p>
              <p className="mt-1 line-clamp-2 text-sm text-slate-500">{wo.description}</p>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
                {wo.targetSector && <span>{wo.targetSector.name}</span>}
                <span>{wo.requester.name}</span>
                <span>{formatDateTime(wo.createdAt)}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Login() {
  const { login, token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (token) {
    const from = (location.state as { from?: Location })?.from?.pathname ?? "/";
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível entrar. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center gap-8 bg-slate-100 p-8">
      <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow">
        <h1 className="mb-1 text-xl font-semibold text-slate-900">CMMS</h1>
        <p className="mb-6 text-sm text-slate-500">Gestão de Ordens de Serviço</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              placeholder="supervisor@cmms.local"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
              Senha
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {submitting ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>

      <NovasSolicitacoesBoard />
    </div>
  );
}
