import { Injectable } from '@nestjs/common';
import { DigestEntry } from './telegram-group-digest-buffer.service';
import { TG_GROUP_DIGEST_MAX_ITEMS } from './constants';
import { formatDate, formatSum } from './utils/format.util';

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Naqd',
  PAYME: 'Payme',
  CLICK: 'Click',
  UZUM: 'Uzum',
  TRANSFER: "O'tkazma",
};

/** Escapes the 3 characters Telegram's HTML parse mode is sensitive to. */
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** HH:MM in Asia/Tashkent (fixed UTC+5, no DST). */
function tashkentHm(d: Date): string {
  const t = new Date(d.getTime() + 5 * 60 * 60 * 1000);
  const hh = String(t.getUTCHours()).padStart(2, '0');
  const mm = String(t.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Composes the consolidated digest message from a batch of buffered events.
 *
 * The cron passes already branch-filtered entries — this service only formats.
 * Returns `null` when there is nothing to report so the cron stays silent.
 */
@Injectable()
export class TelegramGroupDigestService {
  build(
    companyName: string,
    entries: DigestEntry[],
    now: Date = new Date(),
  ): string | null {
    if (entries.length === 0) return null;

    const students = entries.filter(
      (e): e is Extract<DigestEntry, { kind: 'student' }> =>
        e.kind === 'student',
    );
    const payments = entries.filter(
      (e): e is Extract<DigestEntry, { kind: 'payment' }> =>
        e.kind === 'payment',
    );
    const groups = entries.filter(
      (e): e is Extract<DigestEntry, { kind: 'group' }> => e.kind === 'group',
    );

    // Time window: earliest buffered event → flush time.
    const earliest = entries.reduce(
      (min, e) => (e.at < min ? e.at : min),
      entries[0].at,
    );
    const windowLabel = `${tashkentHm(new Date(earliest))} – ${tashkentHm(now)}`;

    const blocks: string[] = [
      `📋 <b>So'nggi yangiliklar</b> — ${escapeHtml(companyName)}`,
      `🕐 ${windowLabel}`,
    ];

    if (students.length > 0) {
      blocks.push('', this.studentsBlock(students));
    }
    if (payments.length > 0) {
      blocks.push('', this.paymentsBlock(payments));
    }
    if (groups.length > 0) {
      blocks.push('', this.groupsBlock(groups));
    }

    return blocks.join('\n');
  }

  private studentsBlock(
    items: Extract<DigestEntry, { kind: 'student' }>[],
  ): string {
    const lines = this.capped(items, (s) => {
      const branch = s.branchName ? ` — ${escapeHtml(s.branchName)}` : '';
      return `• ${escapeHtml(s.name)}${branch}`;
    });
    return [`👨‍🎓 <b>Yangi o'quvchilar (${items.length})</b>`, ...lines].join(
      '\n',
    );
  }

  private paymentsBlock(
    items: Extract<DigestEntry, { kind: 'payment' }>[],
  ): string {
    const total = items.reduce((sum, p) => sum + p.amount, 0);
    const lines = this.capped(items, (p) => {
      const method = METHOD_LABELS[p.method] ?? p.method;
      return `• ${escapeHtml(p.studentName)} — <b>${formatSum(p.amount)}</b> (${method})`;
    });
    return [
      `💳 <b>To'lovlar (${items.length})</b> — jami <b>${formatSum(total)}</b>`,
      ...lines,
    ].join('\n');
  }

  private groupsBlock(
    items: Extract<DigestEntry, { kind: 'group' }>[],
  ): string {
    const lines = this.capped(items, (g) => {
      const branch = g.branchName ? ` — ${escapeHtml(g.branchName)}` : '';
      const start = g.startDate ? ` (${formatDate(g.startDate)})` : '';
      return `• ${escapeHtml(g.name)}${branch}${start}`;
    });
    return [`👥 <b>Yangi guruhlar (${items.length})</b>`, ...lines].join('\n');
  }

  /** Renders up to `TG_GROUP_DIGEST_MAX_ITEMS` lines, collapsing the rest. */
  private capped<T>(items: T[], render: (item: T) => string): string[] {
    const shown = items.slice(0, TG_GROUP_DIGEST_MAX_ITEMS).map(render);
    const overflow = items.length - shown.length;
    if (overflow > 0) {
      shown.push(`• <i>... va yana ${overflow} ta</i>`);
    }
    return shown;
  }
}
