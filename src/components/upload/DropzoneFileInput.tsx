import { useRef, useState, type DragEvent } from 'react';
import { UploadCloud, FileSpreadsheet } from 'lucide-react';

const ACCEPTED_EXTENSIONS = ['.xlsx', '.xls'];

interface DropzoneFileInputProps {
  onFileSelected: (file: File) => void;
  isLoading: boolean;
}

function isAcceptedFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export function DropzoneFileInput({ onFileSelected, isLoading }: DropzoneFileInputProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!isAcceptedFile(file)) {
      setLocalError('Unsupported file type. Please upload an .xlsx or .xls file.');
      return;
    }
    setLocalError(null);
    onFileSelected(file);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-8 py-16 text-center transition-colors ${
          isDragOver
            ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
            : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-accent)]'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
          {isLoading ? (
            <FileSpreadsheet size={26} className="animate-pulse" />
          ) : (
            <UploadCloud size={26} />
          )}
        </div>
        <p className="text-base font-medium">
          {isLoading ? 'Parsing your mapping document…' : 'Drag & drop your mapping document here'}
        </p>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          or click to browse — .xlsx / .xls, with a mapping sheet and a joins &amp; filters sheet
        </p>
      </div>
      {localError && <p className="mt-3 text-sm text-[var(--color-danger)]">{localError}</p>}
    </div>
  );
}
