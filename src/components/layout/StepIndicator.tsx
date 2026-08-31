import { Check } from 'lucide-react';
import type { Step } from '@/state/AppStateContext';

const STEPS: { key: Step; label: string }[] = [
  { key: 'upload', label: 'Upload' },
  { key: 'review', label: 'Review & Generate' },
  { key: 'results', label: 'Results & Export' },
];

export function StepIndicator({ current }: { current: Step }) {
  const currentIndex = STEPS.findIndex((s) => s.key === current);

  return (
    <div className="mx-auto max-w-6xl px-6 pt-6">
      <ol className="flex items-center gap-2">
        {STEPS.map((step, i) => {
          const isDone = i < currentIndex;
          const isActive = i === currentIndex;
          return (
            <li key={step.key} className="flex flex-1 items-center gap-2">
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                  isDone
                    ? 'bg-[var(--color-success)] text-white'
                    : isActive
                      ? 'bg-[var(--color-accent)] text-white'
                      : 'bg-[var(--color-surface-alt)] text-[var(--color-text-muted)]'
                }`}
              >
                {isDone ? <Check size={14} /> : i + 1}
              </div>
              <span
                className={`hidden text-sm sm:inline ${
                  isActive ? 'font-medium text-[var(--color-text)]' : 'text-[var(--color-text-muted)]'
                }`}
              >
                {step.label}
              </span>
              {i < STEPS.length - 1 && <div className="h-px flex-1 bg-[var(--color-border)]" />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
