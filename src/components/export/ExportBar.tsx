import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, FileSpreadsheet, FileText, NotebookText, Table2 } from 'lucide-react';
import type { TestCase } from '@/types/testCase';
import type { MappingRow } from '@/types/mapping';
import { Button } from '@/components/common/Button';
import { exportTestCasesToExcel } from '@/lib/excel/exportWorkbook';
import { exportSqlBundle } from '@/lib/excel/exportSql';
import { exportIpynbNotebook } from '@/lib/excel/exportIpynb';
import { exportAzdoCsv } from '@/lib/excel/exportAzdoCsv';
import { AzdoExportModal } from '@/components/export/AzdoExportModal';

export function ExportBar({ testCases, mappingRows }: { testCases: TestCase[]; mappingRows: MappingRow[] }) {
  const [showAzdoModal, setShowAzdoModal] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const manualCount = testCases.filter((tc) => tc.isManualReview).length;
  const allCount = testCases.length;

  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const menuItemClass =
    'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-surface-alt)]';

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="text-sm text-[var(--color-text-muted)]">
        <span className="font-medium text-[var(--color-text)]">{allCount}</span> test case{allCount === 1 ? '' : 's'}{' '}
        generated
        {manualCount > 0 && (
          <>
            {' '}
            &middot; <span className="font-medium text-[var(--color-warning)]">{manualCount}</span> need manual
            review
          </>
        )}
      </div>

      <div ref={menuRef} className="relative">
        <Button icon={<Download size={15} />} onClick={() => setMenuOpen((v) => !v)}>
          Export
          <ChevronDown size={14} />
        </Button>

        {menuOpen && (
          <div className="absolute right-0 top-full z-10 mt-1 w-56 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-lg">
            <button
              className={menuItemClass}
              onClick={() => {
                exportSqlBundle(testCases);
                setMenuOpen(false);
              }}
            >
              <FileText size={15} />
              SQL Bundle
            </button>
            <button
              className={menuItemClass}
              onClick={() => {
                exportIpynbNotebook(testCases);
                setMenuOpen(false);
              }}
            >
              <NotebookText size={15} />
              Notebook (.ipynb)
            </button>
            <button
              className={menuItemClass}
              onClick={() => {
                setMenuOpen(false);
                setShowAzdoModal(true);
              }}
            >
              <Table2 size={15} />
              CSV (Azure DevOps)
            </button>
            <button
              className={menuItemClass}
              onClick={() => {
                exportTestCasesToExcel(testCases, mappingRows);
                setMenuOpen(false);
              }}
            >
              <FileSpreadsheet size={15} />
              Excel
            </button>
          </div>
        )}
      </div>

      {showAzdoModal && (
        <AzdoExportModal
          onCancel={() => setShowAzdoModal(false)}
          onConfirm={(settings) => {
            exportAzdoCsv(testCases, settings);
            setShowAzdoModal(false);
          }}
        />
      )}
    </div>
  );
}
