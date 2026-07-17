import { ApiError } from "../api/client";

export function getErrorMessage(err: unknown, fallback = "Ocorreu um erro inesperado."): string {
  if (err instanceof ApiError) {
    return err.message;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return fallback;
}
