import { apiRequest } from "./client";
import { AuthUser } from "../auth/AuthContext";

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export function login(email: string, password: string) {
  return apiRequest<LoginResponse>("/auth/login", {
    method: "POST",
    body: { email, password },
  });
}

export function fetchMe(token: string) {
  return apiRequest<AuthUser>("/auth/me", { token });
}
