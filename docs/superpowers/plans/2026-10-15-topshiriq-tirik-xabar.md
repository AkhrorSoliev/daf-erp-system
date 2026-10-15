# Topshiriq tirik xabari — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each person gets ONE live Telegram card per task; every task change edits all live cards (per-viewer text, «who did it»), and «Ochish» opens the task inside the staff Mini App.

**Architecture:** A new `TaskTelegramPurpose.CARD` marks live cards. `renderLiveCard` (pure) draws a card from the task's current state + its last status events (`TgTaskView.history`). `TaskTelegramSender.send` turns every status notice into a first CARD (or skips it when the person already has one in that chat). A new `TaskTelegramLive.refresh(taskId)` edits every CARD row of the task; `TaskTelegramListener` calls it after each state event. Spec: `docs/superpowers/specs/2026-10-14-topshiriq-tirik-xabar-design.md`.

**Tech Stack:** NestJS, Prisma (Postgres), Telegraf, Jest (server); Next.js + Vitest (client).

## Global Constraints

- Worktree: `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriq-tirik-xabar`, branch `feat/topshiriq-tirik-xabar`. Never `cd` outside it. Run `npm install` in `server/` and `client/` once before the first test run; `npx prisma generate` in `server/`.
- Server tests: `cd server && npx jest <path>`. Typecheck: `npm run typecheck`. Lint: `npx eslint <files>`. Format: `npx prettier --write <touched server .ts files>` (NEVER prettier on `client/`).
- Client tests: `cd client && npx vitest run <path>`.
- Commit messages and new code comments in English; Uzbek only for UI strings. End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Status notices (become CARDs): `ASSIGNED`, `ADDED`, `MOVED`, `REVIEW`, `ACCEPTED`, `RETURNED`, `DONE`, `CANCELLED`. `REMOVED` is never sent (the removed person's card is edited). `COMMENT`, `REMINDER`, `OVERDUE` stay NOTICE messages, unchanged.
- Edits ignore the night quiet (silent). First CARD messages keep the night quiet / retry rules.
- UI strings exactly as in the spec §3.3 table.

---

### Task 1: `CARD` purpose — schema, migration, replies

**Files:**
- Modify: `server/prisma/schema.prisma` (enum `TaskTelegramPurpose`, ~line 212)
- Create: `server/prisma/migrations/20261015090000_task_telegram_card/migration.sql`
- Modify: `server/src/tasks/telegram/task-telegram-replies.ts` (switch at ~line 120)
- Test: `server/src/tasks/telegram/task-telegram-replies.spec.ts`

**Interfaces:**
- Produces: `TaskTelegramPurpose = 'NOTICE' | 'RETURN_PROMPT' | 'PHOTO_PROMPT' | 'CARD'`.

- [ ] **Step 1: Schema + migration**

In `schema.prisma`:

```prisma
enum TaskTelegramPurpose {
  NOTICE
  RETURN_PROMPT
  /// «Rasmni shu xabarga javob qilib yuboring» (phase 3): a photo reply sends the task to review.
  PHOTO_PROMPT
  /// The person's live card (ADR-0089): edited on every task change.
  CARD
}
```

`migration.sql`:

```sql
ALTER TYPE "TaskTelegramPurpose" ADD VALUE IF NOT EXISTS 'CARD';
```

Run: `cd server && npx prisma generate` — expected: generates without error.

- [ ] **Step 2: Failing test** — in `task-telegram-replies.spec.ts`, copy the existing test that sends a text reply to a `NOTICE` link and asserts `tasks.addComment` was called; make a second one with `purpose: 'CARD'` and the same expectations (`addComment(taskId, text, actor)` + the `ADDED_TO_TASK` ack). Also copy the existing "file reply to NOTICE is stored" test with `purpose: 'CARD'` (expects `files.upload` called and no `changeStatus`).

Run: `npx jest src/tasks/telegram/task-telegram-replies` — expected: the CARD text test FAILS (`addComment` not called).

- [ ] **Step 3: Implement** — in the `switch (link.purpose)`:

```ts
        case 'NOTICE':
        case 'CARD':
          await this.tasks.addComment(link.taskId, text, me.actor);
          await this.ack(ctx, ADDED_TO_TASK);
          break;
```

(`storeAttachment` already treats every purpose except `RETURN_PROMPT`/`PHOTO_PROMPT` as a plain file — no change.)

- [ ] **Step 4:** `npx jest src/tasks/telegram/task-telegram-replies` — PASS.
- [ ] **Step 5: Commit** — `git add prisma/schema.prisma prisma/migrations/20261015090000_task_telegram_card src/tasks/telegram/task-telegram-replies.ts src/tasks/telegram/task-telegram-replies.spec.ts && git commit -m "feat(tasks): CARD purpose for the live Telegram card"`

---

### Task 2: `TgTaskView.history` — who did what

**Files:**
- Modify: `server/src/tasks/telegram/task-telegram-text.ts` (interface `TgTaskView`)
- Modify: `server/src/tasks/telegram/task-telegram-view.ts` (`loadTaskView`)
- Test: `server/src/tasks/telegram/task-telegram-view.spec.ts`
- Modify every spec fixture that builds a `TgTaskView` by hand (add `history: []`): `grep -rln "requiresPhoto: false" src/tasks/telegram/*.spec.ts`.

**Interfaces:**
- Produces:

```ts
export interface TgHistoryItem {
  type: 'STATUS' | 'RETURN' | 'CANCELLED' | 'AUTO_CLOSED';
  /** STATUS only: the status it moved to (`meta.to`). */
  to: TaskStatus | null;
  actorId: number | null;
  /** «Soliyev A.»; null = Tizim. */
  actorName: string | null;
  /** RETURN / CANCELLED reason. */
  text: string | null;
  at: Date;
}
// TgTaskView gains: history: TgHistoryItem[]; // newest first, at most 10
```

- [ ] **Step 1: Failing test** in `task-telegram-view.spec.ts` (same mocking style as the existing `loadTaskView` tests): the mocked `task.findUnique` returns `events: [{ type: 'STATUS', actorId: 40, text: null, meta: { from: 'IN_PROGRESS', to: 'IN_REVIEW' }, createdAt: new Date('2026-10-14T10:00:00Z'), actor: { firstName: 'Bobur', lastName: 'Karimov' } }, { type: 'RETURN', actorId: 30, text: 'Rasm yo‘q', meta: { from: 'IN_REVIEW', to: 'IN_PROGRESS' }, createdAt: new Date('2026-10-14T09:00:00Z'), actor: { firstName: 'Ahror', lastName: 'Soliyev' } }]`. Expect:

```ts
expect(view!.history).toEqual([
  { type: 'STATUS', to: 'IN_REVIEW', actorId: 40, actorName: 'Karimov B.', text: null, at: new Date('2026-10-14T10:00:00Z') },
  { type: 'RETURN', to: null, actorId: 30, actorName: 'Soliyev A.', text: 'Rasm yo‘q', at: new Date('2026-10-14T09:00:00Z') },
]);
```

and that `findUnique` was called with `select.events` = `{ where: { type: { in: ['STATUS', 'RETURN', 'CANCELLED', 'AUTO_CLOSED'] } }, orderBy: { createdAt: 'desc' }, take: 10, select: { type: true, actorId: true, text: true, meta: true, createdAt: true, actor: { select: { firstName: true, lastName: true } } } }`.

- [ ] **Step 2:** run, expect FAIL.
- [ ] **Step 3: Implement** — add the `TgHistoryItem` interface and `history` field to `task-telegram-text.ts`; in `loadTaskView` add the `events` select above and map:

```ts
    history: t.events.map((e) => ({
      type: e.type as TgHistoryItem['type'],
      to:
        e.type === 'STATUS'
          ? ((e.meta as { to?: TaskStatus } | null)?.to ?? null)
          : null,
      actorId: e.actorId,
      actorName: e.actor ? shortName(e.actor.firstName, e.actor.lastName) : null,
      text: e.text,
      at: e.createdAt,
    })),
```

Add `history: []` to every hand-built view fixture so `npm run typecheck` stays green.

- [ ] **Step 4:** `npx jest src/tasks/telegram && npm run typecheck` — PASS / 0 errors.
- [ ] **Step 5: Commit** — `feat(tasks): task view carries its last status events`

---

### Task 3: `renderLiveCard` — the per-viewer card (pure)

**Files:**
- Modify: `server/src/tasks/telegram/task-telegram-text.ts`
- Create: `server/src/tasks/telegram/task-telegram-live-card.spec.ts`

**Interfaces:**
- Consumes: `TgTaskView.history` (Task 2); existing `stateButtons`, `esc`, `dueLabel`, `ddmm`, `hhmm`, `PRIORITY_LABEL`, `Markup`.
- Produces:

```ts
export const STATUS_NOTICES: ReadonlySet<TgNotice['kind']>; // ASSIGNED ADDED MOVED REVIEW ACCEPTED RETURNED DONE CANCELLED
export function renderLiveCard(
  view: TgTaskView,
  viewerId: number,
  opts: { now: Date; openUrl?: string },
): TgMessage;
```

`openUrl` button is built by `openButton(url)` = `Markup.button.webApp('Ochish', url)` (Task 7 switches the URL itself; the button type changes here, for every message — also replace `Markup.button.url('Ochish', …)` in `renderTaskMessage` with `openButton`).

- [ ] **Step 1: Failing tests** — `task-telegram-live-card.spec.ts`. Fixture: author 30 «Soliyev A.», assignees 40 «Karimov B.» and 41 «Rahimov A.», watcher 50 «Aliyev C.», title «Banner», priority HIGH, `kind: 'MANUAL'`. Helper `ev(type, to, actorId, actorName, at, text = null)`. `T = new Date('2026-10-14T10:30:00Z')` (15:30 Tashkent). One `it` per row below; assert `text.split('\n')` and the flattened button texts.

| status / history (newest first) | viewer | lines | buttons |
| --- | --- | --- | --- |
| NEW, [] | 40 | `<b>Yangi topshiriq · Yuqori</b>`, `Banner`, `Bergan: Soliyev A.` | Boshladim, Bajardim, Ochish |
| IN_PROGRESS, [STATUS→IN_PROGRESS by 40] | 40 | `<b>🔄 Jarayonda</b>`, `Banner`, `Siz boshladingiz`, `Bergan: Soliyev A.` | Bajardim, Ochish |
| same | 41 | …, `Karimov B. boshladi`, … | Bajardim, Ochish |
| IN_PROGRESS, [RETURN by 30 «Rasm yo‘q», STATUS→IN_REVIEW by 40] | 40 | `<b>↩️ Qaytarildi</b>`, `Banner`, `Soliyev A.: «Rasm yo‘q»`, `Bergan: Soliyev A.` | Bajardim, Ochish |
| same | 30 | `<b>↩️ Siz qaytardingiz</b>`, `Banner`, `«Rasm yo‘q»` | Ochish |
| IN_REVIEW, [STATUS→IN_REVIEW by 40] | 40 | `<b>⏳ Tekshiruvda</b>`, `Banner`, `Siz yubordingiz`, `Bergan: Soliyev A.` | Ochish |
| same | 41 | …, `Karimov B. bajardi`, … | Ochish |
| same | 30 | `<b>Tekshiruvga keldi</b>`, `Banner`, `Karimov B. bajardi` | Qabul qilish, Qaytarish, Ochish |
| DONE, [STATUS→DONE by 30 at T, STATUS→IN_REVIEW by 40] | 40 | `<b>✅ Bajarildi</b>`, `Banner`, `Siz bajardingiz, Soliyev A. qabul qildi · 14.10, 15:30` | Ochish |
| same | 41 | …, `Karimov B. bajardi · 14.10, 15:30` | Ochish |
| same | 30 | `<b>✅ Qabul qildingiz</b>`, `Banner`, `Ijrochi: Karimov B. · 14.10, 15:30` | Ochish |
| same | 50 | …, `Karimov B. bajardi, Soliyev A. qabul qildi · 14.10, 15:30` | Ochish |
| DONE self-task (author 40 = only assignee), [STATUS→DONE by 40 at T] | 40 | `<b>✅ Bajarildi</b>`, `Banner`, `Siz bajardingiz · 14.10, 15:30` | Ochish |
| DONE, [AUTO_CLOSED at T] | 40 | `<b>✅ Yopildi</b>`, `Banner`, `Tizim · 14.10, 15:30` | Ochish |
| CANCELLED, [CANCELLED by 30 «Kerak emas» at T] | 40 | `<b>❌ Bekor qilindi</b>`, `Banner`, `Soliyev A.: «Kerak emas» · 14.10, 15:30` | Ochish |
| same | 30 | `<b>❌ Siz bekor qildingiz</b>`, `Banner`, `«Kerak emas» · 14.10, 15:30` | Ochish |
| IN_PROGRESS, viewer 99 not on the task | 99 | `<b>Topshiriqdan olib tashlandingiz</b>`, `Banner` | (none — not even Ochish) |
| NEW, `kind: 'BROKEN_PROMISE'` | 40 | `<b>Tizim topshirig'i · Yuqori</b>`, … | Ochish |

Use `openUrl: 'https://admin.example.uz/tg?next=x'` in every case; assert the Ochish button is `{ text: 'Ochish', web_app: { url: … } }`. A CANCELLED without reason renders `Soliyev A. · 14.10, 15:30`. Missing event (old task, empty history) falls back to the bare headline without a «who» line.

- [ ] **Step 2:** `npx jest src/tasks/telegram/task-telegram-live-card` — FAIL (not exported).
- [ ] **Step 3: Implement** in `task-telegram-text.ts`:

```ts
export const STATUS_NOTICES: ReadonlySet<TgNotice['kind']> = new Set([
  'ASSIGNED', 'ADDED', 'MOVED', 'REVIEW', 'ACCEPTED', 'RETURNED', 'DONE', 'CANCELLED',
]);

const openButton = (url: string) => Markup.button.webApp('Ochish', url);
const stamp = (d: Date) => `${ddmm(d)}, ${hhmm(d)}`;
const who = (h: TgHistoryItem | undefined) => esc(h?.actorName ?? 'Tizim');
const statusTo = (v: TgTaskView, to: TaskStatus) =>
  v.history.find((h) => h.type === 'STATUS' && h.to === to);

/** Headline + the «who» line, for the reader, from the task's state (spec §3.3). */
function liveHead(v: TgTaskView, me: number): { head: string; line?: string; closed: boolean } {
  const latest = v.history[0];
  switch (v.status) {
    case 'NEW':
      return { head: `${v.kind === 'MANUAL' ? 'Yangi topshiriq' : "Tizim topshirig'i"} · ${PRIORITY_LABEL[v.priority]}`, closed: false };
    case 'IN_PROGRESS': {
      const back = v.history.find((h) => h.type === 'RETURN' || (h.type === 'STATUS' && h.to === 'IN_PROGRESS'));
      if (back?.type === 'RETURN') {
        const why = back.text ? `«${esc(back.text)}»` : '';
        return back.actorId === me
          ? { head: '↩️ Siz qaytardingiz', line: why || undefined, closed: false }
          : { head: '↩️ Qaytarildi', line: why ? `${who(back)}: ${why}` : who(back), closed: false };
      }
      if (!back) return { head: '🔄 Jarayonda', closed: false };
      return { head: '🔄 Jarayonda', line: back.actorId === me ? 'Siz boshladingiz' : `${who(back)} boshladi`, closed: false };
    }
    case 'IN_REVIEW': {
      const rev = statusTo(v, 'IN_REVIEW');
      if (v.authorId === me) return { head: 'Tekshiruvga keldi', line: rev ? `${who(rev)} bajardi` : undefined, closed: false };
      if (!rev) return { head: '⏳ Tekshiruvda', closed: false };
      return { head: '⏳ Tekshiruvda', line: rev.actorId === me ? 'Siz yubordingiz' : `${who(rev)} bajardi`, closed: false };
    }
    case 'DONE': {
      if (latest?.type === 'AUTO_CLOSED') return { head: '✅ Yopildi', line: `Tizim · ${stamp(latest.at)}`, closed: true };
      const done = statusTo(v, 'DONE');
      if (!done) return { head: '✅ Bajarildi', closed: true };
      const at = ` · ${stamp(done.at)}`;
      const rev = statusTo(v, 'IN_REVIEW');
      if (!rev) {
        // A self-task: closed without review.
        return { head: '✅ Bajarildi', line: (done.actorId === me ? 'Siz bajardingiz' : `${who(done)} bajardi`) + at, closed: true };
      }
      if (done.actorId === me) return { head: '✅ Qabul qildingiz', line: `Ijrochi: ${who(rev)}${at}`, closed: true };
      if (rev.actorId === me) return { head: '✅ Bajarildi', line: `Siz bajardingiz, ${who(done)} qabul qildi${at}`, closed: true };
      const watcher = v.participants.some((p) => p.userId === me && p.role === 'WATCHER');
      return { head: '✅ Bajarildi', line: (watcher ? `${who(rev)} bajardi, ${who(done)} qabul qildi` : `${who(rev)} bajardi`) + at, closed: true };
    }
    case 'CANCELLED': {
      const c = v.history.find((h) => h.type === 'CANCELLED');
      if (!c) return { head: '❌ Bekor qilindi', closed: true };
      const why = c.text ? `«${esc(c.text)}»` : '';
      const at = ` · ${stamp(c.at)}`;
      return c.actorId === me
        ? { head: '❌ Siz bekor qildingiz', line: (why || '') + at, closed: true }
        : { head: '❌ Bekor qilindi', line: (why ? `${who(c)}: ${why}` : who(c)) + at, closed: true };
    }
  }
}

/** The person's live card (ADR-0089): the task as it is now, written for them. */
export function renderLiveCard(view: TgTaskView, viewerId: number, opts: { now: Date; openUrl?: string }): TgMessage {
  const onTask = view.authorId === viewerId || view.participants.some((p) => p.userId === viewerId);
  if (!onTask) {
    return { text: `<b>Topshiriqdan olib tashlandingiz</b>\n${esc(view.title)}`, buttons: [] };
  }
  const { head, line, closed } = liveHead(view, viewerId);
  const lines = [`<b>${esc(head)}</b>`, esc(view.title)];
  if (line) lines.push(line.replace(/^ · /, ''));
  // The author's own card needs no «Bergan» / body: they wrote the task.
  if (!closed && view.authorId !== viewerId) lines.push(...liveBody(view, viewerId, opts.now));
  const buttons: TgButtons = closed ? [] : stateButtons(view, viewerId);
  if (opts.openUrl) buttons.push([openButton(opts.openUrl)]);
  return { text: lines.join('\n'), buttons };
}
```

`liveBody` = the current `bodyLines` without the `Bergan` REVIEW exception and without the `Holat:` line (the headline says it):

```ts
function liveBody(view: TgTaskView, viewerId: number, now: Date): string[] {
  const out = [`Bergan: ${esc(view.authorName ?? 'Tizim')}`];
  if (view.dueAt) out.push(`Muddat: ${dueLabel(view.dueAt, now)}`);
  if (view.entityLabel) out.push(`Bog'liq: ${esc(view.entityLabel)}`);
  if (view.steps.length) {
    out.push(`Kichik qadamlar: ${view.steps.filter((s) => s.done).length}/${view.steps.length}`);
  }
  if (view.requiresPhoto && isOpen(view) && isAssignee(view, viewerId)) out.push(PHOTO_LINE);
  return out;
}
```

Notes for the implementer: `head` strings are plain (no person data) — `esc(head)` is harmless; `line` already escapes names/reasons via `who`/`esc`. Match the table exactly; if a table row disagrees with this sketch, the table wins.

- [ ] **Step 4:** `npx jest src/tasks/telegram` — new spec PASS; fix the existing `task-telegram-text.spec.ts` «Ochish» assertions to expect `web_app` instead of `url`.
- [ ] **Step 5: Commit** — `feat(tasks): renderLiveCard — the per-viewer live task card`

---

### Task 4: Sender — status notices become one live card

**Files:**
- Modify: `server/src/tasks/telegram/task-telegram.sender.ts`
- Modify: `server/src/tasks/telegram/task-telegram-outbox.service.ts` (`skipReason`)
- Test: `server/src/tasks/telegram/task-telegram.sender.spec.ts`, `task-telegram-outbox.service.spec.ts`

**Interfaces:**
- Consumes: `STATUS_NOTICES`, `renderLiveCard` (Task 3), `CARD` (Task 1).
- Produces: `TaskTelegramSender.send(view, userId, notice)` — unchanged signature. New behaviour: `REMOVED` → `{ status: 'skipped', reason: 'live card only' }`; a status notice when `taskTelegramMessage` has a row `{ taskId: view.id, userId, chatId: chat.chatId, purpose: 'CARD' }` → `{ status: 'skipped', reason: 'has card' }`; otherwise a status notice is sent as `renderLiveCard(view, userId, …)` and recorded `CARD`. Other notices: unchanged (`renderTaskMessage`, `NOTICE`).
- `skipReason(row, view, now)`: a NOTICE row whose payload kind is `ASSIGNED` | `ADDED` | `MOVED` on a closed task (`!OPEN_STATUSES.includes(view.status)`) → `'task closed'`. `skipReason` gets the payload: change its first param to `{ kind; userId; payload?: Prisma.JsonValue }` and pass `row` (already has `payload`).

- [ ] **Step 1: Failing tests** (sender spec, same `setup()` style as existing):
  1. `ASSIGNED` with no CARD row → `sendMessage` text starts `<b>Yangi topshiriq`, `taskTelegramMessage.create` called with `purpose: 'CARD'`.
  2. `ASSIGNED` when `taskTelegramMessage.findFirst` resolves `{ id: 'm1' }` → `{ status: 'skipped', reason: 'has card' }`, no `sendMessage`; `findFirst` called with `where: { taskId: 't1', userId: 40, chatId: '700', purpose: 'CARD' }`.
  3. `REMOVED` → `{ status: 'skipped', reason: 'live card only' }`, no `sendMessage`, no DB read.
  4. `COMMENT` → as before: `renderTaskMessage` text (`<b>Yangi izoh</b>`), recorded `NOTICE`, no `findFirst`.
  Outbox spec: a NOTICE row with payload `{ kind: 'ASSIGNED' }` on a DONE view → `skipReason` = `'task closed'`; payload `{ kind: 'DONE', by: 'X' }` on a DONE view → `null`.
- [ ] **Step 2:** run both specs — FAIL.
- [ ] **Step 3: Implement** in `send`:

```ts
    const chat = await staffChatOf(this.prisma, userId);
    if (!chat) return { status: 'skipped', reason: 'no chat' };
    // REMOVED edits the person's card (TaskTelegramLive); never a new message.
    if (notice.kind === 'REMOVED') return { status: 'skipped', reason: 'live card only' };
    const live = STATUS_NOTICES.has(notice.kind);
    if (live) {
      const has = await this.prisma.taskTelegramMessage.findFirst({
        where: { taskId: view.id, userId, chatId: chat.chatId, purpose: 'CARD' },
        select: { id: true },
      });
      // ponytail: two events in the same instant can both see no card and send two; the next refresh keeps both right.
      if (has) return { status: 'skipped', reason: 'has card' };
    }
    const opts = { now: new Date(), openUrl: this.openUrl(chat.roleIds, view.id) };
    const msg = live
      ? renderLiveCard(view, userId, opts)
      : renderTaskMessage(view, notice, userId, opts);
    … sendMessage as before …
    await this.record(chat.chatId, messageId, view, userId, live ? 'CARD' : 'NOTICE');
```

Move the `REMOVED` check BEFORE `staffChatOf` (no DB read for it), as the test 3 requires. In `skipReason`: after the `LESSON_QUESTION` line,

```ts
  if (row.kind === 'NOTICE') {
    const kind = (row.payload as { kind?: string } | null)?.kind;
    const opening = kind === 'ASSIGNED' || kind === 'ADDED' || kind === 'MOVED';
    return opening && !OPEN_STATUSES.includes(view.status) ? 'task closed' : null;
  }
```

- [ ] **Step 4:** `npx jest src/tasks/telegram` — PASS (adjust the listener spec only if an assertion depended on `REMOVED` being sent).
- [ ] **Step 5: Commit** — `feat(tasks): status notices go out as one live card per person`

---

### Task 5: `TaskTelegramLive.refresh` + listener wiring

**Files:**
- Create: `server/src/tasks/telegram/task-telegram-live.ts`, `server/src/tasks/telegram/task-telegram-live.spec.ts`
- Modify: `server/src/tasks/telegram/task-telegram.listener.ts`, `task-telegram.listener.spec.ts`
- Modify: `server/src/tasks/tasks.module.ts` (provider `TaskTelegramLive`)

**Interfaces:**
- Consumes: `loadTaskView`, `renderLiveCard`, `editExtra`, `TaskTelegramSender.openUrl(roleIds, taskId)`, `classifyTelegramError`, `describeError`, `TelegramService.getBot()`.
- Produces:

```ts
@Injectable()
export class TaskTelegramLive {
  /** Edits every live card of the task; never throws. `sleep` is injectable for tests. */
  async refresh(taskId: string, sleep?: (ms: number) => Promise<void>): Promise<void>;
}
```

- [ ] **Step 1: Failing tests** (`task-telegram-live.spec.ts`; mock `loadTaskView` via `jest.mock('./task-telegram-view', …)` as the listener spec does; `telegram.getBot()` returns `{ telegram: { editMessageText: jest.fn() } }`; `prisma.taskTelegramMessage.findMany/deleteMany`, `prisma.user.findMany` for roles):
  1. two CARD rows (users 40 and 30) → `editMessageText` called twice with `(chatId, messageId, undefined, <renderLiveCard text for that user>, { parse_mode: 'HTML', reply_markup: { inline_keyboard: … } })`; `findMany` where `{ taskId: 't1', purpose: 'CARD' }`.
  2. edit rejects `{ response: { error_code: 400, description: 'Bad Request: message is not modified' } }` → no delete, no log at warn.
  3. edit rejects 400 `message to edit not found` → `deleteMany({ where: { id: <row id> } })`, and the next row is still edited.
  4. edit rejects 403 → row deleted.
  5. 429 `retry_after: 2` → `sleep(2000)` then the same row retried once; a second 429 stops the loop (later rows not edited), logged.
  6. view null (task gone) or bot off → no calls, resolves.
  7. any other error on row 1 → logged, row 2 still edited, `refresh` resolves.
- [ ] **Step 2:** run — FAIL (module missing).
- [ ] **Step 3: Implement** `task-telegram-live.ts`:

```ts
const GONE = /message to edit not found|message can't be edited|MESSAGE_ID_INVALID/i;
const NOT_MODIFIED = /message is not modified/i;
const MAX_WAIT_S = 30;

@Injectable()
export class TaskTelegramLive {
  private readonly logger = new Logger(TaskTelegramLive.name);
  constructor(private prisma: PrismaService, private telegram: TelegramService, private sender: TaskTelegramSender) {}

  async refresh(taskId: string, sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))): Promise<void> {
    try {
      const client = this.telegram.getBot()?.telegram;
      if (!client) return;
      const rows = await this.prisma.taskTelegramMessage.findMany({
        where: { taskId, purpose: 'CARD' },
        select: { id: true, chatId: true, messageId: true, userId: true },
        orderBy: { createdAt: 'asc' },
      });
      if (rows.length === 0) return;
      const view = await loadTaskView(this.prisma, taskId);
      if (!view) return;
      const users = await this.prisma.user.findMany({
        where: { id: { in: [...new Set(rows.map((r) => r.userId))] } },
        select: { id: true, roles: { select: { roleId: true } } },
      });
      const roles = new Map(users.map((u) => [u.id, u.roles.map((r) => r.roleId)]));
      const now = new Date();
      for (const row of rows) {
        const msg = renderLiveCard(view, row.userId, { now, openUrl: this.sender.openUrl(roles.get(row.userId) ?? [], taskId) });
        const edit = () => client.editMessageText(row.chatId, row.messageId, undefined, msg.text, editExtra(msg.buttons));
        const outcome = await this.tryEdit(edit, row.id, sleep);
        if (outcome === 'stop') return;
      }
    } catch (err) {
      this.logger.error(`task ${taskId}: live cards not refreshed: ${describeError(err)}`);
    }
  }

  private async tryEdit(edit: () => Promise<unknown>, rowId: string, sleep: (ms: number) => Promise<void>, retried = false): Promise<'ok' | 'stop'> {
    try {
      await edit();
      return 'ok';
    } catch (err) {
      const f = classifyTelegramError(err);
      if (NOT_MODIFIED.test(f.description)) return 'ok';
      if (f.kind === 'permanent' || GONE.test(f.description)) {
        await this.prisma.taskTelegramMessage.deleteMany({ where: { id: rowId } });
        return 'ok';
      }
      if (f.retryAfter !== null && !retried) {
        await sleep(Math.min(f.retryAfter, MAX_WAIT_S) * 1000);
        return this.tryEdit(edit, rowId, sleep, true);
      }
      this.logger.warn(`live card ${rowId} not edited: ${f.description.slice(0, 300)}`);
      return f.retryAfter !== null ? 'stop' : 'ok';
    }
  }
}
```

Listener: inject `TaskTelegramLive`; in `handle`, right after the `LESSON_QUESTION` return and BEFORE planning, `if (REFRESH_EVENTS.has(event)) await this.live.refresh(payload.task.id);` where

```ts
const REFRESH_EVENTS = new Set<string>([
  TASK_EVENTS.ASSIGNED, TASK_EVENTS.UNASSIGNED, TASK_EVENTS.STATUS_CHANGED,
  TASK_EVENTS.REVIEW_REQUESTED, TASK_EVENTS.REVIEWED, TASK_EVENTS.CANCELLED,
  TASK_EVENTS.REASSIGNED, TASK_EVENTS.DUE_CHANGED, TASK_EVENTS.AUTO_CLOSED,
]);
```

and add `@OnEvent(TASK_EVENTS.AUTO_CLOSED) onAutoClosed(p) { return this.handle(TASK_EVENTS.AUTO_CLOSED, p); }` (`planNotices` returns `[]` for it, so it only refreshes). `refresh` never throws, so a failed refresh never costs a first message. Register `TaskTelegramLive` in `tasks.module.ts` providers.

Listener spec: add `live = { refresh: jest.fn().mockResolvedValue(undefined) }` to `setup()`; new tests — `STATUS_CHANGED` calls `refresh('t1')` once; `COMMENTED` does not; `AUTO_CLOSED` calls it and sends nothing; a `LESSON_QUESTION` task calls nothing.

- [ ] **Step 4:** `npx jest src/tasks` — PASS; `npm run typecheck` — 0.
- [ ] **Step 5: Commit** — `feat(tasks): every task change edits all live cards`

---

### Task 6: Button presses redraw with the live card

**Files:**
- Modify: `server/src/tasks/telegram/task-telegram.handler.ts`, `task-telegram-text.ts`, `server/src/tasks/task-notify-plan.ts` (`TgNotice`)
- Test: `task-telegram.handler.spec.ts` (+ `.return`, `.photo`, `.steps` specs), `task-telegram-text.spec.ts`

**Interfaces:**
- Consumes: `renderLiveCard`.
- Removes: `keptHeadline`, `TgNotice` kind `'CARD'` (and its branches in `headline` / `ACTION_NOTICES` / `renderTaskMessage`), handler `headline` params.

- [ ] **Step 1: Failing tests** — in `task-telegram.handler.spec.ts`: after «Boshladim» the edited text starts `<b>🔄 Jarayonda</b>` (with the mocked view's `status: 'IN_PROGRESS'` and `history: [STATUS→IN_PROGRESS by the presser]`); a list number (`tk:show:<id>`) sends a card recorded with purpose `'CARD'`.
- [ ] **Step 2:** run — FAIL.
- [ ] **Step 3: Implement** — `card(me, view)` returns `renderLiveCard(view, me.actor.userId, { now: new Date(), openUrl: this.sender.openUrl(me.actor.roleIds, view.id) })`; `drawCard(ctx, me, view)` loses the `headline` argument (update all callers; delete `pressedText` and `keptHeadline` import); `sendCard` records `'CARD'`. Delete `keptHeadline` + its tests and the `'CARD'` notice kind everywhere (`grep -rn "'CARD'" src/tasks` must then show only the purpose uses).
- [ ] **Step 4:** `npx jest src/tasks && npm run typecheck` — PASS / 0.
- [ ] **Step 5: Commit** — `refactor(tasks): pressed messages redraw as the live card`

---

### Task 7: «Ochish» opens the staff Mini App on the task

**Files:**
- Modify: `server/src/tasks/telegram/task-telegram-view.ts` (`taskOpenUrl`), `task-telegram-view.spec.ts`
- Modify: `client/src/lib/telegram-mini-app.ts` (`staffCabinetPath`), `client/src/lib/telegram-mini-app.test.ts`

**Interfaces:**
- Produces: `taskOpenUrl(studentMiniAppUrl, roleIds, taskId)` → `staffPageUrl(cabinet, '/tasks?task=<taskId>')` (e.g. `https://admin.dafzentrum.uz/tg?next=%2Ftasks%3Ftask%3D<id>`); `undefined` as before when there is no cabinet. Client `staffCabinetPath('/tasks?task=<uuid>')` → that path.

- [ ] **Step 1: Failing tests** — server: `taskOpenUrl('https://student.dafzentrum.uz/tg', [3], '0b6c…uuid')` equals `'https://admin.dafzentrum.uz/tg?next=%2Ftasks%3Ftask%3D0b6c…uuid'` (teacher-only `[4]` → `lehrer.` host). Client (`staffCabinetPath` describe block):

```ts
  it("opens one task by its uuid", () => {
    const p = "/tasks?task=3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c";
    expect(staffCabinetPath(p)).toBe(p);
  });
  it.each([
    "/tasks",
    "/tasks?task=abc",
    "/tasks?task=3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c&x=1",
    "//evil.com/tasks?task=3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c",
    "https://evil.com/tasks?task=3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c",
  ])("refuses %s", (next) => {
    expect(staffCabinetPath(next)).toBe("/profile");
  });
```

- [ ] **Step 2:** run (`cd server && npx jest src/tasks/telegram/task-telegram-view`; `cd client && npx vitest run src/lib/telegram-mini-app.test.ts`) — FAIL.
- [ ] **Step 3: Implement** — server:

```ts
import { staffMiniAppUrl, staffPageUrl } from '../../telegram/staff/staff-cabinet';
…
  return cabinet ? staffPageUrl(cabinet, `/tasks?task=${taskId}`) : undefined;
```

(update its doc comment: a Mini App page, signs in through `/tg`). Client:

```ts
/** One task from a bot message: `/tasks?task=<uuid>`, nothing else (ADR-0089). */
const STAFF_TASK_PAGE =
  /^\/tasks\?task=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function staffCabinetPath(next: string | null | undefined): string {
  if (!next) return STAFF_CABINET_HOME;
  return STAFF_CABINET_PAGES.has(next) || STAFF_TASK_PAGE.test(next)
    ? next
    : STAFF_CABINET_HOME;
}
```

Check `mini-app-entry.tsx` passes the full `next` (path + query) — it reads `next` from the URL's search params, which `URLSearchParams` decodes, so `/tasks?task=…` arrives whole. Confirm `/tasks?task=<id>` opens the task sheet on the tasks page (existing `?task=` support, ADR-0074).

- [ ] **Step 4:** both test runs PASS; `cd client && npx tsc --noEmit` — 0.
- [ ] **Step 5: Commit** — `feat(tasks): «Ochish» opens the task in the staff Mini App`

---

### Task 8: ADR, docs, full verification, PR

**Files:**
- Create: `docs/adr/0089-topshiriq-xabari-tirik-karta.md` (Uzbek, the ADR template of `docs/adr/README.md`); add its row to `docs/adr/README.md`; ADR-0078 is NOT edited (accepted ADRs are immutable) — 0089 says which part of it it replaces (one message per notice → one live card per person; «Ochish» URL → Mini App).
- Modify: `server/CLAUDE.md` «Tasks → Telegram» bullets: «Message» (CARD vs NOTICE, `renderLiveCard`, «Ochish» = `web_app`), «Who» (status notices = first card only), «Buttons» (pressed message redraws as the live card), and a new «Live cards» bullet (`TaskTelegramLive.refresh`, the refresh events, edit-failure rules, edits ignore the night quiet).

- [ ] **Step 1:** Write ADR-0089 (context: stale buttons; decision: spec §2; consequences: silent edits, pre-deploy messages stay NOTICE, two-cards race accepted). Check `ls docs/adr | tail -3` first — if 0089 is taken on `main`, take the next free number.
- [ ] **Step 2:** Update `server/CLAUDE.md` as listed.
- [ ] **Step 3: Full checks** (each once; run server and client in parallel only if no Prisma generate is running):
  - `cd server && npx prettier --write <touched .ts files> && npx eslint src/tasks --quiet && npm run typecheck && npm test`
  - `cd client && npx tsc --noEmit && npm run lint 2>&1 | tail -20 && npx vitest run src/lib/telegram-mini-app.test.ts`
  - `cd server && npm run build`
- [ ] **Step 4: Throwaway PG** (pattern: `reference_throwaway_local_db` memory) — apply migrations, then with a fake bot client (edit/send spies) run: create a task for two assignees → each has 1 CARD row; assignee A «Bajardim» → still 1 CARD row each, no new send to B, author gets exactly one new CARD; author accepts → no new send to anyone, every CARD edited, watcher gets its first CARD. Record the row counts in the PR.
- [ ] **Step 5: Commit + PR** — `git push -u origin feat/topshiriq-tirik-xabar`; `gh pr create --base main --head feat/topshiriq-tirik-xabar` (English title/body: what changes for staff, migration name, deploy order server+client together, manual check list: press each button in Telegram and watch the other people's cards change; «Ochish» opens without login).
