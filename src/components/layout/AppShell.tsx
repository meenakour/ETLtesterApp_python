import type { ReactNode } from 'react';
import { Header } from '@/components/layout/Header';
import { StepIndicator } from '@/components/layout/StepIndicator';
import { useAppState } from '@/hooks/useAppState';

export function AppShell({ children }: { children: ReactNode }) {
  const { state } = useAppState();

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      <Header />
      <StepIndicator current={state.step} />
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
