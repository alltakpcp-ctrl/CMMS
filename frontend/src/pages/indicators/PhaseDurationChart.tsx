export interface BarItem {
  key: string;
  label: string;
  value: number;
  displayValue: string;
  note?: string;
}

interface Props {
  items: BarItem[];
  barColor: string;
}

// Barra horizontal genérica em CSS puro — largura proporcional ao maior
// `value` do conjunto. Reusada para duração por fase, produção por técnico
// e mix por tipo (cada uma passa sua própria cor, já que cada gráfico é uma
// série única — sem necessidade de legenda por cor, ver skill de dataviz).
export function PhaseDurationChart({ items, barColor }: Props) {
  const maxValue = Math.max(1, ...items.map((item) => item.value));

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.key}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="font-medium text-slate-900">
              {item.label}
              {item.note && <span className="ml-2 text-xs font-normal text-slate-500">{item.note}</span>}
            </span>
            <span className="shrink-0 tabular-nums text-slate-700">{item.displayValue}</span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-slate-100">
            <div
              className="h-2.5 rounded-full"
              style={{ width: `${Math.max(2, (item.value / maxValue) * 100)}%`, backgroundColor: barColor }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
