import { AgendaTabs } from "./agenda/AgendaTabs";
import { MaintenanceCalendar } from "./agenda/MaintenanceCalendar";

export default function Agenda() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Agenda</h1>
        <p className="text-sm text-slate-500">Calendário de preventivas e programação de OS.</p>
      </div>

      <AgendaTabs />

      <MaintenanceCalendar />
    </div>
  );
}
