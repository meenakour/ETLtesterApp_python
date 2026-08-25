export type FileFormat = 'csv' | 'parquet' | 'json' | 'delta';

export const FILE_FORMATS: FileFormat[] = ['csv', 'parquet', 'json', 'delta'];

/** Infers the Spark file format from a file name's extension, or null when it can't be determined. */
export function inferFileFormat(fileName: string): FileFormat | null {
  const ext = fileName.trim().toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (!ext) return null;
  if (ext === 'csv' || ext === 'tsv') return 'csv';
  if (ext === 'parquet' || ext === 'pq') return 'parquet';
  if (ext === 'json' || ext === 'jsonl' || ext === 'ndjson') return 'json';
  if (ext === 'delta') return 'delta';
  return null;
}

/** Joins a file location and file name into a single path, tolerating a missing/trailing separator. */
export function buildFilePath(location: string | undefined, fileName: string | undefined): string {
  const loc = (location ?? '').trim();
  const name = (fileName ?? '').trim();
  if (!loc) return name;
  if (!name) return loc;
  const sep = /[/\\]$/.test(loc) ? '' : '/';
  return `${loc}${sep}${name}`;
}
