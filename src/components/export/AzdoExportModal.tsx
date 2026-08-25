import { useState } from 'react';
import { X } from 'lucide-react';
import type { AzdoExportSettings } from '@/lib/excel/exportAzdoCsv';
import { DEFAULT_AZDO_SETTINGS } from '@/lib/excel/exportAzdoCsv';
import { Button } from '@/components/common/Button';

interface FieldSpec {
  key: keyof AzdoExportSettings;
  label: string;
  placeholder?: string;
  required?: boolean;
}

const FIELDS: FieldSpec[] = [
  { key: 'areaPath', label: 'Area Path', placeholder: 'e.g. MyProject\\ETL\\Testing', required: true },
  { key: 'iterationPath', label: 'Iteration Path', placeholder: 'e.g. MyProject\\Sprint 12', required: true },
  { key: 'assignedTo', label: 'Assigned To', placeholder: 'e.g. jane.doe@company.com' },
  { key: 'appEaiCode', label: 'App_EAICode', placeholder: 'org application code' },
  { key: 'eaiCode', label: 'EAI Code', placeholder: 'org EAI code' },
  { key: 'toolsUsed', label: 'Tools Used' },
  { key: 'automationStatus', label: 'Test Case Automation Status' },
  { key: 'state', label: 'State' },
];

interface AzdoExportModalProps {
  onCancel: () => void;
  onConfirm: (settings: AzdoExportSettings) => void;
}

export function AzdoExportModal({ onCancel, onConfirm }: AzdoExportModalProps) {
  const [settings, setSettings] = useState<AzdoExportSettings>(DEFAULT_AZDO_SETTINGS);

  const missingRequired = FIELDS.filter((f) => f.required && !settings[f.key].trim());

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 p-4" onClick={onCancel}>
      <div
        className="w-full max-w-lg rounded-xl bg-[var(--color-surface)] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">Export for Azure DevOps import</h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              These fields apply to every row in the CSV — fill them in once here instead of per-row after import.
              Title, steps and expected results are already populated from your generated test cases.
            </p>
          </div>
          <button
            onClick={onCancel}
            className="rounded-lg p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)]"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {FIELDS.map((field) => (
            <label key={field.key} className="flex flex-col gap-1 text-sm">
              <span>
                {field.label}
                {field.required && <span className="ml-1 text-[var(--color-danger)]">*</span>}
              </span>
              <input
                value={settings[field.key]}
                placeholder={field.placeholder}
                onChange={(e) => setSettings((prev) => ({ ...prev, [field.key]: e.target.value }))}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-sm"
              />
            </label>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between">
          {missingRequired.length > 0 ? (
            <p className="text-xs text-[var(--color-danger)]">
              Fill in {missingRequired.map((f) => f.label).join(', ')} to continue (or leave them and fix in ADO
              afterward).
            </p>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={() => onConfirm(settings)}>Download CSV</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
