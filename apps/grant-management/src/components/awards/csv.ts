import { downloadText } from '../../lib/download';

type Cell = string | number | boolean | null | undefined;

function cell(v: Cell) {
  const s = v == null ? '' : String(v);
  // Names and notes are typed by people; never let one run as a spreadsheet formula.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(headers: string[], rows: Cell[][]) {
  return [headers, ...rows].map(r => r.map(cell).join(',')).join('\r\n');
}

export function csvSlug(...parts: Array<string | null | undefined>) {
  return parts
    .filter(Boolean)
    .map(p => String(p).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''))
    .filter(Boolean)
    .join('-');
}

/** A dated, slugged filename: `awards-nrf-2026-09-13.csv`. */
export function csvFilename(...parts: Array<string | null | undefined>) {
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `${csvSlug(...parts) || 'export'}-${stamp}.csv`;
}

export function downloadCsv(filename: string, headers: string[], rows: Cell[][]) {
  // A byte-order mark so Excel reads names with accents correctly.
  downloadText(filename, `\uFEFF${toCsv(headers, rows)}`);
}
