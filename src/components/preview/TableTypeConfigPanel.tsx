import { useAppState } from '@/hooks/useAppState';
import { useMappingData } from '@/hooks/useMappingData';
import { getTableTypeConfig } from '@/types/tableTypeConfig';
import type { SourceKind, TargetKind } from '@/types/tableTypeConfig';
import { FILE_FORMATS, buildFilePath, inferFileFormat } from '@/lib/fileFormat';
import { Badge } from '@/components/common/Badge';

export function TableTypeConfigPanel() {
  const { state, actions } = useAppState();
  const { mappingRowsByTargetTable } = useMappingData();

  const tables = [...mappingRowsByTargetTable.entries()];
  if (tables.length === 0) {
    return <p className="text-sm text-[var(--color-text-muted)]">No target tables detected yet.</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-text-muted)]">
        By default every table is treated as a normal database table on both sides. Switch a table to{' '}
        <strong>File</strong> for an L1 landing-layer source, or <strong>Dashboard</strong> for an L3 KPI target —
        test cases for that table adapt automatically.
      </p>

      {tables.map(([targetTable, rows]) => {
        const config = getTableTypeConfig(state.tableTypeConfigs, targetTable);
        const rowWithFile = rows.find((r) => r.sourceFileLocation || r.sourceFileName);
        const detectedPath = rowWithFile ? buildFilePath(rowWithFile.sourceFileLocation, rowWithFile.sourceFileName) : '';
        const detectedFormat = rowWithFile?.sourceFileName ? inferFileFormat(rowWithFile.sourceFileName) : null;

        const update = (patch: Partial<typeof config>) => actions.setTableTypeConfig(targetTable, patch);

        return (
          <div key={targetTable} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <h3 className="mb-3 text-sm font-semibold">{targetTable}</h3>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Source Type */}
              <div className="space-y-2">
                <label className="flex flex-col gap-1 text-sm">
                  Source Type
                  <select
                    value={config.sourceKind}
                    onChange={(e) => update({ sourceKind: e.target.value as SourceKind })}
                    className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm"
                  >
                    <option value="table">Table</option>
                    <option value="file">File</option>
                  </select>
                </label>

                {config.sourceKind === 'file' && (
                  <div className="space-y-2 rounded-lg bg-[var(--color-surface-alt)] p-3">
                    {detectedPath ? (
                      <div className="flex items-center gap-2 text-xs">
                        <Badge tone="success">Auto-detected</Badge>
                        <span className="truncate text-[var(--color-text-muted)]">
                          {detectedFormat ?? config.sourceFileFormatOverride ?? 'csv'}.`{detectedPath}`
                        </span>
                      </div>
                    ) : (
                      <>
                        <label className="flex flex-col gap-1 text-xs">
                          Source File Path (no matching column found in doc)
                          <input
                            value={config.sourceFilePathOverride ?? ''}
                            onChange={(e) => update({ sourceFilePathOverride: e.target.value })}
                            placeholder="/mnt/landing/customers.csv"
                            className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs"
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-xs">
                          Format
                          <select
                            value={config.sourceFileFormatOverride ?? 'csv'}
                            onChange={(e) => update({ sourceFileFormatOverride: e.target.value as (typeof FILE_FORMATS)[number] })}
                            className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs"
                          >
                            {FILE_FORMATS.map((f) => (
                              <option key={f} value={f}>
                                {f}
                              </option>
                            ))}
                          </select>
                        </label>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Target Type */}
              <div className="space-y-2">
                <label className="flex flex-col gap-1 text-sm">
                  Target Type
                  <select
                    value={config.targetKind}
                    onChange={(e) => update({ targetKind: e.target.value as TargetKind })}
                    className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm"
                  >
                    <option value="table">Table</option>
                    <option value="file">File</option>
                    <option value="dashboard">Dashboard</option>
                  </select>
                </label>

                {config.targetKind === 'file' && (
                  <div className="space-y-2 rounded-lg bg-[var(--color-surface-alt)] p-3">
                    <label className="flex flex-col gap-1 text-xs">
                      Target File Path
                      <input
                        value={config.targetFilePathOverride ?? ''}
                        onChange={(e) => update({ targetFilePathOverride: e.target.value })}
                        placeholder="/mnt/out/customers.parquet"
                        className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs">
                      Format
                      <select
                        value={config.targetFileFormatOverride ?? 'csv'}
                        onChange={(e) => update({ targetFileFormatOverride: e.target.value as (typeof FILE_FORMATS)[number] })}
                        className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs"
                      >
                        {FILE_FORMATS.map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}

                {config.targetKind === 'dashboard' && (
                  <div className="space-y-2 rounded-lg bg-[var(--color-surface-alt)] p-3">
                    <label className="flex flex-col gap-1 text-xs">
                      Dashboard Name
                      <input
                        value={config.dashboardName ?? ''}
                        onChange={(e) => update({ dashboardName: e.target.value })}
                        placeholder="Sales Overview"
                        className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs">
                      KPI Name
                      <input
                        value={config.kpiName ?? ''}
                        onChange={(e) => update({ kpiName: e.target.value })}
                        placeholder="Total Revenue"
                        className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs"
                      />
                    </label>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
