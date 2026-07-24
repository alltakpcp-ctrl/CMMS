import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { AuthUser, useAuth } from "../auth/AuthContext";
import { Role } from "../domain/enums";
import { ROLE_LABELS } from "../domain/labels";

type BooleanFlagKey = { [K in keyof AuthUser]: AuthUser[K] extends boolean ? K : never }[keyof AuthUser];

interface NavItem {
  to: string;
  label: string;
  roles?: Role[];
  requiresFlag?: BooleanFlagKey;
  end?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/solicitacoes/nova", label: "Nova solicitação", roles: [Role.OPERADOR, Role.SUPERVISOR] },
  { to: "/ordens", label: "Ordens de serviço" },
  { to: "/indicadores", label: "Indicadores", roles: [Role.TECNICO, Role.SUPERVISOR] },
  { to: "/fila", label: "Fila de triagem", roles: [Role.TECNICO, Role.SUPERVISOR] },
  { to: "/agenda", label: "Agenda", roles: [Role.SUPERVISOR] },
  { to: "/minhas-os", label: "Minhas OS", roles: [Role.TECNICO] },
  { to: "/pedidos/montar", label: "Montar Pedido", requiresFlag: "canReceivePartRequests" },
  { to: "/pedidos/revisao", label: "Revisão de Pedidos", roles: [Role.SUPERVISOR] },
  { to: "/cadastros/ativos", label: "Ativos", roles: [Role.SUPERVISOR] },
  { to: "/cadastros/pecas", label: "Peças", roles: [Role.SUPERVISOR] },
  { to: "/cadastros/pecas", label: "Indicar falta", roles: [Role.TECNICO] },
  { to: "/cadastros/usuarios", label: "Usuários", roles: [Role.SUPERVISOR] },
];

export function AppLayout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  const items = NAV_ITEMS.filter((item) => {
    if (item.roles && (!user || !item.roles.includes(user.role))) return false;
    if (item.requiresFlag && !user?.[item.requiresFlag]) return false;
    if (item.to === "/solicitacoes/nova" && user?.role === Role.OPERADOR && !user.sectorId) return false;
    return true;
  });

  useEffect(() => {
    if (open) {
      document.body.classList.add("overflow-hidden");
    } else {
      document.body.classList.remove("overflow-hidden");
    }
    return () => document.body.classList.remove("overflow-hidden");
  }, [open]);

  return (
    <div className="flex min-h-screen bg-slate-100">
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        role="navigation"
        aria-label="Menu principal"
        className={`fixed inset-y-0 left-0 z-40 w-56 shrink-0 border-r border-slate-200 bg-white transition-transform duration-200 ease-in-out lg:static lg:z-auto lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
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
              onClick={() => setOpen(false)}
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
          <button
            onClick={() => setOpen(true)}
            aria-label="Abrir menu"
            className="rounded p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="hidden lg:block" />
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
