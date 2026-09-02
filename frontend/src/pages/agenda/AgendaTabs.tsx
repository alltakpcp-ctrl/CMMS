import { NavLink } from "react-router-dom";

const TABS = [
  { to: "/agenda", label: "Preventivas", end: true },
  { to: "/agenda/programacao", label: "Programação (OS)", end: false },
];

export function AgendaTabs() {
  return (
    <div className="flex gap-1 border-b border-slate-200">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            `border-b-2 px-3 py-2 text-sm font-medium ${
              isActive ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"
            }`
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </div>
  );
}
