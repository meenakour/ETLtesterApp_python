import { useEffect, useRef, useState } from 'react';
import { Sparkles, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { useAiAssist } from '@/hooks/useAiAssist';
import { checkAiAssistServer } from '@/lib/llm/aiAssist';
import { Button } from '@/components/common/Button';

type ConnectionStatus = 'idle' | 'checking' | 'connected' | 'unreachable';

export function AiAssistSettingsMenu() {
  const { enabled, setEnabled, serverUrl, setServerUrl } = useAiAssist();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const testConnection = async () => {
    setStatus('checking');
    const ok = await checkAiAssistServer(serverUrl);
    setStatus(ok ? 'connected' : 'unreachable');
  };

  return (
    <div ref={menuRef} className="relative">
      <Button
        variant="ghost"
        onClick={() => setOpen((v) => !v)}
        icon={<Sparkles size={15} className={enabled ? 'text-[var(--color-accent)]' : undefined} />}
      >
        AI Assist
      </Button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-80 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-lg">
          <label className="flex items-center justify-between gap-2 text-sm font-medium">
            Enable AI Assist
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          </label>
          <p className="mt-1.5 text-xs text-[var(--color-text-muted)]">
            When enabled, transformation rules that couldn't be automatically translated are sent — as text
            only, along with column names, never actual data rows or values — to the AI Assist server below for
            a best-effort SQL translation. You still review and confirm every suggestion.
          </p>

          <label className="mt-3 flex flex-col gap-1 text-xs">
            Server URL
            <input
              value={serverUrl}
              onChange={(e) => {
                setServerUrl(e.target.value);
                setStatus('idle');
              }}
              placeholder="http://localhost:8787"
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-sm"
            />
          </label>

          <div className="mt-3 flex items-center gap-2">
            <Button variant="secondary" onClick={testConnection} disabled={status === 'checking'}>
              {status === 'checking' ? <Loader2 size={14} className="animate-spin" /> : null}
              Test connection
            </Button>
            {status === 'connected' && (
              <span className="flex items-center gap-1 text-xs text-[var(--color-success)]">
                <CheckCircle2 size={14} /> Connected
              </span>
            )}
            {status === 'unreachable' && (
              <span className="flex items-center gap-1 text-xs text-[var(--color-danger)]">
                <XCircle size={14} /> Unreachable
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
