/**
 * Detects ETL-infrastructure/audit columns (load timestamps, batch/run IDs, DQ placeholder
 * flags, etc.) that are populated by the pipeline itself rather than mapped business logic.
 * These get deliberately thin test coverage — the usual per-field edge-case/DQ heuristics
 * (whitespace, format regexes, overflow checks) are noise on a system timestamp or a field
 * that's expected to be blank almost all the time, and they aren't Critical Data Elements in
 * the business sense either.
 */

const ACTION_WORDS = ['load', 'insert', 'created', 'create', 'updated', 'update', 'modified', 'modify', 'etl'];
const TIME_WORDS = ['date', 'ts', 'timestamp', 'dt'];

function isActionTimeCombo(name: string): boolean {
  for (const action of ACTION_WORDS) {
    for (const time of TIME_WORDS) {
      const combo = `${action}_${time}`;
      if (name === combo || name.endsWith(`_${combo}`) || name.startsWith(`${combo}_`)) return true;
    }
  }
  return false;
}

export function isEtlSystemField(fieldName: string): boolean {
  const name = fieldName.trim().toLowerCase();
  if (!name) return false;
  if (/^etl_|_etl$/.test(name)) return true;
  if (/^dw_/.test(name)) return true;
  if (/data_quality_check|^dq_check$|^dq_flag$|^dq_score$/.test(name)) return true;
  if (/^(batch|run|job)_id$/.test(name)) return true;
  if (/^record_source$/.test(name)) return true;
  return isActionTimeCombo(name);
}
