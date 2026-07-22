import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Role } from "../domain/enums";
import { ROLE_LABELS } from "../domain/labels";

interface NavItem {
  to: string;
  label: string;
  roles?: Role[];
  end?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/solicitacoes/nova", label: "Nova solicitação", roles: [Role.OPERADOR, Role.SUPERVISOR] },
  { to: "/ordens", label: "Ordens de serviço" },
  { to: "/indicadores", label: "Indicadores" },
  { to: "/fila", label: "Fila de triagem", roles: [Role.TECNICO, Role.SUPERVISOR] },
  { to: "/agenda", label: "Agenda", roles: [Role.SUPERVISOR] },
  { to: "/minhas-os", label: "Minhas OS", roles: [Role.TECNICO] },
  { to: "/cadastros/ativos", label: "Ativos", roles: [Role.SUPERVISOR] },
  { to: "/cadastros/pecas", label: "Peças", roles: [Role.SUPERVISOR] },
  { to: "/cadastros/usuarios", label: "Usuários", roles: [Role.SUPERVISOR] },
];

export function AppLayout() {
  const { user, logout } = useAuth();

  const items = NAV_ITEMS.filter((item) => {
    if (item.roles && (!user || !item.roles.includes(user.role))) return false;
    if (item.to === "/solicitacoes/nova" && user?.role === Role.OPERADOR && !user.sectorId) return false;
    return true;
  });

  return (
    <div className="flex min-h-screen bg-slate-100">
      <aside className="w-56 shrink-0 border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-4">
          <p className="text-lg font-semibold text-slate-900">CMMS</p>
          <p className="text-xs text-slate-500">Gestão de OS</p>
        </div>
        <nav className="flex flex-col gap-0.5 p-2">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `rounded px-3 py-2 text-sm font-medium ${
                  isActive ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex-1">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
          <div />
          <div className="flex items-center gap-4">
            <div className="text-right text-sm">
              <p className="font-medium text-slate-900">{user?.name}</p>
              <p className="text-slate-500">{user ? ROLE_LABELS[user.role] : ""}</p>
            </div>
            <button
              onClick={logout}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              Sair
            </button>
          </div>
        </header>

        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
