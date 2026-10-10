import { formatSom } from '../payments/shared/format-som';
import { escapeHtml } from '../telegram-groups/utils/format.util';

/** A broken promise on a smaller debt raises no alert (CEO, 10.10.2026). */
export const MIN_ALERT_DEBT = 1_000;

const ADMIN_DEBT_PAGE =
  'https://admin.dafzentrum.uz/payments/debt?promise=broken';
const TELEGRAM_CHUNK = 3_900;

export interface OverdueDigestItem {
  /** «Familiya Ism» */
  studentName: string;
  /** Today's debt, positive. */
  debt: number;
  /** The debt when the promise was written (or last moved), positive. */
  debtAtPromise: number;
  groups: { name: string; teacher: string | null; frozen: boolean }[];
  phone: string | null;
  parentPhone: string | null;
  /** YYYY-MM-DD, the promised Tashkent day. */
  promiseDate: string;
  comment: string | null;
  /** Who wrote the promise, «Familiya I.» */
  createdBy: string | null;
  /** Broken promises of the student, this one included. */
  brokenCount: number;
}

export interface OverdueDigest {
  title: string;
  /** Bell and push: the names, short. */
  summary: string;
  /** Telegram HTML, split under the message limit. */
  telegram: string[];
}

const dm = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}`;
const som = (n: number) => `${formatSom(n)} so'm`;

export function formatUzPhone(raw: string | null): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D/g, '');
  if (d.length === 9) {
    return `+998 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 7)} ${d.slice(7)}`;
  }
  return d.length > 0 ? `+${d}` : null;
}

export function shortName(u: { firstName: string; lastName: string }): string {
  const initial = u.firstName.trim().charAt(0);
  return `${u.lastName.trim()}${initial ? ` ${initial}.` : ''}`;
}

function itemBlock(item: OverdueDigestItem, n: number): string {
  const groups =
    item.groups.length > 0
      ? item.groups
          .map(
            (g) =>
              `${escapeHtml(g.name)}${g.teacher ? `, ustoz ${escapeHtml(g.teacher)}` : ''}${g.frozen ? ' (muzlatilgan)' : ''}`,
          )
          .join('; ')
      : 'guruhsiz';
  const phones = [
    formatUzPhone(item.phone),
    formatUzPhone(item.parentPhone) &&
      `ota-ona ${formatUzPhone(item.parentPhone)}`,
  ].filter(Boolean);
  const comment = item.comment?.trim();
  const shortComment =
    comment && comment.length > 80 ? `${comment.slice(0, 79)}…` : comment;
  const since =
    item.debtAtPromise === item.debt
      ? "Va'dadan beri to'lov yo'q"
      : `Va'da paytida qarz ${som(item.debtAtPromise)} edi`;
  return [
    `${n}. <b>${escapeHtml(item.studentName)}</b> — qarz ${som(item.debt)}`,
    `   ${groups}${phones.length > 0 ? ` · 📞 ${phones.join(' · ')}` : ''}`,
    `   Va'da: ${dm(item.promiseDate)}${shortComment ? ` · «${escapeHtml(shortComment)}»` : ''}${item.createdBy ? ` (${escapeHtml(item.createdBy)})` : ''}`,
    `   ${since}${item.brokenCount > 1 ? ` · ${item.brokenCount}-marta buzildi` : ''}`,
  ].join('\n');
}

/**
 * The 09:00 list of one branch's promises that were not kept, one message for
 * the branch instead of one per student.
 */
export function overdueDigest(
  items: OverdueDigestItem[],
  branchName: string | null,
  today: string,
): OverdueDigest {
  const title = `Bugun ${items.length} ta to'lov va'dasi bajarilmadi`;
  const names = items.map((i) => i.studentName);
  const summary =
    (names.length > 3
      ? `${names.slice(0, 3).join(', ')} va yana ${names.length - 3} ta`
      : names.join(', ')) + " — qo'ng'iroq qiling";

  const header = `⏰ <b>${title}</b>\n${escapeHtml(branchName ?? 'Filialsiz')} · ${dm(today)}`;
  const footer = `Qo'ng'iroq qilib, natijasini «Qo'ng'iroq natijasi»ga yozing.\n${ADMIN_DEBT_PAGE}`;

  const telegram: string[] = [];
  let current = header;
  items.forEach((item, idx) => {
    const block = itemBlock(item, idx + 1);
    if (current.length + block.length + 2 > TELEGRAM_CHUNK) {
      telegram.push(current);
      current = block;
    } else {
      current += `\n\n${block}`;
    }
  });
  if (current.length + footer.length + 2 > TELEGRAM_CHUNK) {
    telegram.push(current);
    current = footer;
  } else {
    current += `\n\n${footer}`;
  }
  telegram.push(current);

  return { title, summary, telegram };
}
