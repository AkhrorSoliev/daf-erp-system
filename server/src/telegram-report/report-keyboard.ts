import { Markup } from 'telegraf';

export type ReportFocus = number | 'all';
export type ReportAction =
  | { kind: 'open' }
  | { kind: 'focus'; focus: ReportFocus };

/** The staff menu's «📊 Hisobot» button. */
export const REPORT_OPEN_ACTION = 'tr:open';

const ID = /^\d{1,9}$/;

/** Buttons under a personal report (ADR-0095); ≤ 64-byte callback data. */
export function reportKeyboard(
  branches: Array<{ id: number; name: string }>,
  focus: ReportFocus,
) {
  const rows: ReturnType<typeof Markup.button.callback>[][] = [];
  if (branches.length > 1) {
    const buttons = [
      ...branches.map((b) =>
        Markup.button.callback(
          b.id === focus ? `• ${b.name}` : b.name,
          `tr:b:${b.id}`,
        ),
      ),
      Markup.button.callback(
        focus === 'all' ? '• 🌐 Barchasi' : '🌐 Barchasi',
        'tr:all',
      ),
    ];
    for (let k = 0; k < buttons.length; k += 3)
      rows.push(buttons.slice(k, k + 3));
  }
  rows.push([Markup.button.callback('🔄 Yangilash', `tr:r:${focus}`)]);
  return Markup.inlineKeyboard(rows);
}

export function parseReportAction(data: string): ReportAction | null {
  if (data === REPORT_OPEN_ACTION) return { kind: 'open' };
  if (data === 'tr:all' || data === 'tr:r:all')
    return { kind: 'focus', focus: 'all' };
  const m = /^tr:(?:b|r):(.+)$/.exec(data);
  return m && ID.test(m[1]) ? { kind: 'focus', focus: Number(m[1]) } : null;
}
