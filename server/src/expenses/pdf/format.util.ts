// Small server-side formatters for the expenses PDF. Mirrors the helpers in
// receipts/pdf/payment-template.ts (kept local to avoid touching the working
// receipt path). Tashkent is UTC+5.

export function formatSom(value: number): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value).toFixed(0);
  return sign + abs.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

const pad = (n: number) => String(n).padStart(2, '0');

// Date-only — dd.MM.yyyy (Tashkent). Used for the expense `date` column.
export function formatDate(d: Date): string {
  const t = new Date(d.getTime() + 5 * 60 * 60 * 1000);
  return `${pad(t.getUTCDate())}.${pad(t.getUTCMonth() + 1)}.${t.getUTCFullYear()}`;
}

// Date + time — dd.MM.yyyy HH:mm (Tashkent). Used for the "prepared at" line.
export function formatDateTime(d: Date): string {
  const t = new Date(d.getTime() + 5 * 60 * 60 * 1000);
  return `${formatDate(d)} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
}
