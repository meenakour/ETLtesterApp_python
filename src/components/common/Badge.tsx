import type { ReactNode } from 'react';

type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'accent';

const TONE_CLASSES: Record<Tone, string> = {
  success: 'bg-[var(--color-success-soft)] text-[var(--color-success)]',
  warning: 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]',
  danger: 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]',
  neutral: 'bg-[var(--color-surface-alt)] text-[var(--color-text-muted)]',
  accent: 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]',
};

export function Badge({ tone = 'neutral', title, children }: { tone?: Tone; title?: string; children: ReactNode }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${title ? 'cursor-help' : ''} ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}
