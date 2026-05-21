/** CSV セル用エスケープ */
export function escapeCsvCell(value: string | number): string {
  const s = String(value ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** UTF-8 BOM 付き CSV をブラウザからダウンロード */
export function downloadCsv(filename: string, rows: readonly (readonly string[])[]): void {
  const body = rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF' + body], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.click();
  URL.revokeObjectURL(url);
}

export function sanitizeFilenamePart(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, '_').trim() || 'export';
}
