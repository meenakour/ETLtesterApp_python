import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useAppState } from '@/hooks/useAppState';
import { useMappingData } from '@/hooks/useMappingData';
import { SheetPreviewTable } from '@/components/preview/SheetPreviewTable';
import { ColumnMappingPanel } from '@/components/preview/ColumnMappingPanel';
import { JoinAssociationSummary } from '@/components/preview/JoinAssociationSummary';
import { TableTypeConfigPanel } from '@/components/preview/TableTypeConfigPanel';
import { Button } from '@/components/common/Button';
import { REQUIRED_MAPPING_FIELDS, REQUIRED_JOIN_FIELDS, MAPPING_FIELD_LABELS, JOIN_FIELD_LABELS } from '@/types/columnMapping';

type Tab = 'mapping' | 'joins' | 'types';

export function PreviewStep() {
  const { state, actions } = useAppState();
  const { requiredFieldsResolved, mappingRows } = useMappingData();
  const [tab, setTab] = useState<Tab>('mapping');

  const tabBtn = (key: Tab, label: string) => (
    <button
      onClick={() => setTab(key)}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        tab === key
          ? 'bg-[var(--color-accent)] text-white'
          : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)]'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      {state.sheetChoiceNeeded && (
        <div className="rounded-xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-4">
          <p className="mb-3 text-sm font-medium text-[var(--color-warning)]">
            We couldn't confidently tell which sheet is which — please confirm:
          </p>
          <div className="flex flex-wrap gap-4">
            <label className="flex flex-col gap-1 text-sm">
              Mapping sheet
              <select
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1"
                value={state.mappingSheetName ?? ''}
                onChange={(e) => actions.selectMappingSheet(e.target.value)}
              >
                {state.workbookSheetNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Joins &amp; filters sheet
              <select
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1"
                value={state.joinsSheetName ?? ''}
                onChange={(e) => actions.selectJoinsSheet(e.target.value)}
              >
                <option value="">-- None --</option>
                {state.workbookSheetNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {tabBtn('mapping', 'Mapping Sheet')}
          {tabBtn('joins', 'Joins & Filters Sheet')}
          {tabBtn('types', 'Source/Target Type')}
        </div>
        <p className="text-sm text-[var(--color-text-muted)]">
          {mappingRows.length} mapping row{mappingRows.length === 1 ? '' : 's'} parsed
        </p>
      </div>

      {tab === 'mapping' && (
        <div className="space-y-4">
          {state.mappingSheet ? (
            <>
              <SheetPreviewTable sheet={state.mappingSheet} />
              <ColumnMappingPanel
                columns={state.mappingColumns}
                headers={state.mappingSheet.headers}
                fieldLabels={MAPPING_FIELD_LABELS}
                requiredFields={REQUIRED_MAPPING_FIELDS}
                onOverride={actions.overrideMappingColumn}
              />
            </>
          ) : (
            <p className="text-sm text-[var(--color-text-muted)]">No mapping sheet selected.</p>
          )}
        </div>
      )}

      {tab === 'joins' && (
        <div className="space-y-4">
          {state.joinsSheet ? (
            <>
              <SheetPreviewTable sheet={state.joinsSheet} />
              <ColumnMappingPanel
                columns={state.joinColumns}
                headers={state.joinsSheet.headers}
                fieldLabels={JOIN_FIELD_LABELS}
                requiredFields={REQUIRED_JOIN_FIELDS}
                onOverride={actions.overrideJoinColumn}
              />
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <h3 className="mb-3 text-sm font-medium">Table Association</h3>
                <JoinAssociationSummary />
              </div>
            </>
          ) : (
            <p className="text-sm text-[var(--color-text-muted)]">
              No joins &amp; filters sheet detected — row-count and referential-integrity tests will be generated
              without join/filter context.
            </p>
          )}
        </div>
      )}

      {tab === 'types' && (
        <div className="space-y-4">
          <TableTypeConfigPanel />
        </div>
      )}

      <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-4">
        {!requiredFieldsResolved && (
          <p className="text-sm text-[var(--color-danger)]">
            Please resolve all required fields (marked *) before continuing.
          </p>
        )}
        <div className="ml-auto">
          <Button
            disabled={!requiredFieldsResolved}
            onClick={() => actions.setStep('categories')}
            icon={<ArrowRight size={16} />}
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
