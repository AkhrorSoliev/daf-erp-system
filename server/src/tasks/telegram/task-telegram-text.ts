import { Markup } from 'telegraf';
import type { InlineKeyboardButton } from 'telegraf/types';
import type { TaskKind, TaskPriority, TaskStatus } from '@prisma/client';
import {
  TASHKENT_OFFSET_MS,
  addDaysToDateStr,
  tashkentDateStr,
} from '../../common/date/tashkent';
import { escapeHtml } from '../../telegram-groups/utils/format.util';
import type { TgNotice } from '../task-notify-plan';
import { OPEN_STATUSES } from '../task-transitions';

/**
 * Everything a task message needs, loaded once per send (`loadTaskView`).
 * Names are short — «Soliyev A.» — as in the mockup (s14).
 */
export interface TgTaskView {
  id: string;
  companyId: number;
  kind: TaskKind;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: Date | null;
  requiresPhoto: boolean;
  authorId: number | null;
  authorName: string | null;
  entityLabel: string | null;
  participants: {
    userId: number;
    role: 'ASSIGNEE' | 'WATCHER';
    name: string;
  }[];
  steps: { id: string; title: string; done: boolean }[];
}

export type TgButtons = InlineKeyboardButton[][];
export interface TgMessage {
  text: string;
  buttons: TgButtons;
}
export interface TgListItem {
  id: string;
  title: string;
  dueAt: Date | null;
}

// ---------- what the bot says (mockup s14, s17) ----------
export const NOT_YOURS = 'Bu topshiriq sizda emas';
export const SEVERAL_ACCOUNTS =
  "Bu Telegram bir nechta xodim hisobiga bog'langan. Administrator bilan bog'laning.";
export const TEXT_ONLY =
  "Hozircha faqat matnli javob qabul qilinadi. Rasm, fayl va ovozni saytda qo'shing.";
export const ADDED_TO_TASK = "Topshiriqqa qo'shildi.";
export const RETURN_PROMPT =
  'Qaytarish sababini shu xabarga javob qilib yozing.';
export const RETURN_PLACEHOLDER = 'Qaytarish sababi';
export const NOT_IN_REVIEW = 'Topshiriq tekshiruvda emas';
export const STEP_GONE = 'Qadam topilmadi';
export const TRY_LATER = "Xatolik yuz berdi. Keyinroq urinib ko'ring.";
const PHOTO_LINE = "Rasm bilan tasdiqlanadi: rasm saytda qo'shiladi.";
const EMPTY_LIST = "Sizda ochiq topshiriq yo'q.";
const STEPS_HINT = 'Bosib belgilang yoki belgini olib tashlang';

/**
 * Plain text (a toast or a reply without `parse_mode`). Sent with HTML, the
 * names must go through `esc` first.
 */
export function returnedReply(assigneeNames: string[]): string {
  return assigneeNames.length
    ? `Topshiriq qaytarildi. ${assigneeNames.join(', ')} ga xabar ketdi.`
    : 'Topshiriq qaytarildi.';
}

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  LOW: 'Past',
  MEDIUM: "O'rta",
  HIGH: 'Yuqori',
  URGENT: 'Shoshilinch',
};
const STATUS_LABEL: Record<TaskStatus, string> = {
  NEW: 'Yangi',
  IN_PROGRESS: 'Jarayonda',
  IN_REVIEW: 'Tekshiruvda',
  DONE: 'Bajarildi',
  CANCELLED: 'Bekor qilingan',
};

// ---------- small helpers ----------
/**
 * Telegram HTML: every text that comes from a person (titles, names, comments,
 * reasons) goes through this one helper — the repo's shared `escapeHtml`.
 */
export const esc = escapeHtml;
/** Cuts by code points, so an emoji at the cut is never split in half. */
const clip = (s: string, n: number) => {
  const a = Array.from(s);
  return a.length > n ? a.slice(0, n).join('') + '…' : s;
};
const pad2 = (n: number) => String(n).padStart(2, '0');

/** «Soliyev A.» */
export function shortName(firstName: string, lastName: string): string {
  const first = firstName.trim();
  const last = lastName.trim();
  if (!last) return first;
  return first ? `${last} ${first[0]}.` : last;
}

/** `HH:mm` on the Tashkent clock. */
function hhmm(d: Date): string {
  const t = new Date(d.getTime() + TASHKENT_OFFSET_MS);
  return `${pad2(t.getUTCHours())}:${pad2(t.getUTCMinutes())}`;
}
/** `dd.MM` of the Tashkent day. */
function ddmm(d: Date): string {
  const [, month, day] = tashkentDateStr(d).split('-');
  return `${day}.${month}`;
}

/** «bugun, 13:00» · «ertaga, 08:30» · «09.10, 18:00» (Tashkent). */
export function dueLabel(dueAt: Date, now: Date): string {
  const day = tashkentDateStr(dueAt);
  const today = tashkentDateStr(now);
  const when =
    day === today
      ? 'bugun'
      : day === addDaysToDateStr(today, 1)
        ? 'ertaga'
        : ddmm(dueAt);
  return `${when}, ${hhmm(dueAt)}`;
}

const isOpen = (v: TgTaskView) => OPEN_STATUSES.includes(v.status);
const isAssignee = (v: TgTaskView, userId: number) =>
  v.participants.some((p) => p.userId === userId && p.role === 'ASSIGNEE');
const assigneeNames = (v: TgTaskView) =>
  v.participants
    .filter((p) => p.role === 'ASSIGNEE')
    .map((p) => p.name)
    .join(', ');

/** The author is the only assignee: «Bajardim» closes it, as on the website. */
export function isSelfTask(v: TgTaskView, userId: number): boolean {
  const a = v.participants.filter((p) => p.role === 'ASSIGNEE');
  return a.length === 1 && a[0].userId === userId && v.authorId === userId;
}

// ---------- callback data: `tk:<action>:<id>`, `tk:list` ----------
export type TkAction =
  | 'start'
  | 'done'
  | 'accept'
  | 'return'
  | 'steps'
  | 'back'
  | 'show'
  | 'step'
  | 'list';
const TK_RE =
  /^tk:(start|done|accept|return|steps|back|show|step|list)(?::([\w-]{1,48}))?$/;

/** Telegram refuses callback data over 64 bytes; ids are uuids (36). */
export function tkData(action: Exclude<TkAction, 'list'>, id: string): string {
  const data = `tk:${action}:${id}`;
  if (Buffer.byteLength(data) > 64) {
    throw new Error(`callback data over 64 bytes: ${data}`);
  }
  return data;
}

export function parseTk(data: string): { action: TkAction; id: string } | null {
  const m = TK_RE.exec(data);
  if (!m) return null;
  const action = m[1] as TkAction;
  const id = m[2] ?? '';
  if (action === 'list') return id ? null : { action, id };
  return id ? { action, id } : null;
}

/**
 * The pressed message's first line, kept when it is redrawn (mockup s14 #1:
 * «Yangi topshiriq · Yuqori» stays after «Boshladim»). A card (title first)
 * and the step list get the title instead.
 */
export function keptHeadline(
  messageText: string | undefined,
  title: string,
): string | undefined {
  const first = messageText?.split('\n')[0]?.trim();
  if (!first || first === title || first.startsWith('Kichik qadamlar')) {
    return undefined;
  }
  return first;
}

// ---------- the task message ----------
/** These carry the state buttons; the rest only «Ochish». */
const ACTION_NOTICES: ReadonlySet<TgNotice['kind']> = new Set([
  'ASSIGNED',
  'ADDED',
  'MOVED',
  'RETURNED',
  'REVIEW',
  'REMINDER',
  'CARD',
]);
/** Short messages: headline, title, one or two lines, nothing else. */
const INFO_ONLY: ReadonlySet<TgNotice['kind']> = new Set([
  'REMOVED',
  'ACCEPTED',
  'COMMENT',
  'DONE',
  'CANCELLED',
]);

/** The reminder fires an hour ahead; under this many minutes it says how many are left. */
const REMINDER_EXACT_BELOW_MS = 50 * 60_000;

function reminderHeadline(dueAt: Date | null, now: Date): string {
  if (dueAt) {
    const ms = dueAt.getTime() - now.getTime();
    if (ms < REMINDER_EXACT_BELOW_MS) {
      const minutes = Math.max(1, Math.ceil(ms / 60_000));
      return `Muddat tugashiga ${minutes} daqiqa qoldi`;
    }
  }
  return '1 soatdan keyin muddat tugaydi';
}

function headline(view: TgTaskView, n: TgNotice, now: Date): string {
  switch (n.kind) {
    case 'ASSIGNED':
      return `Yangi topshiriq · ${PRIORITY_LABEL[view.priority]}`;
    case 'ADDED':
      return "Siz topshiriqqa qo'shildingiz";
    case 'MOVED':
      return "Topshiriq sizga o'tdi";
    case 'REMOVED':
      return 'Topshiriqdan olib tashlandingiz';
    case 'REVIEW':
      return 'Tekshiruvga keldi';
    case 'ACCEPTED':
      return 'Qabul qilindi';
    case 'RETURNED':
      return 'Topshiriq qaytarildi';
    case 'COMMENT':
      return 'Yangi izoh';
    case 'DONE':
      return 'Bajarildi';
    case 'CANCELLED':
      return 'Bekor qilindi';
    case 'REMINDER':
      return reminderHeadline(view.dueAt, now);
    case 'OVERDUE':
      return "Muddati o'tdi";
    case 'CARD':
      return n.headline ?? view.title;
  }
}

function noticeLines(
  view: TgTaskView,
  n: TgNotice,
  viewerId: number,
): string[] {
  switch (n.kind) {
    case 'ADDED':
      return [`Qo'shdi: ${esc(n.by)}`];
    case 'MOVED':
      return [`Oldingi ijrochi: ${esc(n.from)}`];
    case 'REMOVED':
      return [`Olib tashladi: ${esc(n.by)}`];
    case 'REVIEW':
      return [`Ijrochi: ${esc(n.by)}`];
    case 'ACCEPTED':
      return [`${esc(n.by)} qabul qildi. Rahmat.`];
    case 'RETURNED':
      return [`${esc(n.by)}: «${esc(clip(n.reason, 300))}»`];
    case 'COMMENT':
      return [`${esc(n.by)}: «${esc(clip(n.text, 300))}»`];
    case 'DONE':
      return [
        `Ijrochi: ${esc(assigneeNames(view))}`,
        `Qabul qildi: ${esc(n.by)}`,
      ];
    case 'CANCELLED':
      return [`Bekor qildi: ${esc(n.by)}`];
    case 'OVERDUE':
      // The author's copy says whose it is (mockup s14 #6).
      return isAssignee(view, viewerId) || !assigneeNames(view)
        ? []
        : [`Ijrochi: ${esc(assigneeNames(view))}`];
    default:
      return [];
  }
}

function bodyLines(
  view: TgTaskView,
  n: TgNotice,
  viewerId: number,
  now: Date,
): string[] {
  const out: string[] = [];
  if (view.authorId !== viewerId && n.kind !== 'REVIEW') {
    out.push(`Bergan: ${esc(view.authorName ?? 'Tizim')}`);
  }
  if (view.dueAt) out.push(`Muddat: ${dueLabel(view.dueAt, now)}`);
  if (view.entityLabel) out.push(`Bog'liq: ${esc(view.entityLabel)}`);
  if (view.steps.length) {
    const done = view.steps.filter((s) => s.done).length;
    out.push(`Kichik qadamlar: ${done}/${view.steps.length}`);
  }
  if (view.status !== 'NEW') out.push(`Holat: ${STATUS_LABEL[view.status]}`);
  if (view.requiresPhoto && isOpen(view) && isAssignee(view, viewerId)) {
    out.push(PHOTO_LINE);
  }
  return out;
}

const cb = (text: string, data: string) => Markup.button.callback(text, data);

/** What the reader can do to the task now; the service has the last word. */
function stateButtons(view: TgTaskView, viewerId: number): TgButtons {
  // A system task is done in its own place on the website (spec §6.1).
  if (view.kind !== 'MANUAL' || !isOpen(view)) return [];
  const assignee = isAssignee(view, viewerId);
  const author = view.authorId === viewerId;
  const rows: TgButtons = [];
  if (assignee && view.status !== 'IN_REVIEW') {
    const row: InlineKeyboardButton[] = [];
    if (view.status === 'NEW') {
      row.push(cb('Boshladim', tkData('start', view.id)));
    }
    // A photo is added on the website only until phase 3: no «Bajardim» here.
    if (!view.requiresPhoto) row.push(cb('Bajardim', tkData('done', view.id)));
    if (row.length) rows.push(row);
  }
  if (author && view.status === 'IN_REVIEW') {
    rows.push([
      cb('Qabul qilish', tkData('accept', view.id)),
      cb('Qaytarish', tkData('return', view.id)),
    ]);
  }
  if (
    view.steps.length &&
    (assignee || author) &&
    view.status !== 'IN_REVIEW'
  ) {
    rows.push([cb('Qadamlar', tkData('steps', view.id))]);
  }
  return rows;
}

export function renderTaskMessage(
  view: TgTaskView,
  notice: TgNotice,
  viewerId: number,
  opts: { now: Date; openUrl?: string },
): TgMessage {
  const lines = [`<b>${esc(headline(view, notice, opts.now))}</b>`];
  if (notice.kind !== 'CARD' || notice.headline) lines.push(esc(view.title));
  lines.push(...noticeLines(view, notice, viewerId));
  if (!INFO_ONLY.has(notice.kind)) {
    lines.push(...bodyLines(view, notice, viewerId, opts.now));
  }
  const buttons: TgButtons = [];
  if (notice.kind !== 'REMOVED') {
    if (ACTION_NOTICES.has(notice.kind)) {
      buttons.push(...stateButtons(view, viewerId));
    }
    if (opts.openUrl) {
      buttons.push([Markup.button.url('Ochish', opts.openUrl)]);
    }
  }
  return { text: lines.join('\n'), buttons };
}

/** «Qadamlar» pressed: the message becomes the step list (mockup s17). */
export function renderStepsMessage(view: TgTaskView): TgMessage {
  const done = view.steps.filter((s) => s.done).length;
  return {
    text: `<b>Kichik qadamlar · ${done}/${view.steps.length}</b>\n${STEPS_HINT}`,
    buttons: [
      ...view.steps.map((s, i) => [
        cb(
          `${s.done ? '✓ ' : ''}${i + 1}. ${clip(s.title, 48)}`,
          tkData('step', s.id),
        ),
      ]),
      [cb('Orqaga', tkData('back', view.id))],
    ],
  };
}

const GROUP_TITLE = ["Muddati o'tgan", 'Bugun', 'Keyinroq'];

/**
 * «Topshiriqlarim» (mockup s14 #10). `items` come sorted by due date, the
 * undated last, so the three groups follow each other.
 */
export function renderMyTasks(
  items: TgListItem[],
  total: number,
  now: Date,
): TgMessage {
  if (items.length === 0) return { text: EMPTY_LIST, buttons: [] };
  const today = tashkentDateStr(now);
  const groupOf = (it: TgListItem) =>
    it.dueAt && it.dueAt.getTime() < now.getTime()
      ? 0
      : it.dueAt && tashkentDateStr(it.dueAt) === today
        ? 1
        : 2;
  const lines = [`<b>Ochiq topshiriqlar: ${total}</b>`];
  let last = -1;
  items.forEach((it, i) => {
    const g = groupOf(it);
    if (g !== last) {
      lines.push(`<b>${GROUP_TITLE[g]}</b>`);
      last = g;
    }
    const when = it.dueAt
      ? tashkentDateStr(it.dueAt) === today
        ? hhmm(it.dueAt)
        : ddmm(it.dueAt)
      : '';
    lines.push(
      `${i + 1}. ${esc(clip(it.title, 60))}${when ? `, ${when}` : ''}`,
    );
  });
  if (total > items.length) {
    lines.push(`Yana ${total - items.length} ta topshiriq saytda.`);
  }
  const numbers = items.map((it, i) =>
    cb(String(i + 1), tkData('show', it.id)),
  );
  const buttons: TgButtons = [];
  for (let i = 0; i < numbers.length; i += 5) {
    buttons.push(numbers.slice(i, i + 5));
  }
  return { text: lines.join('\n'), buttons };
}

/** `sendMessage` / `reply` options: HTML, and the keyboard when there is one. */
export function messageExtra(buttons: TgButtons): {
  parse_mode: 'HTML';
  reply_markup?: { inline_keyboard: TgButtons };
} {
  return buttons.length
    ? { parse_mode: 'HTML', reply_markup: { inline_keyboard: buttons } }
    : { parse_mode: 'HTML' };
}

/** `editMessageText` options: the keyboard always goes, so an empty one clears the old buttons. */
export function editExtra(buttons: TgButtons): {
  parse_mode: 'HTML';
  reply_markup: { inline_keyboard: TgButtons };
} {
  return { parse_mode: 'HTML', reply_markup: { inline_keyboard: buttons } };
}
