/**
 * CSV Exporter Utility
 * Converts arrays of objects into formatted CSV data strings with download support.
 */

export interface CsvExportOptions {
  filename?: string;
  delimiter?: string;
  includeHeaders?: boolean;
}

export function exportToCsv<T extends Record<string, unknown>>(
  data: T[],
  options: CsvExportOptions = {}
): string {
  if (data.length === 0) return '';

  const delimiter = options.delimiter ?? ',';
  const includeHeaders = options.includeHeaders ?? true;
  const headers = Object.keys(data[0]);

  const rows: string[] = [];

  if (includeHeaders) {
    rows.push(headers.map((h) => `"${h}"`).join(delimiter));
  }

  for (const item of data) {
    const row = headers.map((key) => {
      const val = item[key];
      const strVal = val === null || val === undefined ? '' : String(val);
      return `"${strVal.replace(/"/g, '""')}"`;
    });
    rows.push(row.join(delimiter));
  }

  return rows.join('\n');
}

export function exportToJson<T>(data: T[], pretty = false): string {
  return JSON.stringify(data, null, pretty ? 2 : undefined);
}

export function createDownloadBlob(content: string, mimeType = 'text/csv;charset=utf-8;'): Blob {
  return new Blob([content], { type: mimeType });
}

