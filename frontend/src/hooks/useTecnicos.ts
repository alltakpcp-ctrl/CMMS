import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import * as usersApi from "../api/users";
import { PublicUser } from "../types";
import { getErrorMessage } from "../lib/errors";

// Lista de TECNICO ativo para popular seleção de manutentores de apoio
// (planejamento/iniciar). excludeUserId tipicamente omite o responsável
// principal da OS (já coberto separadamente) ou o próprio usuário logado.
export function useTecnicos(excludeUserId?: string) {
  const { token } = useAuth();
  const [tecnicos, setTecnicos] = useState<PublicUser[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    usersApi
      .listTecnicos(token, excludeUserId)
      .then(setTecnicos)
      .catch((err) => setError(getErrorMessage(err)));
  }, [token, excludeUserId]);

  return { tecnicos, error };
}
