import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export function SqlCodeBlock({ sql }: { sql: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="relative rounded-lg bg-[var(--color-code-bg)]">
      <button
        onClick={handleCopy}
        className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-xs text-white/80 hover:bg-white/20"
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words p-4 pr-16 text-xs leading-relaxed text-[var(--color-code-text)]">
        {sql}
      </pre>
    </div>
  );
}
