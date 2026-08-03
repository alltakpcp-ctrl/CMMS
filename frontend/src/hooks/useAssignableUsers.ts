import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import * as usersApi from "../api/users";
import { PublicUser } from "../types";
import { getErrorMessage } from "../lib/errors";

// Lista de TECNICO + SUPERVISOR ativos para popular seleção de responsável ao
// abrir/reatribuir uma subtarefa. excludeUserId tipicamente omite o dono atual.
export function useAssignableUsers(excludeUserId?: string) {
  const { token } = useAuth();
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    usersApi
      .listAssignableForSubtask(token, excludeUserId)
      .then(setUsers)
      .catch((err) => setError(getErrorMessage(err)));
  }, [token, excludeUserId]);

  return { users, error };
}
