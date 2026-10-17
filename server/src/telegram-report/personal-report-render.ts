import type {
  TelegramReportLayout,
  TelegramReportSection,
} from '@prisma/client';
import type { DailyReportData } from '../telegram-groups/telegram-group-daily-report.service';
import { escapeHtml } from '../telegram-groups/utils/format.util';
import {
  METRICS,
  metricCell,
  tableCell,
  type Metric,
} from './personal-report-metrics';

export interface ReportUnit {
  label: string;
  data: DailyReportData;
}

export interface RenderInput {
  layout: TelegramReportLayout;
  sections: TelegramReportSection[];
  /** One per branch; empty for TOTAL_ONLY with several branches. */
  units: ReportUnit[];
  /** The scope of every shown branch together; null when only one branch shows. */
  total: DailyReportData | null;
  dateLabel: string;
  asOf: string;
}

const TELEGRAM_LIMIT = 4096;
const LABEL_WIDTH = 9;

const short = (label: string) =>
  label.length > LABEL_WIDTH ? `${label.slice(0, LABEL_WIDTH - 1)}…` : label;

function bySection(i: RenderInput, metrics: Metric[]): string[] {
  const single = i.units.length === 1 && !i.total;
  const out: string[] = [];
  for (const m of metrics) {
    if (single) {
      const v = metricCell(m, i.units[0].data);
      if (v !== null) out.push(`${m.emoji} ${m.label}: ${v}`);
      continue;
    }
    const parts = i.units
      .map((u) => [escapeHtml(u.label), metricCell(m, u.data)] as const)
      .filter(([, v]) => v !== null)
      .map(([label, v]) => `${label} ${v}`);
    const t = i.total ? metricCell(m, i.total) : null;
    if (t !== null) parts.push(`jami ${t}`);
    if (parts.length) out.push(`${m.emoji} ${m.label}: ${parts.join(' · ')}`);
  }
  return out;
}

function table(i: RenderInput, metrics: Metric[]): string[] {
  const cols = [
    ...i.units.map((u) => short(u.label)),
    ...(i.total ? ['Jami'] : []),
  ];
  const datas = [...i.units.map((u) => u.data), ...(i.total ? [i.total] : [])];
  const rows = metrics
    .map((m) => [m.label, ...datas.map((d) => tableCell(m, d) ?? '—')])
    .filter((r) => r.slice(1).some((c) => c !== '—'));
  if (!rows.length) return [];
  const w0 = Math.max(...rows.map((r) => r[0].length));
  const w = cols.map((c, j) =>
    Math.max(c.length, ...rows.map((r) => r[j + 1].length)),
  );
  const line = (first: string, cells: string[]) =>
    first.padEnd(w0) + cells.map((c, j) => `  ${c.padStart(w[j])}`).join('');
  const block = [
    line('', cols),
    ...rows.map((r) => line(r[0], r.slice(1))),
  ].join('\n');
  return [`<pre>${escapeHtml(block)}</pre>`, "<i>Pul — mln so'm</i>"];
}

function unitLine(metrics: Metric[], d: DailyReportData): string {
  return metrics
    .map((m) => {
      const v = metricCell(m, d);
      return v === null ? null : `${m.emoji} ${m.label} ${v}`;
    })
    .filter((x): x is string => x !== null)
    .join(' · ');
}

function byBranch(
  i: RenderInput,
  metrics: Metric[],
  alerts: boolean,
): string[] {
  const out: string[] = [];
  for (const u of i.units) {
    const l = unitLine(metrics, u.data);
    const flags = alerts ? u.data.flags : [];
    if (!l && !flags.length) continue;
    out.push(`🏢 <b>${escapeHtml(u.label)}</b>`);
    if (l) out.push(l);
    if (flags.length) out.push('🚩 Diqqat', ...flags);
  }
  if (i.total) {
    const l = unitLine(metrics, i.total);
    if (l) out.push('Σ <b>Jami</b>', l);
  }
  return out;
}

function totalOnly(i: RenderInput, metrics: Metric[]): string[] {
  const d = i.total ?? i.units[0]?.data;
  if (!d) return [];
  return metrics
    .map((m) => {
      const v = metricCell(m, d);
      return v === null ? null : `${m.emoji} ${m.label}: ${v}`;
    })
    .filter((x): x is string => x !== null);
}

/** Flags under the report for every layout but BY_BRANCH (which places them per branch). */
function alertLines(i: RenderInput): string[] {
  const d = i.total ?? i.units[0]?.data;
  if (!d || !d.flags.length) return [];
  return ['', '🚩 <b>Diqqat</b>', ...d.flags];
}

/** A personal report (ADR-0095). Pure: same input, same text. */
export function renderPersonalReport(i: RenderInput): string {
  const metrics = METRICS.filter((m) => i.sections.includes(m.section));
  const wantsAlerts = i.sections.includes('ALERTS');
  let body: string[];
  if (i.layout === 'TABLE') body = table(i, metrics);
  else if (i.layout === 'BY_BRANCH' && i.units.length > 1)
    body = byBranch(i, metrics, wantsAlerts);
  else if (i.layout === 'TOTAL_ONLY') body = totalOnly(i, metrics);
  else body = bySection(i, metrics);
  const alerts =
    wantsAlerts && !(i.layout === 'BY_BRANCH' && i.units.length > 1)
      ? alertLines(i)
      : [];
  const lines = [
    `📊 <b>${i.dateLabel} — ${i.asOf} holati</b>`,
    ...body,
    ...alerts,
  ];
  if (!body.length && !alerts.length) lines.push("Bugun ma'lumot yo'q");
  const text = lines.join('\n');
  if (text.length <= TELEGRAM_LIMIT) return text;
  // ponytail: cut at a line break; a <pre> table this long would need paging.
  const cut = text.lastIndexOf('\n', TELEGRAM_LIMIT - 2);
  return `${text.slice(0, cut)}\n…`;
}
