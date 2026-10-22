import { Button } from "./Button";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

// Paginação simples (anterior/próxima) para listas que crescem sem limite —
// o backend devolve no máximo 100 itens por página, então sem isto as OS
// mais antigas simplesmente não apareciam.
export function Pagination({ page, pageSize, total, onPageChange }: PaginationProps) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
      <span>
        Mostrando {first}–{last} de {total}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="secondary" type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Anterior
        </Button>
        <span>
          Página {page} de {lastPage}
        </span>
        <Button variant="secondary" type="button" disabled={page >= lastPage} onClick={() => onPageChange(page + 1)}>
          Próxima
        </Button>
      </div>
    </div>
  );
}
