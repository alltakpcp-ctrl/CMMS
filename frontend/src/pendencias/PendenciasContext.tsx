import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import * as ptApi from "../api/permissaoTrabalho";

interface PendenciasContextValue {
  count: number;
  refetch: () => void;
}

const PendenciasContext = createContext<PendenciasContextValue | undefined>(undefined);

export function PendenciasProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  const [count, setCount] = useState(0);

  const refetch = useCallback(() => {
    if (!token || !user) {
      setCount(0);
      return;
    }
    ptApi
      .listarMinhasPendencias(token)
      .then((items) => setCount(items.length))
      .catch((err) => console.warn("Falha ao buscar assinaturas pendentes:", err));
  }, [token, user]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return <PendenciasContext.Provider value={{ count, refetch }}>{children}</PendenciasContext.Provider>;
}

export function usePendencias() {
  const context = useContext(PendenciasContext);
  if (!context) {
    throw new Error("usePendencias deve ser usado dentro de um PendenciasProvider.");
  }
  return context;
}
