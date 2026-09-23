import { Injectable } from '@nestjs/common';
import { TG_GROUP_DIGEST_MAX_ITEMS } from './constants';
import { TelegramDigestCategory } from '@prisma/client';
import { TASHKENT_OFFSET_MS, tashkentDateStr } from '../common/date/tashkent';
import { PAYMENT_METHOD_LABEL } from '../payments/shared/method-label';
import { DIGEST_REASON_MAX_CHARS } from '../telegram-digest/telegram-digest.constants';
import {
  DedupedRow,
  dedupRows,
} from '../telegram-digest/telegram-digest-dedup';
import {
  GroupStatusTransition,
  payloadOf,
  TelegramDigestItemRow,
} from '../telegram-digest/telegram-digest-payloads';
import {
  clipText,
  DigestBlock,
  header,
  spacer,
} from '../telegram-digest/telegram-message-parts';
import { escapeHtml, formatDate, formatSum } from './utils/format.util';

const TRANSITION_TEXT: Record<
  GroupStatusTransition,
  { icon: string; verb: string }
> = {
  GROUP_STARTED: { icon: '🚀', verb: 'boshlandi' },
  GROUP_COMPLETED: { icon: '🏁', verb: 'tugadi' },
  STUDENT_FROZEN: { icon: '❄️', verb: 'muzlatildi' },
  STUDENT_EXPELLED: { icon: '🚫', verb: 'chetlatildi' },
  STUDENT_GRADUATED: { icon: '🎓', verb: 'bitirdi' },
  STUDENT_REACTIVATED: { icon: '✅', verb: 'qaytadan faol' },
};

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 'HH:MM', or 'DD.MM HH:MM' when `withDate` (Asia/Tashkent, fixed UTC+5). */
function tashkentStamp(d: Date, withDate: boolean): string {
  const t = new Date(d.getTime() + TASHKENT_OFFSET_MS);
  const hm = `${pad2(t.getUTCHours())}:${pad2(t.getUTCMinutes())}`;
  return withDate
    ? `${pad2(t.getUTCDate())}.${pad2(t.getUTCMonth() + 1)} ${hm}`
    : hm;
}

const sameTashkentDay = (a: Date, b: Date) =>
  tashkentDateStr(a) === tashkentDateStr(b);

/**
 * Composes the 20:00 group digest (ADR-0025) from queued GROUP rows the cron
 * has already filtered to one Telegram group. Formatting only — no I/O.
 */
@Injectable()
export class TelegramGroupDigestService {
  /**
   * The 20:00 group digest (ADR-0025) from queued GROUP rows the cron has
   * already filtered to one Telegram group. Returns null when there is
   * nothing to show. Every row id lands in exactly one block — overflow
   * lines carry the ids they hide — so the cron can mark delivery per part.
   */
  buildBlocks(
    companyName: string,
    rows: TelegramDigestItemRow[],
    now: Date = new Date(),
  ): DigestBlock[] | null {
    const entries = dedupRows(rows);
    const of = (category: TelegramDigestCategory) =>
      entries.filter((e) => e.row.category === category);
    const students = of(TelegramDigestCategory.GROUP_NEW_STUDENT);
    const payments = of(TelegramDigestCategory.GROUP_PAYMENT);
    const groups = of(TelegramDigestCategory.GROUP_NEW_GROUP);
    const changes = of(TelegramDigestCategory.GROUP_STATUS_CHANGE);
    if (
      students.length + payments.length + groups.length + changes.length ===
      0
    ) {
      return null;
    }

    const earliest = rows.reduce(
      (min, r) => (r.createdAt < min ? r.createdAt : min),
      rows[0].createdAt,
    );
    const multiDay = !sameTashkentDay(earliest, now);
    const blocks: DigestBlock[] = [
      {
        text: [
          `📋 <b>So'nggi yangiliklar</b> — ${escapeHtml(companyName)}`,
          `🕐 ${tashkentStamp(earliest, multiDay)} – ${tashkentStamp(now, multiDay)}`,
        ].join('\n'),
        itemIds: [],
      },
    ];

    if (students.length > 0) {
      blocks.push(
        spacer(),
        header(`👨‍🎓 <b>Yangi o'quvchilar (${students.length})</b>`),
        ...this.branchBlocks(
          students,
          (e) =>
            payloadOf(e.row, TelegramDigestCategory.GROUP_NEW_STUDENT)
              .branchName,
          (e) =>
            escapeHtml(
              payloadOf(e.row, TelegramDigestCategory.GROUP_NEW_STUDENT).name,
            ),
        ),
      );
    }
    if (payments.length > 0) {
      const total = payments.reduce(
        (sum, e) =>
          sum + payloadOf(e.row, TelegramDigestCategory.GROUP_PAYMENT).amount,
        0,
      );
      blocks.push(
        spacer(),
        header(
          `💳 <b>Yirik va onlayn to'lovlar (${payments.length})</b> — jami <b>${formatSum(total)}</b>`,
        ),
        ...this.cappedBlocks(payments, (e) => {
          const p = payloadOf(e.row, TelegramDigestCategory.GROUP_PAYMENT);
          const method = PAYMENT_METHOD_LABEL[p.method] ?? p.method;
          return `${escapeHtml(p.studentName)} — <b>${formatSum(p.amount)}</b> (${escapeHtml(method)})`;
        }),
      );
    }
    if (groups.length > 0) {
      blocks.push(
        spacer(),
        header(`👥 <b>Yangi guruhlar (${groups.length})</b>`),
        ...this.branchBlocks(
          groups,
          (e) =>
            payloadOf(e.row, TelegramDigestCategory.GROUP_NEW_GROUP).branchName,
          (e) => {
            const p = payloadOf(e.row, TelegramDigestCategory.GROUP_NEW_GROUP);
            const start = p.startDate ? ` (${formatDate(p.startDate)})` : '';
            return `${escapeHtml(p.name)}${start}`;
          },
        ),
      );
    }
    if (changes.length > 0) {
      blocks.push(
        spacer(),
        header(`🔄 <b>Holat o'zgarishlari (${changes.length})</b>`),
        ...this.branchBlocks(
          changes,
          (e) =>
            payloadOf(e.row, TelegramDigestCategory.GROUP_STATUS_CHANGE)
              .branchName,
          (e) => this.statusLine(e.row, now),
        ),
      );
    }
    return blocks;
  }

  /** `icon subject: verb — sabab: … · Actor (Role), time` — one line per change. */
  private statusLine(row: TelegramDigestItemRow, now: Date): string {
    const p = payloadOf(row, TelegramDigestCategory.GROUP_STATUS_CHANGE);
    const { icon, verb } = TRANSITION_TEXT[p.transition];
    const subject =
      p.entityType === 'Group'
        ? `${escapeHtml(p.name)} guruhi`
        : escapeHtml(p.name);
    const reason = p.reason
      ? ` — sabab: ${escapeHtml(clipText(p.reason, DIGEST_REASON_MAX_CHARS))}`
      : '';
    const role = p.actorRole ? ` (${escapeHtml(p.actorRole)})` : '';
    const actor = p.actorName ? ` · ${escapeHtml(p.actorName)}${role}` : '';
    const time = tashkentStamp(
      row.createdAt,
      !sameTashkentDay(row.createdAt, now),
    );
    return `${icon} ${subject}: ${verb}${reason}${actor}, ${time}`;
  }

  /** Up to `TG_GROUP_DIGEST_MAX_ITEMS` bullet lines; the rest collapse into one. */
  private cappedBlocks(
    entries: DedupedRow[],
    render: (entry: DedupedRow) => string,
  ): DigestBlock[] {
    const shown = entries.slice(0, TG_GROUP_DIGEST_MAX_ITEMS);
    const hidden = entries.slice(TG_GROUP_DIGEST_MAX_ITEMS);
    const blocks: DigestBlock[] = shown.map((e) => ({
      text: `• ${render(e)}`,
      itemIds: e.ids,
    }));
    if (hidden.length > 0) {
      blocks.push({
        text: `• <i>... va yana ${hidden.length} ta</i>`,
        itemIds: hidden.flatMap((e) => e.ids),
      });
    }
    return blocks;
  }

  /**
   * One `🏢 <branch> (N)` sub-header per branch, branchless entries last and
   * without a header — the same layout as the old digest. The section cap
   * counts bullet lines only; the overflow line carries the hidden ids.
   */
  private branchBlocks(
    entries: DedupedRow[],
    branchOf: (entry: DedupedRow) => string | null,
    render: (entry: DedupedRow) => string,
  ): DigestBlock[] {
    const NO_BRANCH = '\u0000'; // sentinel: no branch name can match it
    const order: string[] = [];
    const buckets = new Map<string, DedupedRow[]>();
    for (const entry of entries) {
      const key = branchOf(entry) ?? NO_BRANCH;
      if (!buckets.has(key)) {
        buckets.set(key, []);
        if (key !== NO_BRANCH) order.push(key);
      }
      buckets.get(key)!.push(entry);
    }
    if (buckets.has(NO_BRANCH)) order.push(NO_BRANCH);

    const blocks: DigestBlock[] = [];
    const hiddenIds: string[] = [];
    let hiddenCount = 0;
    let rendered = 0;
    for (const key of order) {
      const bucket = buckets.get(key)!;
      const room = Math.max(TG_GROUP_DIGEST_MAX_ITEMS - rendered, 0);
      const shown = bucket.slice(0, room);
      const hidden = bucket.slice(room);
      if (shown.length > 0 && key !== NO_BRANCH) {
        blocks.push(header(`🏢 <b>${escapeHtml(key)}</b> (${bucket.length})`));
      }
      for (const e of shown)
        blocks.push({ text: `• ${render(e)}`, itemIds: e.ids });
      rendered += shown.length;
      hiddenCount += hidden.length;
      hiddenIds.push(...hidden.flatMap((e) => e.ids));
    }
    if (hiddenCount > 0) {
      blocks.push({
        text: `• <i>... va yana ${hiddenCount} ta</i>`,
        itemIds: hiddenIds,
      });
    }
    return blocks;
  }
}
