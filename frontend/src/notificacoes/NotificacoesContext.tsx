import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import * as workOrdersApi from "../api/workorders";
import { Role, WorkOrderStatus } from "../domain/enums";

export type NotificacaoTipo = "OS_VALIDACAO";

export interface Notificacao {
  id: string;
  tipo: NotificacaoTipo;
  titulo: string;
  descricao: string;
  link: string;
  timestamp: string;
}

interface NotificacoesContextValue {
  items: Notificacao[];
  count: number;
  refetch: () => void;
}

const NotificacoesContext = createContext<NotificacoesContextValue | undefined>(undefined);

// Dedupe do refetch automático disparado por foco de aba: evita rajada de
// chamadas em alt-tab repetido. Chamadas explícitas de `refetch()` (clique no
// sino, mutação de OS) ignoram este limite — usuário pediu, busca na hora.
const FOCUS_REFETCH_STALE_MS = 60000;

// Polling condicionado a atividade humana recente — o inverso da regra do
// kiosk do board de login. Supervisor ativo é avisado em até 5 min; supervisor
// que foi embora e deixou a aba aberta para de consultar após 10 min parado,
// permitindo o banco dormir.
export const NOTIFICACOES_POLL_INTERVAL_MS = 300_000; // 5 min
export const NOTIFICACOES_ACTIVITY_TIMEOUT_MS = 600_000; // 10 min

// Cadência de reavaliação de "houve atividade recente?" — só compara
// timestamps locais, não toca a API.
const ACTIVITY_CHECK_INTERVAL_MS = 60_000;

// Eventos que contam como atividade humana. Registrados como listeners
// passivos que só atualizam um ref (nunca state), para não re-renderizar o
// provider a cada movimento/scroll do usuário.
const ACTIVITY_EVENTS = ["mousedown", "keydown", "touchstart", "scroll"] as const;

export function NotificacoesProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  const [items, setItems] = useState<Notificacao[]>([]);
  const lastFetchAtRef = useRef(0);
  const lastActivityAtRef = useRef(Date.now());
  const [recentlyActive, setRecentlyActive] = useState(true);

  const refetch = useCallback(() => {
    lastFetchAtRef.current = Date.now();

    if (!token || !user) {
      setItems([]);
      return;
    }

    const tarefas: Promise<Notificacao[]>[] = [];

    if (user.role === Role.SUPERVISOR) {
      tarefas.push(
        workOrdersApi
          .listWorkOrders(token, { status: WorkOrderStatus.AGUARDANDO_VALIDACAO })
          .then((paginated) =>
            paginated.items.map((wo) => ({
              id: `OS_VALIDACAO-${wo.id}`,
              tipo: "OS_VALIDACAO" as const,
              titulo: "OS aguardando validação",
              descricao: `${wo.number} — ${wo.title}`,
              link: `/ordens/${wo.id}`,
              timestamp: wo.updatedAt,
            }))
          )
      );
    }

    Promise.allSettled(tarefas).then((resultados) => {
      const agregados: Notificacao[] = [];
      resultados.forEach((resultado) => {
        if (resultado.status === "fulfilled") {
          agregados.push(...resultado.value);
        } else {
          console.warn("Falha ao buscar notificações:", resultado.reason);
        }
      });
      agregados.sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));
      setItems(agregados);
    });
  }, [token, user]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastFetchAtRef.current < FOCUS_REFETCH_STALE_MS) return;
      refetch();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [refetch]);

  // Só atualiza um ref — nunca dispara render nem refetch por si só.
  useEffect(() => {
    function registerActivity() {
      lastActivityAtRef.current = Date.now();
    }
    ACTIVITY_EVENTS.forEach((evt) => document.addEventListener(evt, registerActivity, { passive: true }));
    return () => {
      ACTIVITY_EVENTS.forEach((evt) => document.removeEventListener(evt, registerActivity));
    };
  }, []);

  // Reavalia periodicamente se houve atividade humana nos últimos 10 min —
  // é o que religa/desliga o polling abaixo. Não toca a API.
  useEffect(() => {
    const check = setInterval(() => {
      setRecentlyActive(Date.now() - lastActivityAtRef.current < NOTIFICACOES_ACTIVITY_TIMEOUT_MS);
    }, ACTIVITY_CHECK_INTERVAL_MS);
    return () => clearInterval(check);
  }, []);

  // Busca no mount (recentlyActive começa true) e a cada 5 min enquanto houver
  // atividade recente. Ao ficar 10 min sem interação, o interval é limpo de
  // verdade (clearInterval); nova interação religa e refaz a busca na hora.
  useEffect(() => {
    if (!recentlyActive) return;
    refetch();
    const interval = setInterval(refetch, NOTIFICACOES_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [recentlyActive, refetch]);

  const count = items.length;
  return (
    <NotificacoesContext.Provider value={{ items, count, refetch }}>
      {children}
    </NotificacoesContext.Provider>
  );
}

export function useNotificacoes() {
  const context = useContext(NotificacoesContext);
  if (!context) {
    throw new Error("useNotificacoes deve ser usado dentro de um NotificacoesProvider.");
  }
  return context;
}
