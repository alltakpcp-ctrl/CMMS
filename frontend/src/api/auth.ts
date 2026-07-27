import { apiRequest } from "./client";
import { AuthUser } from "../auth/AuthContext";

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export function login(email: string, password: string, lat?: number, lng?: number) {
  return apiRequest<LoginResponse>("/auth/login", {
    method: "POST",
    body: {
      email,
      password,
      ...(lat !== undefined ? { lat } : {}),
      ...(lng !== undefined ? { lng } : {}),
    },
  });
}

export function fetchMe(token: string) {
  return apiRequest<AuthUser>("/auth/me", { token });
}
