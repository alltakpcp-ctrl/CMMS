import { TechnicianEfficiency } from "../../api/indicators";
import { TYPE_LABELS } from "../../domain/labels";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { formatHours, formatPercentage } from "../../lib/format";

interface Props {
  technicians: TechnicianEfficiency[];
}

// Cores por TIPO de OS (não por status) — paleta local a este painel, distinta
// de STATUS_COLORS/STATUS_DONUT_COLORS da tela pai. Fixas para manter a mesma
// cor por tipo em todos os cards (cor segue a entidade, não o ranking do
// técnico — ver skill de dataviz). Data-driven: só os tipos presentes no
// typeMix de cada técnico são renderizados.
const TYPE_COLORS: Record<string, string> = {
  CORRETIVA: "#eb6834",
  PREVENTIVA: "#1baf7a",
  PREDITIVA: "#2a78d6",
  MELHORIA: "#7c5cbf",
};
const TYPE_FALLBACK_COLOR = "#c3c2b7";

function typeLabel(type: string): string {
  return (TYPE_LABELS as Record<string, string>)[type] ?? type;
}

function typeColor(type: string): string {
  return TYPE_COLORS[type] ?? TYPE_FALLBACK_COLOR;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function TechnicianEfficiencyPanel({ technicians }: Props) {
  if (technicians.length === 0) {
    return (
      <EmptyState
        title="Sem dados de técnicos no período"
        description="Nenhum técnico com OS no período/setor filtrado ou com carga em aberto."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {technicians.map((tech) => {
        const mixTotal = tech.typeMix.reduce((sum, item) => sum + item.count, 0);
        return (
          <Card key={tech.technicianId}>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-700 text-sm font-semibold text-white">
                {initials(tech.technicianName || "—")}
              </div>
              <p className="truncate font-medium text-slate-900">{tech.technicianName || "—"}</p>
            </div>

            <div className="mt-4 space-y-1.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Encerradas</span>
                <span className="tabular-nums font-medium text-slate-900">{tech.closedCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Em andamento</span>
                <span
                  className={`tabular-nums font-medium ${
                    tech.inProgressCount > 0 ? "text-amber-700" : "text-slate-900"
                  }`}
                >
                  {tech.inProgressCount}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">MTTR</span>
                <span className="tabular-nums font-medium text-slate-900">{formatHours(tech.mttrHours)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Aderência</span>
                <span className="tabular-nums font-medium text-slate-900">
                  {formatPercentage(tech.adherencePercentage)}
                </span>
              </div>
            </div>

            <div className="mt-4 space-y-1.5 text-sm">
              <p className="mb-1 text-xs font-medium uppercase text-slate-500">Participação</p>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Como principal</span>
                <span className="tabular-nums font-medium text-slate-900">
                  {tech.asPrincipalCount} OS · {formatHours(tech.mttrAsPrincipalHours)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Como apoio</span>
                <span className="tabular-nums font-medium text-slate-900">
                  {tech.asApoioCount} OS · {formatHours(tech.mttrAsApoioHours)}
                </span>
              </div>
            </div>

            <div className="mt-4">
              <p className="mb-1.5 text-xs font-medium uppercase text-slate-500">Mix de OS</p>
              {mixTotal > 0 ? (
                <>
                  <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                    {tech.typeMix.map((item) => (
                      <div
                        key={item.type}
                        title={`${typeLabel(item.type)}: ${item.count}`}
                        style={{ width: `${(item.count / mixTotal) * 100}%`, backgroundColor: typeColor(item.type) }}
                      />
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
                    {tech.typeMix.map((item) => (
                      <div key={item.type} className="flex items-center gap-1">
                        <span
                          className="inline-block h-2 w-2 rounded-sm"
                          style={{ backgroundColor: typeColor(item.type) }}
                        />
                        <span>
                          {typeLabel(item.type)} ({item.count})
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-xs text-slate-400">Sem OS no período</p>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
