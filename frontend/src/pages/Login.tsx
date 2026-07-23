import { FormEvent, useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../api/client";
import { getPublicOpenWorkOrders, PublicOpenWorkOrder } from "../api/publicWorkorders";
import { Badge } from "../components/Badge";
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
    <div className="flex h-full w-full flex-col">
      <h2 className="mb-1 text-2xl font-bold text-white drop-shadow">Novas Solicitações</h2>
      <p className="mb-4 text-sm text-white/80">Ordens de serviço em aberto</p>

      {loading ? (
        <p className="text-sm text-white/90">Carregando…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-white/90">Nenhuma solicitação em aberto.</p>
      ) : (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {items.map((wo) => (
            <div
              key={wo.number}
              className="rounded-xl border border-white/40 bg-white/85 p-4 shadow-md backdrop-blur-sm"
            >
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
            </div>
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
    <div
      className="relative min-h-screen w-full overflow-hidden bg-slate-950 bg-cover bg-center"
      style={{ backgroundImage: "url('/login-bg.png')" }}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/50 to-black/30" />

      <div className="relative z-10 flex min-h-screen flex-col gap-8 px-6 py-8 md:flex-row md:items-stretch md:px-12 lg:px-20">
        {/* Board à esquerda, sobre a imagem */}
        <div className="order-2 flex min-h-0 flex-1 flex-col md:order-1 md:max-w-2xl md:py-4">
          <NovasSolicitacoesBoard />
        </div>

        {/* Card de login glass à direita */}
        <div className="order-1 flex items-center justify-center md:order-2 md:w-[380px] md:shrink-0">
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-white/10 p-8 shadow-2xl backdrop-blur-xl">
            <h1 className="mb-1 text-2xl font-bold text-white">CMMS</h1>
            <p className="mb-6 text-sm text-white/70">Gestão de Ordens de Serviço</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-white/90">
                  E-mail
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-white/20 bg-white/90 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-white focus:bg-white focus:outline-none focus:ring-2 focus:ring-white/40"
                  placeholder="supervisor@cmms.local"
                />
              </div>

              <div>
                <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-white/90">
                  Senha
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-white/20 bg-white/90 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-white focus:bg-white focus:outline-none focus:ring-2 focus:ring-white/40"
                  placeholder="••••••••"
                />
              </div>

              {error && <p className="text-sm text-red-300">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-slate-900/90 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-slate-800 disabled:opacity-50"
              >
                {submitting ? "Entrando…" : "Entrar"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
