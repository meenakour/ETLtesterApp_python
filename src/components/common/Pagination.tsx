import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

/** Builds a compact page list with ellipses, e.g. [1, '…', 4, 5, 6, '…', 12]. */
function buildPageList(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages = new Set<number>([1, total, current, current - 1, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);

  const result: (number | '…')[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push('…');
    result.push(sorted[i]);
  }
  return result;
}

export function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = buildPageList(currentPage, totalPages);

  const pageButtonClass = (active: boolean) =>
    `min-w-[2rem] rounded-md px-2 py-1 text-sm font-medium transition-colors ${
      active
        ? 'bg-[var(--color-accent)] text-white'
        : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)]'
    }`;

  return (
    <div className="flex items-center justify-center gap-1">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="rounded-md p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)] disabled:opacity-30"
        aria-label="Previous page"
      >
        <ChevronLeft size={16} />
      </button>

      {pages.map((p, i) =>
        p === '…' ? (
          <span key={`ellipsis-${i}`} className="px-1 text-sm text-[var(--color-text-muted)]">
            …
          </span>
        ) : (
          <button key={p} onClick={() => onPageChange(p)} className={pageButtonClass(p === currentPage)}>
            {p}
          </button>
        )
      )}

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="rounded-md p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)] disabled:opacity-30"
        aria-label="Next page"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
