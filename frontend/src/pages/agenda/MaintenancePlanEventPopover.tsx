import { CSSProperties, useEffect, useRef } from "react";
import { MaintenancePlanWithDueDate } from "../../types";
import { DISCIPLINE_COLORS, MAINTENANCE_DISCIPLINE_LABELS, PRIORITY_LABELS } from "../../domain/labels";
import { formatDate } from "../../lib/format";
import { Button } from "../../components/Button";

const POPOVER_WIDTH = 320;
const ESTIMATED_HEIGHT = 380;
const VIEWPORT_MARGIN = 12;

interface MaintenancePlanEventPopoverProps {
  plan: MaintenancePlanWithDueDate;
  anchorRect: DOMRect;
  onClose: () => void;
  onEdit?: () => void;
  onOpenWorkOrder?: () => void;
}

function computeStyle(anchorRect: DOMRect): CSSProperties {
  const spaceBelow = window.innerHeight - anchorRect.bottom;
  const openUpward = spaceBelow < ESTIMATED_HEIGHT && anchorRect.top > spaceBelow;

  const left = Math.min(Math.max(anchorRect.left, VIEWPORT_MARGIN), window.innerWidth - POPOVER_WIDTH - VIEWPORT_MARGIN);

  const style: CSSProperties = { left: Math.max(left, VIEWPORT_MARGIN), width: POPOVER_WIDTH };
  if (openUpward) {
    style.bottom = Math.max(window.innerHeight - anchorRect.top + 8, VIEWPORT_MARGIN);
  } else {
    style.top = Math.min(anchorRect.bottom + 8, window.innerHeight - VIEWPORT_MARGIN);
  }
  return style;
}

const ACTION_FIELDS = ["action01", "action02", "action03", "action04", "action05", "action06"] as const;

export function MaintenancePlanEventPopover({
  plan,
  anchorRect,
  onClose,
  onEdit,
  onOpenWorkOrder,
}: MaintenancePlanEventPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const colors = DISCIPLINE_COLORS[plan.discipline];
  const actions = ACTION_FIELDS.map((field) => plan[field]).filter((value): value is string => !!value);

  return (
    <div
      ref={ref}
      style={computeStyle(anchorRect)}
      className="fixed z-50 max-h-[80vh] overflow-y-auto rounded-lg border border-slate-200 bg-white p-4 shadow-xl"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">{plan.title}</h3>
        <button onClick={onClose} className="shrink-0 text-slate-400 hover:text-slate-600" aria-label="Fechar">
          ✕
        </button>
      </div>

      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Ativo</dt>
          <dd className="text-right text-slate-800">{plan.asset.name}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-slate-500">Disciplina</dt>
          <dd className={`rounded px-1.5 py-0.5 text-xs font-medium ${colors.bg} ${colors.text}`}>
            {MAINTENANCE_DISCIPLINE_LABELS[plan.discipline]}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Prioridade</dt>
          <dd className="text-slate-800">{PRIORITY_LABELS[plan.priority]}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Vencimento</dt>
          <dd className="text-slate-800">{formatDate(plan.dueDate)}</dd>
        </div>
        {plan.isOverdue && (
          <div className="flex justify-between gap-3">
            <dt className="text-red-600">Vencido — prazo limite</dt>
            <dd className="font-medium text-red-600">{formatDate(plan.deadline)}</dd>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Responsável</dt>
          <dd className="text-slate-800">{plan.responsible ?? "—"}</dd>
        </div>
      </dl>

      {actions.length > 0 && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Checklist</p>
          <ol className="list-decimal space-y-1 pl-4 text-sm text-slate-700">
            {actions.map((action, i) => (
              <li key={i}>{action}</li>
            ))}
          </ol>
        </div>
      )}

      {(onOpenWorkOrder || onEdit) && (
        <div className="mt-4 flex justify-end gap-2">
          {plan.isOverdue && onOpenWorkOrder && <Button onClick={onOpenWorkOrder}>Abrir OS</Button>}
          {onEdit && (
            <Button variant="secondary" onClick={onEdit}>
              Editar
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
