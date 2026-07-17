import { Priority, Sector } from "../../domain/enums";
import { PRIORITY_LABELS, SECTOR_LABELS } from "../../domain/labels";
import { BacklogGroup } from "../../api/indicators";

// Ordem categórica fixa (paleta validada — ver skill de dataviz): não ciclar.
const PRIORITY_ORDER: Priority[] = [Priority.BAIXA, Priority.MEDIA, Priority.ALTA, Priority.URGENTE];
const PRIORITY_COLOR: Record<Priority, string> = {
  BAIXA: "#2a78d6", // slot 1 azul
  MEDIA: "#008300", // slot 2 verde
  ALTA: "#e87ba4", // slot 3 magenta
  URGENTE: "#eda100", // slot 4 amarelo
};
const NO_PRIORITY_COLOR = "#c3c2b7"; // cinza neutro — bucket "Sem prioridade", fora da paleta categórica

const SECTOR_ORDER: Sector[] = [Sector.MECANICA, Sector.ELETRICA, Sector.PREDIAL];

interface Props {
  groups: BacklogGroup[];
}

export function BacklogChart({ groups }: Props) {
  const sectorsPresent = [
    ...SECTOR_ORDER.filter((s) => groups.some((g) => g.targetSector === s)),
    ...(groups.some((g) => g.targetSector === null) ? ["SEM_SETOR" as const] : []),
  ];

  if (sectorsPresent.length === 0) {
    return <p className="text-sm text-slate-500">Sem dados de backlog para exibir.</p>;
  }

  const maxCount = Math.max(1, ...groups.map((g) => g.count));

  function countFor(sector: Sector | "SEM_SETOR", priority: Priority | null) {
    return groups.find(
      (g) => (sector === "SEM_SETOR" ? g.targetSector === null : g.targetSector === sector) && g.priority === priority
    )?.count ?? 0;
  }

  const seriesKeys: Array<Priority | null> = [
    ...PRIORITY_ORDER,
    ...(groups.some((g) => g.priority === null) ? [null] : []),
  ];

  return (
    <div>
      {/* legenda */}
      <div className="mb-4 flex flex-wrap gap-3 text-xs text-slate-600">
        {seriesKeys.map((key) => (
          <div key={key ?? "none"} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: key ? PRIORITY_COLOR[key] : NO_PRIORITY_COLOR }}
            />
            {key ? PRIORITY_LABELS[key] : "Sem prioridade"}
          </div>
        ))}
      </div>

      {/* gráfico */}
      <div className="flex items-end gap-8 border-b border-slate-200 pb-1" style={{ height: 180 }}>
        {sectorsPresent.map((sector) => (
          <div key={sector} className="flex h-full flex-1 flex-col justify-end">
            <div className="flex h-full items-end justify-center gap-1">
              {seriesKeys.map((priority) => {
                const count = countFor(sector, priority);
                const heightPct = (count / maxCount) * 100;
                return (
                  <div key={priority ?? "none"} className="flex flex-col items-center justify-end" style={{ height: "100%" }}>
                    {count > 0 && <span className="mb-1 text-xs text-slate-500">{count}</span>}
                    <div
                      title={`${priority ? PRIORITY_LABELS[priority] : "Sem prioridade"}: ${count}`}
                      className="w-4 rounded-t"
                      style={{
                        height: `${Math.max(count > 0 ? 4 : 0, heightPct)}%`,
                        backgroundColor: priority ? PRIORITY_COLOR[priority] : NO_PRIORITY_COLOR,
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-8">
        {sectorsPresent.map((sector) => (
          <p key={sector} className="flex-1 text-center text-xs font-medium text-slate-700">
            {sector === "SEM_SETOR" ? "Sem setor" : SECTOR_LABELS[sector]}
          </p>
        ))}
      </div>
    </div>
  );
}
