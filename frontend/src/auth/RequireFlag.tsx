import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { AuthUser } from "./AuthContext";

type BooleanFlagKey = { [K in keyof AuthUser]: AuthUser[K] extends boolean ? K : never }[keyof AuthUser];

export function RequireFlag({ flag, children }: { flag: BooleanFlagKey; children: JSX.Element }) {
  const { user } = useAuth();

  if (!user || !user[flag]) {
    return <Navigate to="/" replace />;
  }

  return children;
}
