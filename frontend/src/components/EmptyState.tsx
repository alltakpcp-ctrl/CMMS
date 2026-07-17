export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
      <p className="text-base">{title}</p>
      {description && <p className="mt-1 text-sm">{description}</p>}
    </div>
  );
}
