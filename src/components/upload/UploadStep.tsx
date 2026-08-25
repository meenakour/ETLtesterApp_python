import { DropzoneFileInput } from '@/components/upload/DropzoneFileInput';
import { useAppState } from '@/hooks/useAppState';
import { AlertCircle, Download } from 'lucide-react';
import { downloadSampleTemplate } from '@/lib/excel/sampleTemplate';

export function UploadStep() {
  const { state, actions } = useAppState();

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8 text-center">
        <h2 className="text-2xl font-semibold">Upload your mapping document</h2>
        <p className="mt-2 text-[var(--color-text-muted)]">
          Upload an Excel workbook containing your source-to-target field mapping — tables, schemas,
          datatypes, transformations, and key/nullable attributes — along with a joins and filter
          conditions sheet. All processing happens locally in your browser; your data is never uploaded
          or transmitted anywhere.
        </p>
        <button
          onClick={() => downloadSampleTemplate()}
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-accent)] hover:text-[var(--color-accent-hover)]"
        >
          <Download size={14} />
          Download a sample template
        </button>
      </div>

      <DropzoneFileInput onFileSelected={actions.loadFile} isLoading={state.isLoading} />

      {state.error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}
    </div>
  );
}
