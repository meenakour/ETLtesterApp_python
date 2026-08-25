import { Moon, Sun, RotateCcw, DatabaseZap } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { useAppState } from '@/hooks/useAppState';
import { Button } from '@/components/common/Button';
import { AiAssistSettingsMenu } from '@/components/layout/AiAssistSettingsMenu';

export function Header() {
  const { theme, toggleTheme } = useTheme();
  const { state, actions } = useAppState();

  return (
    <header className="sticky top-0 z-10 border-b border-[var(--color-border)] bg-[var(--color-surface)]/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
            <DatabaseZap size={18} />
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-tight">ETL Test Case Generator</h1>
            <p className="text-xs text-[var(--color-text-muted)] leading-tight">
              Automated SQL test case generation from mapping documents
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {state.fileName && (
            <span className="hidden max-w-[220px] truncate text-xs text-[var(--color-text-muted)] sm:inline">
              {state.fileName}
            </span>
          )}
          {state.step !== 'upload' && (
            <Button variant="ghost" onClick={actions.reset} icon={<RotateCcw size={14} />}>
              Start Over
            </Button>
          )}
          <AiAssistSettingsMenu />
          <Button variant="ghost" onClick={toggleTheme} aria-label="Toggle theme">
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </Button>
        </div>
      </div>
    </header>
  );
}
