import { Priority } from "../../domain/enums";
import { PRIORITY_LABELS } from "../../domain/labels";
import { Checkbox } from "../../components/Checkbox";
import { Card } from "../../components/Card";

interface AssetOption {
  id: string;
  name: string;
}

interface CalendarSidebarFiltersProps {
  assets: AssetOption[];
  excludedAssetIds: Set<string>;
  onToggleAsset: (assetId: string) => void;
  excludedPriorities: Set<Priority>;
  onTogglePriority: (priority: Priority) => void;
}

// Sidebar estilo "lista de calendários" do iCloud — desmarcar um item some
// com os eventos correspondentes, filtro client-side sobre os planos já
// carregados (não refaz a chamada de API a cada toggle).
export function CalendarSidebarFilters({
  assets,
  excludedAssetIds,
  onToggleAsset,
  excludedPriorities,
  onTogglePriority,
}: CalendarSidebarFiltersProps) {
  return (
    <Card className="w-full shrink-0 space-y-5 sm:w-56">
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Ativos</h3>
        {assets.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhum plano cadastrado.</p>
        ) : (
          <div className="space-y-1.5">
            {assets.map((asset) => (
              <Checkbox
                key={asset.id}
                label={asset.name}
                checked={!excludedAssetIds.has(asset.id)}
                onChange={() => onToggleAsset(asset.id)}
              />
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Prioridade</h3>
        <div className="space-y-1.5">
          {Object.values(Priority).map((priority) => (
            <Checkbox
              key={priority}
              label={PRIORITY_LABELS[priority]}
              checked={!excludedPriorities.has(priority)}
              onChange={() => onTogglePriority(priority)}
            />
          ))}
        </div>
      </div>
    </Card>
  );
}
