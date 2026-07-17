import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { Role } from "../domain/enums";

export function RequireRole({ roles, children }: { roles: Role[]; children: JSX.Element }) {
  const { user } = useAuth();

  if (!user || !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
