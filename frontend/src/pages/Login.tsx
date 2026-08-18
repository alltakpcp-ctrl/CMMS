import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../api/client";
import { getPublicWorkOrdersBoard, PublicOpenWorkOrder, PublicWorkOrdersBoard } from "../api/publicWorkorders";
import { Badge } from "../components/Badge";
import { Priority } from "../domain/enums";
import { DISCIPLINA_LABELS, PRIORITY_COLORS, PRIORITY_LABELS } from "../domain/labels";
import { formatDateTime } from "../lib/format";

const EMPTY_BOARD: PublicWorkOrdersBoard = { abertas: [], programadas: [] };

// Board público exibido no kiosk do chão de fábrica (tela de login, sem
// autenticação). Só faz sentido atualizar sozinho durante o expediente —
// fora dessa janela o setInterval de polling é desligado (clearInterval),
// não apenas ignorado, para não manter o backend/Neon acordado à toa.
export const BOARD_SCHEDULE = {
  diasUteis: [1, 2, 3, 4, 5], // Date#getDay(): 0=domingo ... 6=sábado
  horaInicio: 5,
  horaFim: 19,
  intervaloMs: 60_000,
};

// Dedupe do disparo imediato quando `active` vira true (retorno de foco ou
// entrada na janela): se já houve uma busca bem-sucedida há menos disso, o
// setInterval seguinte cuida — evita rajada em alt-tab repetido. Não se aplica
// ao botão "Atualizar agora" (ação explícita do usuário).
const FOCUS_DEDUPE_MS = 60_000;

function isWithinBoardWindow(date: Date): boolean {
  const dia = date.getDay();
  const hora = date.getHours();
  return (
    (BOARD_SCHEDULE.diasUteis as number[]).includes(dia) &&
    hora >= BOARD_SCHEDULE.horaInicio &&
    hora < BOARD_SCHEDULE.horaFim
  );
}

const pad = (h: number) => String(h).padStart(2, "0");
// "seg–sex" é texto fixo, não derivado de `diasUteis` — se a lista de dias
// úteis mudar, ajuste este rótulo junto.
const BOARD_WINDOW_LABEL = `seg–sex, ${pad(BOARD_SCHEDULE.horaInicio)}:00–${pad(BOARD_SCHEDULE.horaFim)}:00`;

const PRIORITY_BG: Record<Priority, string> = {
  BAIXA: "#e0f2fe", // sky-100 (azul bebê)
  MEDIA: "#fef9c3", // yellow-100 (amarelo)
  ALTA: "#ffedd5", // orange-100 (laranja)
  URGENTE: "#fee2e2", // red-100 (vermelho)
};

function WorkOrderCard({ wo, showSchedule }: { wo: PublicOpenWorkOrder; showSchedule?: boolean }) {
  return (
    <div
      className="rounded-xl border border-white/40 p-4 shadow-md backdrop-blur-sm"
      style={{ backgroundColor: PRIORITY_BG[wo.priority] }}
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <span className="text-sm font-semibold text-slate-900">{wo.number}</span>
        <Badge color={PRIORITY_COLORS[wo.priority]}>{PRIORITY_LABELS[wo.priority]}</Badge>
      </div>
      <div className="mt-2 space-y-0.5 text-xs text-slate-600">
        <p>
          <span className="font-medium">Ativo:</span> {wo.asset.name}
        </p>
        <p>
          <span className="font-medium">Disciplina:</span> {DISCIPLINA_LABELS[wo.disciplina]}
        </p>
        <p>
          <span className="font-medium">Título:</span> {wo.title}
        </p>
        <p>
          <span className="font-medium">Solicitante:</span> {wo.requester.name}
        </p>
        <p>
          <span className="font-medium">Técnico:</span> {wo.assignedTo?.name ?? "Não designado"}
        </p>
        {showSchedule ? (
          <>
            <p className="text-slate-500">Início: {wo.scheduledStart ? formatDateTime(wo.scheduledStart) : "—"}</p>
            <p className="text-slate-500">Fim: {wo.scheduledEnd ? formatDateTime(wo.scheduledEnd) : "—"}</p>
          </>
        ) : (
          <p className="text-slate-500">{formatDateTime(wo.createdAt)}</p>
        )}
      </div>
    </div>
  );
}

function BoardColumn({
  title,
  subtitle,
  items,
  loading,
  emptyLabel,
  showSchedule,
}: {
  title: string;
  subtitle: string;
  items: PublicOpenWorkOrder[];
  loading: boolean;
  emptyLabel: string;
  showSchedule?: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <h2 className="mb-1 flex items-baseline gap-2 text-2xl font-bold text-white drop-shadow">
        {title}
        <span className="text-base font-semibold text-white/70">({items.length})</span>
      </h2>
      <p className="mb-4 text-sm text-white/80">{subtitle}</p>

      {loading ? (
        <p className="text-sm text-white/90">Carregando…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-white/90">{emptyLabel}</p>
      ) : (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {items.map((wo) => (
            <WorkOrderCard key={wo.number} wo={wo} showSchedule={showSchedule} />
          ))}
        </div>
      )}
    </div>
  );
}

function NovasSolicitacoesBoard() {
  const [board, setBoard] = useState<PublicWorkOrdersBoard>(EMPTY_BOARD);
  const [loading, setLoading] = useState(false);
  const [withinWindow, setWithinWindow] = useState(() => isWithinBoardWindow(new Date()));
  const [visible, setVisible] = useState(() => !document.hidden);
  const lastFetchAtRef = useRef(0);

  // Reavalia a janela de horário a cada minuto — é o que faz o board religar
  // sozinho ao cruzar os limites de BOARD_SCHEDULE (ou virar o fim de semana)
  // sem precisar de reload manual. Só recalcula o horário local, não consulta a API.
  useEffect(() => {
    const clock = setInterval(() => setWithinWindow(isWithinBoardWindow(new Date())), 60_000);
    return () => clearInterval(clock);
  }, []);

  useEffect(() => {
    function handleVisibilityChange() {
      setVisible(!document.hidden);
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  const active = withinWindow && visible;

  useEffect(() => {
    if (!active) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const data = await getPublicWorkOrdersBoard();
        if (!cancelled) {
          setBoard(data);
          lastFetchAtRef.current = Date.now();
        }
      } catch {
        // Quadro público: falha silenciosa, mantém a última lista carregada.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (Date.now() - lastFetchAtRef.current >= FOCUS_DEDUPE_MS) {
      load();
    }
    const interval = setInterval(load, BOARD_SCHEDULE.intervaloMs);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [active]);

  const handleForceRefresh = useCallback(() => {
    setLoading(true);
    getPublicWorkOrdersBoard()
      .then((data) => {
        setBoard(data);
        lastFetchAtRef.current = Date.now();
      })
      .catch(() => {
        // Quadro público: falha silenciosa, mantém a última lista carregada.
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex h-full w-full flex-col">
      {!withinWindow && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-white/20 bg-black/30 px-4 py-2 text-sm text-white/80">
          <span>Atualização pausada fora do expediente ({BOARD_WINDOW_LABEL}).</span>
          <button
            type="button"
            onClick={handleForceRefresh}
            className="shrink-0 rounded-md border border-white/30 px-3 py-1 text-xs font-semibold text-white transition hover:bg-white/10"
          >
            Atualizar agora
          </button>
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col gap-6 sm:flex-row">
        <BoardColumn
          title="Novas OS"
          subtitle="Ordens de serviço em aberto"
          items={board.abertas}
          loading={loading}
          emptyLabel="Nenhuma solicitação em aberto."
        />
        <BoardColumn
          title="OS Programadas"
          subtitle="Ordenadas por prioridade"
          items={board.programadas}
          loading={loading}
          emptyLabel="Nenhuma OS programada."
          showSchedule
        />
      </div>
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

      <div className="relative z-10 flex h-screen flex-col gap-8 overflow-hidden px-6 py-8 md:flex-row md:items-stretch md:justify-between md:px-12 lg:px-20">
        {/* Board à esquerda, sobre a imagem */}
        <div className="order-2 flex min-h-0 flex-1 flex-col overflow-hidden md:order-1 md:max-w-4xl md:py-4">
          <NovasSolicitacoesBoard />
        </div>

        {/* Card de login glass sobre a caveira, à direita */}
        <div className="order-1 flex items-center justify-center md:order-2 md:w-[380px] md:shrink-0 md:justify-end md:self-center">
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
