import * as XLSX from 'xlsx';

export async function parseWorkbookFromFile(file: File): Promise<XLSX.WorkBook> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('The uploaded file has no sheets. Please upload a valid Excel mapping document.');
  }
  return workbook;
}
