import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import * as ptApi from "../api/permissaoTrabalho";
import * as workOrdersApi from "../api/workorders";
import { Role, WorkOrderStatus } from "../domain/enums";

const POLL_INTERVAL_MS = 60000;

export type NotificacaoTipo = "ASSINATURA" | "PT_APROVACAO" | "OS_VALIDACAO";

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
  countAssinaturas: number;
  refetch: () => void;
}

const NotificacoesContext = createContext<NotificacoesContextValue | undefined>(undefined);

export function NotificacoesProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  const [items, setItems] = useState<Notificacao[]>([]);

  const refetch = useCallback(() => {
    if (!token || !user) {
      setItems([]);
      return;
    }

    const tarefas: Promise<Notificacao[]>[] = [
      ptApi.listarMinhasPendencias(token).then((pendencias) =>
        pendencias.map((item) => ({
          id: `ASSINATURA-${item.id}`,
          tipo: "ASSINATURA" as const,
          titulo: "Assinatura pendente",
          descricao: `${item.permissaoTrabalho.workOrder.number} — ${item.permissaoTrabalho.workOrder.title}`,
          link: "/assinaturas-pendentes",
          timestamp: item.requestedAt,
        }))
      ),
    ];

    if (user.role === Role.SEGURANCA) {
      tarefas.push(
        ptApi.listarAguardandoAprovacao(token).then((pendencias) =>
          pendencias.map((item) => ({
            id: `PT_APROVACAO-${item.id}`,
            tipo: "PT_APROVACAO" as const,
            titulo: "PT aguardando aprovação",
            descricao: `${item.workOrder.number} — ${item.workOrder.title}`,
            link: `/ordens/${item.workOrder.id}`,
            // O endpoint não retorna timestamp (só ordena por updatedAt internamente) — usa data atual como fallback.
            timestamp: new Date().toISOString(),
          }))
        )
      );
    }

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
    refetch();
    const interval = setInterval(refetch, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refetch]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") refetch();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [refetch]);

  const count = items.length;
  const countAssinaturas = items.filter((item) => item.tipo === "ASSINATURA").length;

  return (
    <NotificacoesContext.Provider value={{ items, count, countAssinaturas, refetch }}>
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
