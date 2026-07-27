import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import * as authApi from "../api/auth";
import { Role } from "../domain/enums";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  sectorId: string | null;
  canReceivePartRequests: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string, lat?: number, lng?: number) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const TOKEN_STORAGE_KEY = "cmms.token";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_STORAGE_KEY));
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    authApi
      .fetchMe(token)
      .then(setUser)
      .catch(() => {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        setToken(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, [token]);

  async function login(email: string, password: string, lat?: number, lng?: number) {
    const result = await authApi.login(email, password, lat, lng);
    localStorage.setItem(TOKEN_STORAGE_KEY, result.token);
    setToken(result.token);
    setUser(result.user);
  }

  function logout() {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth deve ser usado dentro de um AuthProvider.");
  }
  return context;
}
