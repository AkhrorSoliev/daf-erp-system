# «Telegram hisobot» sahifasini yaxshilash — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the CEO's «Telegram hisobot» settings page (`/settings/telegram-report`) as a searchable, filterable table with a side panel, and show for every recipient whether a message will reach them (the bot is not blocked, the account is linked), plus whether the bot itself is running.

**Architecture:** The main bot already learns whether a *student's* chat still takes its messages (`StudentChatReach`, ADR-0066: a private chat's `my_chat_member` update and the outcome of every send). That class is extended to staff accounts through one new column, `User.telegramDisconnectedAt`. The recipient API gains a `reach` state, the last send attempt, a bot-status flag, a silent «Ulanishni tekshirish» probe (`sendChatAction`) and a real-figures preview. The client page is rewritten around a table + side panel; all filtering and counting is done by pure, tested functions.

**Tech Stack:** NestJS + Prisma 7 + Jest + Telegraf (server); Next.js + React Query 5 + Vitest + shadcn (client). One small migration, no new dependency.

**Builds on:** ADR-0095 (`docs/adr/0095-shaxsiy-telegram-hisobot.md`, merged), ADR-0066 (student chat reach). The CEO approved the direction (mock-up, 17.10.2026): search + filter chips, summary cards, compact table, side panel, preview, «Ulanishni tekshirish», per-row Telegram state, bot status.

## Global Constraints

- Worktree root: `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/telegram-hisobot-sahifa` (branch `feat/telegram-hisobot-sahifa`). Every command runs inside it; never `cd` into the main checkout.
- Server tests: `cd server && npx jest <path>`. Typecheck: `npm run typecheck` AND `npm run build` (never in parallel with tests). Lint: `npx eslint <files>`. Format: `npx prettier --write <touched server .ts files>` before every commit. **Never run prettier on `client/` or on `route-access.snapshot.json`** (add its rows by hand/with a node script, sorted keys).
- Client checks: `cd client && npx tsc --noEmit -p . && npx vitest run <path>`; eslint on touched client files.
- Commit messages: English, conventional (`feat(telegram-report): …`), last line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- UI text: Uzbek Latin only, no English words on screen.
- Every new route is `@CeoOnly()`, takes no `@BranchScope()`, is listed in the existing `COMPANY_WIDE` block of `server/src/common/auth/branch-route-policy.ts` (the block whose routes are the `/telegram-report/…` ones) and gets a `["CEO"]` row in `server/src/common/permissions/route-access.snapshot.json`.
- `src/telegram` must not import from `src/telegram-report`; `src/telegram-report` may import from `src/telegram/utils`.
- A reachability mark never blocks or skips a send (ADR-0066): it is information for the CEO.
- Reach states (exact strings, server and client): `BLOCKED`, `UNLINKED`, `DELIVERED`, `LINKED`. Probe results: `DELIVERED`, `BLOCKED`, `UNLINKED`, `NO_BOT`, `FAILED`.
- Migration is hand-written, idempotent (`ADD COLUMN IF NOT EXISTS`), name `20261017120000_telegram_staff_reach`. Do NOT run `prisma migrate dev`; only `prisma validate` + `prisma generate`.

## File map

**Server — modified**
- `server/prisma/schema.prisma`, new `server/prisma/migrations/20261017120000_telegram_staff_reach/migration.sql`
- `server/src/telegram/utils/student-chat-reach.ts` (+ `.spec.ts`) — also marks staff accounts
- `server/src/telegram-report/personal-report.service.ts` (+ spec) — records attempts, `botActive`, `probe`, `preview`
- `server/src/telegram-report/telegram-report-recipients.service.ts` (+ spec) — richer view, `check`, `preview`
- `server/src/telegram-report/telegram-report.controller.ts` (+ spec)
- `server/src/common/auth/branch-route-policy.ts`, `server/src/common/permissions/route-access.snapshot.json`
- `server/CLAUDE.md`

**Server — new**
- `server/src/telegram-report/reach-state.ts` (+ `.spec.ts`) — pure `reachOf`, `attemptNote`

**Client — new**
- `client/src/components/settings/telegram-report/recipient-view.ts` (+ `.test.ts`) — pure filter / count / label helpers
- `client/src/components/settings/telegram-report/summary-cards.tsx`
- `client/src/components/settings/telegram-report/recipient-table.tsx` (+ `.test.ts`)
- `client/src/components/settings/telegram-report/recipient-panel.tsx`
- `client/src/components/settings/telegram-report/add-recipient-dialog.tsx`

**Client — modified/removed**
- `telegram-report-api.ts`, `telegram-report-settings-client.tsx` (rewritten); `recipient-card.tsx` is replaced by `recipient-panel.tsx` (`git mv`, then edit).
- Guide: `client/src/qollanma/kontent/hisobotlar/telegram-hisobot.mdx`, `client/src/qollanma/yangiliklar.ts`.

**Docs**
- `docs/adr/0097-xodim-telegram-yetib-borishi.md`, `docs/adr/README.md`.

---

### Task 0: Worktree setup

- [ ] **Step 1: Install and generate**

```bash
cd server && npm ci --no-audit --no-fund && npx prisma generate && cd ../client && npm ci --no-audit --no-fund
```

- [ ] **Step 2: Baseline**

Run: `cd server && npx jest src/telegram-report src/telegram/utils` and `cd ../client && npx vitest run src/components/settings/telegram-report src/lib/settings-nav.test.ts`
Expected: PASS. If anything fails, stop and report.

---

### Task 1: Staff accounts get the «reachable» mark (schema + `StudentChatReach`)

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20261017120000_telegram_staff_reach/migration.sql`
- Modify: `server/src/telegram/utils/student-chat-reach.ts`
- Test: `server/src/telegram/utils/student-chat-reach.spec.ts`

**Interfaces:**
- Produces: Prisma fields `User.telegramDisconnectedAt DateTime?`, `TelegramReportRecipient.lastAttemptAt DateTime?`, `.lastAttemptOk Boolean?`, `.lastAttemptNote String?`; `StudentChatReach.disconnected/reconnected` now also update live `User` rows on the chat.

- [ ] **Step 1: Schema**

In `model User`, right after `telegramChatId String?` add:

```prisma
  /// When the bot learned this account's linked chat no longer takes its
  /// messages (blocked the bot, deleted Telegram). Null = reachable. Same rule
  /// as `Student.telegramDisconnectedAt` (ADR-0066); written only by
  /// `StudentChatReach` and the report page's probe (ADR-0097).
  telegramDisconnectedAt DateTime?
```

In `model TelegramReportRecipient` after `lastSentDate` add:

```prisma
  /// The last attempt to send this recipient a report (cron, test or none yet).
  lastAttemptAt   DateTime?
  lastAttemptOk   Boolean?
  /// Why it failed, in the CEO's words; null after a success.
  lastAttemptNote String?
```

- [ ] **Step 2: Migration**

```sql
-- Xodim Telegram'iga xabar yetib borishi (ADR-0097).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "telegramDisconnectedAt" TIMESTAMP(3);
ALTER TABLE "TelegramReportRecipient" ADD COLUMN IF NOT EXISTS "lastAttemptAt" TIMESTAMP(3);
ALTER TABLE "TelegramReportRecipient" ADD COLUMN IF NOT EXISTS "lastAttemptOk" BOOLEAN;
ALTER TABLE "TelegramReportRecipient" ADD COLUMN IF NOT EXISTS "lastAttemptNote" TEXT;
```

Run `cd server && npx prisma validate && npx prisma generate`. Expected: both succeed.

- [ ] **Step 3: Failing tests**

In `student-chat-reach.spec.ts` the `setup()` prisma mock only has `student`. Add a `user` delegate with the same two mocks (`findMany: jest.fn().mockResolvedValue([])`, `updateMany: jest.fn().mockResolvedValue({ count: 1 })`) so every existing test keeps passing, then append:

```ts
describe('staff accounts on the same chat', () => {
  it('a block marks the live staff rows too, with a User history row', async () => {
    const { reach, prisma, history } = setup();
    prisma.user.findMany.mockResolvedValue([{ id: 50, companyId: 1001 }]);
    await reach.disconnected(CHAT, new Date('2026-10-17T10:00:00Z'), BLOCKED_REASON);
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { telegramChatId: CHAT, telegramDisconnectedAt: null, deletedAt: null },
      select: { id: true, companyId: true },
    });
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 50, telegramDisconnectedAt: null },
      data: { telegramDisconnectedAt: new Date('2026-10-17T10:00:00Z') },
    });
    expect(history.recordCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'User',
        entityId: 50,
        newValues: { action: 'TELEGRAM_UZILDI', sabab: BLOCKED_REASON },
      }),
    );
  });

  it('an unblock clears the mark on staff rows', async () => {
    const { reach, prisma, history } = setup();
    prisma.user.findMany.mockResolvedValue([{ id: 50, companyId: 1001 }]);
    await reach.reconnected(CHAT);
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 50, telegramDisconnectedAt: { not: null } },
      data: { telegramDisconnectedAt: null },
    });
    expect(history.recordCreate).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'User', newValues: { action: 'TELEGRAM_QAYTA_ULANDI' } }),
    );
  });

  it('a row another call already marked records no second history row', async () => {
    const { reach, prisma, history } = setup();
    prisma.user.findMany.mockResolvedValue([{ id: 50, companyId: 1001 }]);
    prisma.user.updateMany.mockResolvedValue({ count: 0 });
    await reach.disconnected(CHAT, new Date(), BLOCKED_REASON);
    expect(history.recordCreate).not.toHaveBeenCalledWith(expect.objectContaining({ entityType: 'User' }));
  });
});
```

Run: `cd server && npx jest src/telegram/utils/student-chat-reach.spec.ts` → the three new tests FAIL.

- [ ] **Step 4: Implement**

In `student-chat-reach.ts` replace the bodies of `disconnected` and `reconnected` so each handles both entity kinds through one private helper (keep the public signatures and the doc comments; update the class comment to say «students and staff accounts»):

```ts
/** The two row kinds a chat can belong to; both carry the same mark. */
interface ChatRows {
  findMany(args: {
    where: Record<string, unknown>;
    select: { id: true; companyId: true };
  }): Promise<Array<{ id: number; companyId: number }>>;
  updateMany(args: {
    where: Record<string, unknown>;
    data: { telegramDisconnectedAt: Date | null };
  }): Promise<{ count: number }>;
}

  /** Flips the mark on every live row of both kinds on this chat. */
  private async flip(
    chatId: string,
    to: Date | null,
    history: Record<string, string>,
  ): Promise<void> {
    const kinds: Array<[string, ChatRows]> = [
      ['Student', this.prisma.student as unknown as ChatRows],
      ['User', this.prisma.user as unknown as ChatRows],
    ];
    for (const [entityType, rows] of kinds) {
      const from = to ? null : { not: null };
      const found = await rows.findMany({
        where: { telegramChatId: chatId, telegramDisconnectedAt: from, deletedAt: null },
        select: { id: true, companyId: true },
      });
      for (const row of found) {
        // Conditional per row: two failures racing on one chat mark it once.
        const { count } = await rows.updateMany({
          where: { id: row.id, telegramDisconnectedAt: from },
          data: { telegramDisconnectedAt: to },
        });
        if (count === 0) continue;
        await this.history.recordCreate({
          entityType,
          entityId: row.id,
          companyId: row.companyId,
          newValues: history,
        });
      }
    }
  }

  async disconnected(chatId: string, at: Date, reason: string): Promise<void> {
    await this.flip(chatId, at, { action: 'TELEGRAM_UZILDI', sabab: reason });
  }

  async reconnected(chatId: string): Promise<void> {
    await this.flip(chatId, null, { action: 'TELEGRAM_QAYTA_ULANDI' });
  }
```

The existing student tests assert exact `findMany` / `updateMany` arguments — they must still pass unchanged (the `where` for a student row is `{ telegramChatId, telegramDisconnectedAt: null | { not: null }, deletedAt: null }`, identical to before). If a student test's key order differs, that is irrelevant (`toHaveBeenCalledWith` is order-free).

- [ ] **Step 5: Run, format, commit**

```bash
cd server && npx jest src/telegram && npm run typecheck && npx prettier --write src/telegram/utils/student-chat-reach.ts src/telegram/utils/student-chat-reach.spec.ts && npx eslint src/telegram/utils/student-chat-reach.ts
git add prisma src/telegram/utils
git commit -m "feat(telegram): staff chats get the reachable mark like students"
```
Expected: all `src/telegram` specs PASS.

---

### Task 2: Reach state, attempt log, probe and preview (server logic)

**Files:**
- Create: `server/src/telegram-report/reach-state.ts` (+ `reach-state.spec.ts`)
- Modify: `server/src/telegram-report/personal-report.service.ts` (+ `personal-report.service.spec.ts`)

**Interfaces:**
- Consumes: `staffChatOf(db, userId)` (`../tasks/telegram/task-telegram-view`), `classifyTelegramError`, `describeError`, `sendTelegramText`, `TelegramTextSender` (`../telegram-digest/telegram-send`), `unreachableReason` (`../telegram/utils/student-chat-reach`), `htmlToPlainText` (`../refunds/refund-student-text`), `TelegramService.getBot()`.
- Produces:

```ts
// reach-state.ts
export type ReachState = 'BLOCKED' | 'UNLINKED' | 'DELIVERED' | 'LINKED';
export function reachOf(i: { linked: boolean; disconnectedAt: Date | null; lastAttemptOk: boolean | null }): ReachState;
export function attemptNote(r: DeliverResult): string | null; // null on success

// PersonalReportService (additions)
botActive(): Promise<boolean>;                       // cached 60 s
probe(userId: number): Promise<ProbeResult>;          // silent sendChatAction
preview(r: RecipientLike): Promise<string | null>;    // plain text, null = no allowed branch
export type ProbeResult = { reach: 'DELIVERED' | 'BLOCKED' | 'UNLINKED' | 'NO_BOT' | 'FAILED'; note: string | null };
// deliver() now also stores lastAttempt* on the recipient row.
```

- [ ] **Step 1: Failing tests for the pure part**

`reach-state.spec.ts`:

```ts
import { attemptNote, reachOf } from './reach-state';

describe('reachOf', () => {
  const base = { linked: true, disconnectedAt: null, lastAttemptOk: null };
  it('unlinked wins over everything', () => {
    expect(reachOf({ ...base, linked: false, disconnectedAt: new Date(), lastAttemptOk: true })).toBe('UNLINKED');
  });
  it('a known block wins over a past success', () => {
    expect(reachOf({ ...base, disconnectedAt: new Date(), lastAttemptOk: true })).toBe('BLOCKED');
  });
  it('a delivered last attempt is DELIVERED', () => {
    expect(reachOf({ ...base, lastAttemptOk: true })).toBe('DELIVERED');
  });
  it('linked and never tried, or last try failed for another reason, is LINKED', () => {
    expect(reachOf(base)).toBe('LINKED');
    expect(reachOf({ ...base, lastAttemptOk: false })).toBe('LINKED');
  });
});

describe('attemptNote', () => {
  it('null on success', () => expect(attemptNote({ ok: true })).toBeNull());
  it('names each local reason in Uzbek', () => {
    expect(attemptNote({ ok: false, reason: 'NO_CHAT' })).toBe('Telegram ulanmagan');
    expect(attemptNote({ ok: false, reason: 'NO_BRANCH' })).toBe('Filial tanlanmagan');
    expect(attemptNote({ ok: false, reason: 'NO_BOT' })).toBe('Bot ishlamayapti');
  });
  it('maps a permanent Telegram refusal to the staff wording, others generically', () => {
    expect(attemptNote({ ok: false, reason: 'SEND_FAILED', kind: 'permanent', description: 'Forbidden: bot was blocked by the user' })).toBe('Botni bloklagan');
    expect(attemptNote({ ok: false, reason: 'SEND_FAILED', kind: 'transient', description: 'timeout' })).toBe('Telegram vaqtincha javob bermadi');
    expect(attemptNote({ ok: false, reason: 'SEND_FAILED', kind: 'content', description: 'too long' })).toBe("Xabarni yuborib bo'lmadi");
  });
});
```

Run `cd server && npx jest src/telegram-report/reach-state.spec.ts` → FAIL (module missing).

- [ ] **Step 2: Implement `reach-state.ts`**

```ts
import { unreachableReason } from '../telegram/utils/student-chat-reach';
import type { DeliverResult } from './personal-report.service';

export type ReachState = 'BLOCKED' | 'UNLINKED' | 'DELIVERED' | 'LINKED';

/** What the CEO sees for one recipient (ADR-0097). Order of the checks matters. */
export function reachOf(i: {
  linked: boolean;
  disconnectedAt: Date | null;
  lastAttemptOk: boolean | null;
}): ReachState {
  if (!i.linked) return 'UNLINKED';
  if (i.disconnectedAt) return 'BLOCKED';
  return i.lastAttemptOk === true ? 'DELIVERED' : 'LINKED';
}

/** Why an attempt failed, in the CEO's words; null when it succeeded. */
export function attemptNote(r: DeliverResult): string | null {
  if (r.ok) return null;
  if (r.reason === 'NO_CHAT') return 'Telegram ulanmagan';
  if (r.reason === 'NO_BRANCH') return 'Filial tanlanmagan';
  if (r.reason === 'NO_BOT') return 'Bot ishlamayapti';
  if (r.kind === 'permanent') return unreachableReason(r.description);
  if (r.kind === 'transient') return 'Telegram vaqtincha javob bermadi';
  return "Xabarni yuborib bo'lmadi";
}
```

Run again → PASS. (`reach-state.ts` imports only a *type* from the service, so there is no runtime cycle.)

- [ ] **Step 3: Failing tests for the service additions**

Extend `personal-report.service.spec.ts` (keep its existing `setup()`; add to the prisma mock `telegramReportRecipient: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) }` and `user: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) }`; let `setup` accept `bot` with `telegram.getMe` and `telegram.sendChatAction` mocks). Append:

```ts
describe('deliver records the attempt', () => {
  it('a success stores ok=true and no note', async () => {
    jest.mocked(staffChatOf).mockResolvedValue({ chatId: '777', roleIds: [1] });
    const { svc, prisma } = setup();
    await svc.deliver(rec as never, new Map(), NOW);
    expect(prisma.telegramReportRecipient.updateMany).toHaveBeenCalledWith({
      where: { companyId: 1, userId: 50 },
      data: { lastAttemptAt: NOW, lastAttemptOk: true, lastAttemptNote: null },
    });
  });

  it('a failure stores ok=false and the note', async () => {
    jest.mocked(staffChatOf).mockResolvedValue(null);
    const { svc, prisma } = setup();
    await svc.deliver(rec as never, new Map(), NOW);
    expect(prisma.telegramReportRecipient.updateMany).toHaveBeenCalledWith({
      where: { companyId: 1, userId: 50 },
      data: { lastAttemptAt: NOW, lastAttemptOk: false, lastAttemptNote: 'Telegram ulanmagan' },
    });
  });

  it('a failing bookkeeping write never fails the delivery', async () => {
    jest.mocked(staffChatOf).mockResolvedValue({ chatId: '777', roleIds: [1] });
    const { svc, prisma } = setup();
    prisma.telegramReportRecipient.updateMany.mockRejectedValue(new Error('db'));
    expect(await svc.deliver(rec as never, new Map(), NOW)).toEqual({ ok: true });
  });
});

describe('probe', () => {
  it('no linked chat → UNLINKED, nothing sent', async () => {
    jest.mocked(staffChatOf).mockResolvedValue(null);
    const { svc, bot } = setup();
    expect(await svc.probe(50)).toEqual({ reach: 'UNLINKED', note: 'Telegram ulanmagan' });
    expect(bot.telegram.sendChatAction).not.toHaveBeenCalled();
  });

  it('a silent typing action that succeeds → DELIVERED, clears a stale mark', async () => {
    jest.mocked(staffChatOf).mockResolvedValue({ chatId: '777', roleIds: [1] });
    const { svc, bot, prisma } = setup();
    expect(await svc.probe(50)).toEqual({ reach: 'DELIVERED', note: null });
    expect(bot.telegram.sendChatAction).toHaveBeenCalledWith('777', 'typing');
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 50, telegramDisconnectedAt: { not: null } },
      data: { telegramDisconnectedAt: null },
    });
  });

  it('403 «blocked» → BLOCKED, marks the account at once', async () => {
    jest.mocked(staffChatOf).mockResolvedValue({ chatId: '777', roleIds: [1] });
    const { svc, bot, prisma } = setup();
    bot.telegram.sendChatAction.mockRejectedValue(
      Object.assign(new Error('Forbidden'), { response: { error_code: 403, description: 'Forbidden: bot was blocked by the user' } }),
    );
    expect(await svc.probe(50)).toEqual({ reach: 'BLOCKED', note: 'Botni bloklagan' });
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 50, telegramDisconnectedAt: null },
      data: { telegramDisconnectedAt: expect.any(Date) },
    });
  });

  it('any other error → FAILED and the mark is left alone', async () => {
    jest.mocked(staffChatOf).mockResolvedValue({ chatId: '777', roleIds: [1] });
    const { svc, bot, prisma } = setup();
    bot.telegram.sendChatAction.mockRejectedValue(new Error('socket hang up'));
    expect(await svc.probe(50)).toEqual({ reach: 'FAILED', note: 'Telegram vaqtincha javob bermadi' });
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('no bot → NO_BOT', async () => {
    jest.mocked(staffChatOf).mockResolvedValue({ chatId: '777', roleIds: [1] });
    expect(await setup({ bot: null }).svc.probe(50)).toEqual({ reach: 'NO_BOT', note: 'Bot ishlamayapti' });
  });
});

describe('botActive', () => {
  it('true when getMe answers, cached for a minute', async () => {
    const { svc, bot } = setup();
    expect(await svc.botActive()).toBe(true);
    expect(await svc.botActive()).toBe(true);
    expect(bot.telegram.getMe).toHaveBeenCalledTimes(1);
  });
  it('false without a bot or when getMe fails', async () => {
    expect(await setup({ bot: null }).svc.botActive()).toBe(false);
    const { svc, bot } = setup();
    bot.telegram.getMe.mockRejectedValue(new Error('401'));
    expect(await svc.botActive()).toBe(false);
  });
});

describe('preview', () => {
  it('plain text of today\'s report for the recipient, null when no branch is allowed', async () => {
    const { svc } = setup();
    const text = await svc.preview(rec as never);
    expect(text).toContain('holati');
    expect(text).not.toContain('<b>');
    expect(await setup({ branches: [] }).svc.preview(rec as never)).toBeNull();
  });
});
```

Adapt the spec's `setup()` so `bot` is returned in its result (`const bot = opts.bot === undefined ? { telegram: { sendMessage, sendChatAction: jest.fn().mockResolvedValue(true), getMe: jest.fn().mockResolvedValue({ id: 1 }) } } : opts.bot;` and return `{ svc, prisma, collect, sendMessage, bot }`). Existing tests keep passing. Run → new tests FAIL.

- [ ] **Step 4: Implement in `PersonalReportService`**

Add imports: `classifyTelegramError`, `describeError` (from `../telegram-digest/telegram-send`), `unreachableReason` (from `../telegram/utils/student-chat-reach`), `htmlToPlainText` (from `../refunds/refund-student-text`), `attemptNote` (from `./reach-state`). Then:

```ts
export type ProbeResult = {
  reach: 'DELIVERED' | 'BLOCKED' | 'UNLINKED' | 'NO_BOT' | 'FAILED';
  note: string | null;
};

const BOT_CHECK_TTL_MS = 60_000;
const GET_ME_TIMEOUT_MS = 3_000;

  private botCheck: { at: number; active: boolean } | null = null;

  /** Is the main bot configured and does Telegram answer it? Cached a minute. */
  async botActive(): Promise<boolean> {
    if (this.botCheck && Date.now() - this.botCheck.at < BOT_CHECK_TTL_MS) {
      return this.botCheck.active;
    }
    const bot = this.telegram.getBot() as unknown as
      | { telegram: { getMe(): Promise<unknown> } }
      | null
      | undefined;
    let active = false;
    if (bot) {
      try {
        await Promise.race([
          bot.telegram.getMe(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), GET_ME_TIMEOUT_MS)),
        ]);
        active = true;
      } catch {
        active = false;
      }
    }
    this.botCheck = { at: Date.now(), active };
    return active;
  }

  /**
   * «Ulanishni tekshirish»: a silent `typing` action — nothing appears in the
   * person's chat. 403 «blocked» is the only certain «will not arrive». The
   * mark on the account is written here at once (the send wrapper that also
   * learns it writes in the background, too late for the page's refetch);
   * its conditional write then finds nothing to change.
   */
  async probe(userId: number): Promise<ProbeResult> {
    const chat = await staffChatOf(this.prisma, userId);
    if (!chat) return { reach: 'UNLINKED', note: 'Telegram ulanmagan' };
    const bot = this.telegram.getBot() as unknown as
      | { telegram: { sendChatAction(chatId: string, action: string): Promise<unknown> } }
      | null
      | undefined;
    if (!bot) return { reach: 'NO_BOT', note: 'Bot ishlamayapti' };
    try {
      await bot.telegram.sendChatAction(chat.chatId, 'typing');
    } catch (err) {
      const failure = classifyTelegramError(err);
      if (failure.kind === 'permanent') {
        await this.prisma.user.updateMany({
          where: { id: userId, telegramDisconnectedAt: null },
          data: { telegramDisconnectedAt: new Date() },
        });
        return { reach: 'BLOCKED', note: unreachableReason(failure.description) };
      }
      return { reach: 'FAILED', note: 'Telegram vaqtincha javob bermadi' };
    }
    await this.prisma.user.updateMany({
      where: { id: userId, telegramDisconnectedAt: { not: null } },
      data: { telegramDisconnectedAt: null },
    });
    return { reach: 'DELIVERED', note: null };
  }

  /** The report as plain text with today's real figures; null = no allowed branch. */
  async preview(r: RecipientLike): Promise<string | null> {
    const report = await this.compose(r, 'all');
    return report ? htmlToPlainText(report.text) : null;
  }

  /** The attempt log the page shows; never fails a delivery. */
  private async recordAttempt(r: RecipientLike, result: DeliverResult, at: Date): Promise<void> {
    try {
      await this.prisma.telegramReportRecipient.updateMany({
        where: { companyId: r.companyId, userId: r.userId },
        data: { lastAttemptAt: at, lastAttemptOk: result.ok, lastAttemptNote: attemptNote(result) },
      });
    } catch (err) {
      this.logger.warn(`could not record the report attempt: ${describeError(err)}`);
    }
  }
```

Add `private readonly logger = new Logger(PersonalReportService.name);` (import `Logger` from `@nestjs/common`). Rename the existing `deliver` body to a private `send(r, cache, now): Promise<DeliverResult>` and make the public method:

```ts
  async deliver(r: RecipientLike, cache: ReportCache = new Map(), now = new Date()): Promise<DeliverResult> {
    const result = await this.send(r, cache, now);
    await this.recordAttempt(r, result, now);
    return result;
  }
```

(If `send` throws, nothing is recorded — the cron logs the throw.)

- [ ] **Step 5: Run, format, commit**

```bash
cd server && npx jest src/telegram-report && npm run typecheck && npx prettier --write src/telegram-report && npx eslint src/telegram-report
git add src/telegram-report
git commit -m "feat(telegram-report): reach state, attempt log, probe and preview"
```
Expected: PASS.

---

### Task 3: API — richer list, `check` and `preview` routes

**Files:**
- Modify: `server/src/telegram-report/telegram-report-recipients.service.ts` (+ its spec)
- Modify: `server/src/telegram-report/telegram-report.controller.ts` (+ its spec)
- Modify: `server/src/common/auth/branch-route-policy.ts`, `server/src/common/permissions/route-access.snapshot.json`

**Interfaces:**
- Consumes: `reachOf` (Task 2), `PersonalReportService.botActive/probe/preview` (Task 2).
- Produces (JSON the client reads in Tasks 4–5):

```ts
// RecipientView gains:
reach: 'BLOCKED' | 'UNLINKED' | 'DELIVERED' | 'LINKED';
blockedAt: string | null;                       // User.telegramDisconnectedAt, ISO
lastAttempt: { at: string; ok: boolean; note: string | null } | null;
// GET /telegram-report/recipients → { recipients, branches, bot: { active: boolean } }
// POST /telegram-report/recipients/:id/check → ProbeResult
// GET  /telegram-report/recipients/:id/preview → { text: string | null }
```

- [ ] **Step 1: Failing tests (recipients service spec)**

In `telegram-report-recipients.service.spec.ts` (the existing `setup()` returns `{ svc, prisma, history, reports }`): extend the `user.findMany` mock rows with `telegramDisconnectedAt: null`, give `reports` `botActive: jest.fn().mockResolvedValue(true)`, `probe`, `preview` mocks, and give `ROW` `lastAttemptAt: null, lastAttemptOk: null, lastAttemptNote: null`. Existing assertions stay valid. Append:

```ts
describe('reach in the list', () => {
  it('reports the bot status with the list', async () => {
    const { svc } = setup();
    expect((await svc.list(1)).bot).toEqual({ active: true });
  });

  it('LINKED when linked and never tried', async () => {
    const { svc } = setup();
    const r = (await svc.list(1)).recipients[0];
    expect(r).toEqual(expect.objectContaining({ reach: 'LINKED', blockedAt: null, lastAttempt: null }));
  });

  it('BLOCKED carries the date; DELIVERED carries the last attempt', async () => {
    const { svc, prisma } = setup();
    prisma.user.findMany.mockResolvedValue([
      { id: 50, firstName: 'Ali', lastName: 'Valiyev', position: 'Administrator', telegramDisconnectedAt: new Date('2026-10-16T10:00:00Z') },
    ]);
    expect((await svc.list(1)).recipients[0]).toEqual(
      expect.objectContaining({ reach: 'BLOCKED', blockedAt: '2026-10-16T10:00:00.000Z' }),
    );
    prisma.user.findMany.mockResolvedValue([
      { id: 50, firstName: 'Ali', lastName: 'Valiyev', position: null, telegramDisconnectedAt: null },
    ]);
    prisma.telegramReportRecipient.findMany.mockResolvedValue([
      { ...ROW, lastAttemptAt: new Date('2026-10-17T16:00:00Z'), lastAttemptOk: true, lastAttemptNote: null },
    ]);
    expect((await svc.list(1)).recipients[0]).toEqual(
      expect.objectContaining({ reach: 'DELIVERED', lastAttempt: { at: '2026-10-17T16:00:00.000Z', ok: true, note: null } }),
    );
  });
});

describe('check and preview', () => {
  it('check runs the probe for the recipient of the caller\'s company', async () => {
    const { svc, prisma, reports } = setup();
    reports.probe = jest.fn().mockResolvedValue({ reach: 'DELIVERED', note: null });
    expect(await svc.check(1, 7)).toEqual({ reach: 'DELIVERED', note: null });
    expect(prisma.telegramReportRecipient.findFirst).toHaveBeenCalledWith({ where: { id: 7, companyId: 1 } });
    expect(reports.probe).toHaveBeenCalledWith(ROW.userId);
  });

  it('preview returns the text; another company → 404', async () => {
    const { svc, prisma, reports } = setup();
    reports.preview = jest.fn().mockResolvedValue('📊 16.10 — 21:00 holati');
    expect(await svc.preview(1, 7)).toEqual({ text: '📊 16.10 — 21:00 holati' });
    prisma.telegramReportRecipient.findFirst.mockResolvedValue(null);
    await expect(svc.preview(1, 7)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.check(1, 7)).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

Run `cd server && npx jest src/telegram-report/telegram-report-recipients.service.spec.ts` → new tests FAIL.

- [ ] **Step 2: Implement the service**

In `view()`: add `telegramDisconnectedAt: true` to the `user.findMany` `select`; for each row compute

```ts
const linked = (await staffChatOf(this.prisma, r.userId)) !== null;
const disconnectedAt = u?.telegramDisconnectedAt ?? null;
...
telegramLinked: linked,
reach: reachOf({ linked, disconnectedAt, lastAttemptOk: r.lastAttemptOk }),
blockedAt: disconnectedAt ? disconnectedAt.toISOString() : null,
lastAttempt: r.lastAttemptAt
  ? { at: r.lastAttemptAt.toISOString(), ok: r.lastAttemptOk === true, note: r.lastAttemptNote }
  : null,
```

`list()` returns `{ recipients, branches, bot: { active: await this.reports.botActive() } }`. Add:

```ts
  /** «Ulanishni tekshirish»: asks Telegram, shows nothing to the staff member. */
  async check(companyId: number, id: number) {
    const row = await this.one(companyId, id);
    return this.reports.probe(row.userId);
  }

  /** The report this recipient would get now, as plain text with real figures. */
  async preview(companyId: number, id: number) {
    const row = await this.one(companyId, id);
    return { text: await this.reports.preview(row) };
  }
```

`historyValues` is unchanged (attempt fields are not settings).

- [ ] **Step 3: Controller + manifest**

Add to `telegram-report.controller.ts`:

```ts
  @Post('recipients/:id/check')
  @CeoOnly()
  check(@Param('id', ParseIntPipe) id: number, @CurrentUser('companyId') companyId: number) {
    return this.recipients.check(companyId, id);
  }

  @Get('recipients/:id/preview')
  @CeoOnly()
  preview(@Param('id', ParseIntPipe) id: number, @CurrentUser('companyId') companyId: number) {
    return this.recipients.preview(companyId, id);
  }
```

`telegram-report.controller.spec.ts`: add `'check'` and `'preview'` to the `it.each` list. In `branch-route-policy.ts` add `'POST /telegram-report/recipients/:id/check'` and `'GET /telegram-report/recipients/:id/preview'` to the existing `/telegram-report/...` COMPANY_WIDE block's `routes`. In `route-access.snapshot.json` add the same two keys with `["CEO"]` (sorted position; do not prettier the file; a short node script that parses, adds, sorts keys and re-writes with `JSON.stringify(obj, null, 2)` then restores the file's own array style is acceptable only if the diff stays at +6 lines — otherwise insert by hand).

- [ ] **Step 4: Run, format, commit**

```bash
cd server && npx jest src/telegram-report src/common/permissions src/common/auth/branch-route-policy.spec.ts && npm run typecheck && npx prettier --write src/telegram-report src/common/auth/branch-route-policy.ts && npx eslint src/telegram-report
git add src/telegram-report src/common/auth/branch-route-policy.ts src/common/permissions/route-access.snapshot.json
git commit -m "feat(telegram-report): reach state, bot status, check and preview routes"
```
Expected: PASS.

---

### Task 4: Client data layer — types, labels, filter and count helpers

**Files:**
- Modify: `client/src/components/settings/telegram-report/telegram-report-api.ts`
- Create: `client/src/components/settings/telegram-report/recipient-view.ts`
- Test: `client/src/components/settings/telegram-report/recipient-view.test.ts`

**Interfaces:**
- Consumes: the JSON shapes of Task 3.
- Produces: `Reach`, `Recipient` (extended), `Probe`, `fetch*/check/preview` helpers; and pure helpers:

```ts
export type RecipientFilter = "all" | "problem" | "off";
export function filterRecipients(list: Recipient[], query: string, filter: RecipientFilter): Recipient[];
export function summarize(list: Recipient[]): { total: number; reaching: number; problem: number };
export interface ReachMeta { label: string; tone: "ok" | "bad" | "warn" | "off"; note: string }
export function reachMeta(r: Recipient, now: Date): ReachMeta;
export function formatWhen(iso: string, now: Date): string;   // "bugun 21:00" | "16.10 21:00"
export function branchSummary(r: Recipient, branches: BranchOption[]): string;
```

- [ ] **Step 1: API types**

In `telegram-report-api.ts` extend `Recipient`:

```ts
export type Reach = "BLOCKED" | "UNLINKED" | "DELIVERED" | "LINKED";
export interface LastAttempt { at: string; ok: boolean; note: string | null }
// in Recipient:
  reach: Reach;
  blockedAt: string | null;
  lastAttempt: LastAttempt | null;
```

`fetchRecipients` returns `{ recipients; branches; bot: { active: boolean } }`. Add:

```ts
export type ProbeReach = "DELIVERED" | "BLOCKED" | "UNLINKED" | "NO_BOT" | "FAILED";
export interface Probe { reach: ProbeReach; note: string | null }
export const checkRecipient = async (id: number) =>
  (await api.post<Probe>(`/telegram-report/recipients/${id}/check`)).data;
export const previewRecipient = async (id: number) =>
  (await api.get<{ text: string | null }>(`/telegram-report/recipients/${id}/preview`)).data;
```

- [ ] **Step 2: Failing tests**

`recipient-view.test.ts` (build a `rec(over)` factory with every `Recipient` field):

```ts
import { describe, expect, it } from "vitest";
import type { Recipient } from "./telegram-report-api";
import { branchSummary, filterRecipients, formatWhen, reachMeta, summarize } from "./recipient-view";

const rec = (over: Partial<Recipient> = {}): Recipient => ({
  id: 1, userId: 50, name: "Ali Valiyev", position: "Administrator", sendTime: "21:00",
  layout: "BY_SECTION", allBranches: false, branchIds: [1], sections: ["STUDENTS"], isActive: true,
  lastSentDate: null, telegramLinked: true, noBranch: false,
  reach: "LINKED", blockedAt: null, lastAttempt: null, ...over,
});
const NOW = new Date("2026-10-17T12:00:00Z"); // 17:00 Tashkent

describe("filterRecipients", () => {
  const list = [
    rec({ id: 1, name: "Ali Valiyev", position: "Administrator" }),
    rec({ id: 2, name: "Dilnoza Karimova", position: "Filial direktori", reach: "BLOCKED" }),
    rec({ id: 3, name: "Sardor Aliyev", position: "Kassir", reach: "UNLINKED" }),
    rec({ id: 4, name: "Madina Rahimova", isActive: false }),
  ];
  it("searches name and position, ignoring case and spaces at the ends", () => {
    expect(filterRecipients(list, "  ali ", "all").map((r) => r.id)).toEqual([1, 3]);
    expect(filterRecipients(list, "DIREKTOR", "all").map((r) => r.id)).toEqual([2]);
  });
  it("«problem» = blocked or unlinked; «off» = switched off", () => {
    expect(filterRecipients(list, "", "problem").map((r) => r.id)).toEqual([2, 3]);
    expect(filterRecipients(list, "", "off").map((r) => r.id)).toEqual([4]);
  });
  it("combines the query with the filter", () => {
    expect(filterRecipients(list, "ali", "problem").map((r) => r.id)).toEqual([3]);
  });
});

describe("summarize", () => {
  it("counts all, reaching (not blocked/unlinked) and problems", () => {
    const list = [rec({ reach: "DELIVERED" }), rec({ reach: "LINKED" }), rec({ reach: "BLOCKED" }), rec({ reach: "UNLINKED" })];
    expect(summarize(list)).toEqual({ total: 4, reaching: 2, problem: 2 });
  });
});

describe("reachMeta", () => {
  it("DELIVERED shows the last attempt", () => {
    const m = reachMeta(rec({ reach: "DELIVERED", lastAttempt: { at: "2026-10-17T11:00:00Z", ok: true, note: null } }), NOW);
    expect(m).toEqual({ label: "Yetadi", tone: "ok", note: "oxirgi: bugun 16:00" });
  });
  it("LINKED says nothing was sent yet", () => {
    expect(reachMeta(rec(), NOW)).toEqual({ label: "Ulangan", tone: "ok", note: "hali yuborilmagan" });
  });
  it("BLOCKED shows the last failure note or the default reason, with the date", () => {
    expect(reachMeta(rec({ reach: "BLOCKED", blockedAt: "2026-10-16T10:00:00Z" }), NOW)).toEqual({
      label: "Yetmaydi", tone: "bad", note: "botni bloklagan · 16.10 dan",
    });
    expect(reachMeta(rec({ reach: "BLOCKED", blockedAt: "2026-10-16T10:00:00Z", lastAttempt: { at: "2026-10-16T16:00:00Z", ok: false, note: "Telegram hisobini o'chirgan" } }), NOW).note)
      .toBe("Telegram hisobini o'chirgan · 16.10 dan");
  });
  it("UNLINKED tells what to do", () => {
    expect(reachMeta(rec({ reach: "UNLINKED" }), NOW)).toEqual({ label: "Ulanmagan", tone: "warn", note: "botda /xodim kerak" });
  });
  it("a switched-off recipient is «O'chirilgan» whatever the reach", () => {
    expect(reachMeta(rec({ isActive: false, reach: "BLOCKED" }), NOW).tone).toBe("off");
  });
});

describe("formatWhen", () => {
  it("«bugun» for the Tashkent day of now, DD.MM otherwise", () => {
    expect(formatWhen("2026-10-17T11:00:00Z", NOW)).toBe("bugun 16:00");
    expect(formatWhen("2026-10-16T11:00:00Z", NOW)).toBe("16.10 16:00");
  });
});

describe("branchSummary", () => {
  const branches = [{ id: 1, name: "Farg'ona" }, { id: 2, name: "Namangan" }];
  it("names the branches, «hamma filial» for all, a warning for none", () => {
    expect(branchSummary(rec(), branches)).toBe("Farg'ona");
    expect(branchSummary(rec({ branchIds: [1, 2] }), branches)).toBe("Farg'ona, Namangan");
    expect(branchSummary(rec({ allBranches: true }), branches)).toBe("hamma filial");
    expect(branchSummary(rec({ branchIds: [], noBranch: true }), branches)).toBe("filial tanlanmagan");
  });
});
```

Run `cd client && npx vitest run src/components/settings/telegram-report/recipient-view.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `recipient-view.ts`**

```ts
import type { BranchOption, Recipient } from "./telegram-report-api";

export type RecipientFilter = "all" | "problem" | "off";

const TZ = "Asia/Tashkent";
const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });
const timeOf = (d: Date) =>
  d.toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dmOf = (d: Date) => {
  const [, m, day] = dayKey(d).split("-");
  return `${day}.${m}`;
};

/** «bugun 16:00» for the Tashkent day of `now`, else «16.10 16:00». */
export function formatWhen(iso: string, now: Date): string {
  const d = new Date(iso);
  return `${dayKey(d) === dayKey(now) ? "bugun" : dmOf(d)} ${timeOf(d)}`;
}

const isProblem = (r: Recipient) => r.reach === "BLOCKED" || r.reach === "UNLINKED";

export function filterRecipients(list: Recipient[], query: string, filter: RecipientFilter): Recipient[] {
  const q = query.trim().toLowerCase();
  return list.filter((r) => {
    if (filter === "problem" && !isProblem(r)) return false;
    if (filter === "off" && r.isActive) return false;
    if (!q) return true;
    return `${r.name} ${r.position ?? ""}`.toLowerCase().includes(q);
  });
}

export function summarize(list: Recipient[]) {
  const problem = list.filter(isProblem).length;
  return { total: list.length, reaching: list.length - problem, problem };
}

export interface ReachMeta {
  label: string;
  tone: "ok" | "bad" | "warn" | "off";
  note: string;
}

/** The Telegram cell of a row: what to print and in which colour. */
export function reachMeta(r: Recipient, now: Date): ReachMeta {
  if (!r.isActive) return { label: "O'chirilgan", tone: "off", note: "hisobot bormaydi" };
  switch (r.reach) {
    case "DELIVERED":
      return {
        label: "Yetadi",
        tone: "ok",
        note: r.lastAttempt ? `oxirgi: ${formatWhen(r.lastAttempt.at, now)}` : "yetib boradi",
      };
    case "LINKED":
      return { label: "Ulangan", tone: "ok", note: "hali yuborilmagan" };
    case "BLOCKED": {
      const why = r.lastAttempt && !r.lastAttempt.ok && r.lastAttempt.note ? r.lastAttempt.note : "botni bloklagan";
      const since = r.blockedAt ? ` · ${dmOf(new Date(r.blockedAt))} dan` : "";
      return { label: "Yetmaydi", tone: "bad", note: `${why}${since}` };
    }
    default:
      return { label: "Ulanmagan", tone: "warn", note: "botda /xodim kerak" };
  }
}

export function branchSummary(r: Recipient, branches: BranchOption[]): string {
  if (r.allBranches) return "hamma filial";
  const names = branches.filter((b) => r.branchIds.includes(b.id)).map((b) => b.name);
  return names.length ? names.join(", ") : "filial tanlanmagan";
}
```

Note the second `BLOCKED` expectation in the test: with a failed last attempt note «Telegram hisobini o'chirgan» the note is `«…» · 16.10 dan`; with no attempt it is `botni bloklagan · 16.10 dan`. Run → PASS.

- [ ] **Step 4: Check and commit**

```bash
cd client && npx tsc --noEmit -p . 2>&1 | head -20
```
`tsc` will now fail in `telegram-report-settings-client.tsx` / `recipient-card.tsx` only if they construct a `Recipient` literal — they do not (they read it), so it must pass. If it fails, fix only the type usage.

```bash
npx eslint src/components/settings/telegram-report && npx vitest run src/components/settings/telegram-report
git add src/components/settings/telegram-report
git commit -m "feat(settings): telegram report page helpers — filter, summary, reach labels"
```

---

### Task 5: Client page — summary cards, search + filters, table, side panel, add dialog

**Files:**
- Create: `client/src/components/settings/telegram-report/summary-cards.tsx`
- Create: `client/src/components/settings/telegram-report/recipient-table.tsx` (+ `recipient-table.test.ts`)
- Create (by `git mv recipient-card.tsx recipient-panel.tsx`, then edit): `recipient-panel.tsx`
- Create: `client/src/components/settings/telegram-report/add-recipient-dialog.tsx`
- Rewrite: `client/src/components/settings/telegram-report/telegram-report-settings-client.tsx`

**Interfaces:**
- Consumes: Task 4's helpers and API; shadcn components already used by the old card (`Select`, `Checkbox`, `Switch`, `Badge`, `Button`, `Label`, `AlertDialog*`, `Skeleton`, `Input`, `Dialog*`). Check the real export names with `grep -n "^export" client/src/components/ui/<file>.tsx` before writing; do not add UI components or dependencies.
- Produces: the page; no new exports used elsewhere.

**Behaviour (spec for this task):**
- Tepada: `SummaryCards` — «Oluvchilar» (`total`), «Hisobot yetadi» (`reaching`, green), «Yetmaydi» (`problem`, red when > 0), «Bot» (`bot.active` → «ishlayapti» green / «o'chiq» red).
- Qidiruv: `Input` with a search icon, placeholder «Ism yoki lavozim bo'yicha qidirish»; filter chips «Hammasi / Yetmaydi / O'chirilgan» (toggle-style buttons; active chip filled); «Oluvchi qo'shish» button opens `AddRecipientDialog`.
- Jadval: columns Xodim (name, then `position · branchSummary` muted), Telegram (pill from `reachMeta` + muted note), Vaqt, Ko'rinish (short layout label: Bo'lim / Jadval / Filial / Jami), Yoqilgan switch. The row is a button (`role="button"`, `tabIndex=0`, Enter/Space select); the switch stops propagation. Selected row highlighted. Empty states: «Hali oluvchi yo'q» / «Hech narsa topilmadi».
- Yon panel (`RecipientPanel`) for the selected recipient (first row selected by default; selection survives refetch by id; if the selected id disappears select the first): all the controls the old card had (Vaqt, Ko'rinish with hint, Filiallar with «Barcha filiallar», Bo'limlar with «· pul» tags, the last-section lock) plus: «Namunani ko'rish» (loads `previewRecipient` on click, shows the text in a muted `<pre className="whitespace-pre-wrap text-xs">`, «Namuna hozirgi raqamlar bilan»; `null` → «Filial tanlanmagan — namuna yo'q»), «Hozir yuborish» (existing test send, disabled when `reach` is `UNLINKED` or `BLOCKED`), «Ulanishni tekshirish» (`checkRecipient`, toast per result: DELIVERED «Xabar yetadi», BLOCKED «Xodim botni bloklagan», UNLINKED «Telegram ulanmagan», NO_BOT «Bot ishlamayapti», FAILED «Tekshirib bo'lmadi, keyinroq urinib ko'ring»; then refetch), «Olib tashlash» behind the existing confirm dialog. The panel header repeats name, position and the Telegram pill + note.
- Layout: `grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]`; below `lg` the panel stacks under the table. Table rows never overflow: name cell `truncate`.
- Every mutation's `onSuccess` returns the invalidation promise (the double-toggle lost-update fix of ADR-0095's final review must not regress): `refresh()` returns `Promise.all([invalidate(KEY), invalidate(CANDIDATES)])`, and the panel's controls are disabled while `patch.isPending`.
- Error screen only for `isError && !data`.
- No emoji-only controls: icons from `lucide-react` (`Search`, `Plus`, `Send`, `ShieldCheck`/`RefreshCw`, `Trash2`, `Eye`).
- All strings Uzbek, exactly as quoted above.

- [ ] **Step 1: Failing test for the table**

`recipient-table.test.ts` uses `renderToStaticMarkup` (the repo's pattern for component tests; see `client/src/components/settings/telegram-announce-dialog.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Recipient } from "./telegram-report-api";
import { RecipientTable } from "./recipient-table";

const base: Recipient = {
  id: 1, userId: 50, name: "Ali Valiyev", position: "Administrator", sendTime: "21:00",
  layout: "BY_SECTION", allBranches: false, branchIds: [1], sections: ["STUDENTS"], isActive: true,
  lastSentDate: null, telegramLinked: true, noBranch: false, reach: "DELIVERED", blockedAt: null,
  lastAttempt: { at: "2026-10-17T11:00:00Z", ok: true, note: null },
};
const branches = [{ id: 1, name: "Farg'ona" }];
const html = (rows: Recipient[], extra: Partial<Parameters<typeof RecipientTable>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(RecipientTable, {
      rows, branches, selectedId: 1, now: new Date("2026-10-17T12:00:00Z"),
      onSelect: () => {}, onToggle: () => {}, empty: "Hali oluvchi yo'q", ...extra,
    }),
  );

describe("RecipientTable", () => {
  it("prints name, position and branch, the reach pill and the note", () => {
    const out = html([base]);
    expect(out).toContain("Ali Valiyev");
    expect(out).toContain("Administrator");
    expect(out).toContain("Farg&#x27;ona");
    expect(out).toContain("Yetadi");
    expect(out).toContain("oxirgi: bugun 16:00");
    expect(out).toContain("21:00");
  });

  it("marks the selected row and shows the problem pills", () => {
    const out = html([base, { ...base, id: 2, name: "Dilnoza", reach: "BLOCKED", blockedAt: "2026-10-16T10:00:00Z" }]);
    expect(out).toContain('aria-selected="true"');
    expect(out).toContain("Yetmaydi");
    expect(out).toContain("botni bloklagan");
  });

  it("shows the empty text when there are no rows", () => {
    expect(html([], { empty: "Hech narsa topilmadi" })).toContain("Hech narsa topilmadi");
  });
});
```

Run → FAIL (module missing).

- [ ] **Step 2: Implement `recipient-table.tsx`**

Props: `{ rows: Recipient[]; branches: BranchOption[]; selectedId: number | null; now: Date; onSelect(id: number): void; onToggle(id: number, isActive: boolean): void; empty: string }`. Render a bordered rounded container; a header row (hidden below `sm`) and one row per recipient as `<div role="row" aria-selected=… >`. Grid `grid-cols-[minmax(0,1.6fr)_minmax(0,1.3fr)_64px_72px_44px]` from `md`; below `md` stack name + pill. Pill classes by tone: `ok` → `bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200`, `bad` → red equivalents, `warn` → amber, `off` → `bg-muted text-muted-foreground` (use the project's existing `Badge` variants if they fit; otherwise these utility classes). Layout short labels: `{ BY_SECTION: "Bo'lim", TABLE: "Jadval", BY_BRANCH: "Filial", TOTAL_ONLY: "Jami" }`. The row root is `role="row"` with an inner `button` over the name cell that calls `onSelect` (keyboard-accessible); the `Switch` has `onClick={(e) => e.stopPropagation()}` and `aria-label="Yoqilgan"`.

- [ ] **Step 3: Implement the rest**

`summary-cards.tsx` (props `{ total; reaching; problem; botActive }`, four small cards in a `grid grid-cols-2 sm:grid-cols-4 gap-3`), `add-recipient-dialog.tsx` (props `{ candidates: Candidate[]; open; onOpenChange; onAdd(userId): void; pending }`, a `Select` of candidates labelled `name — position` + «Qo'shish» button, closes on success, text «Qo'shiladigan xodim yo'q» when the list is empty), `recipient-panel.tsx` (from the old card; the header block is replaced by name/position/pill; the preview and probe buttons are added), and the rewritten `telegram-report-settings-client.tsx` composing everything: `useQuery(KEY)`, `useQuery(CANDIDATES)`, `useState` for `query`, `filter`, `selectedId`, `addOpen`; `const now = new Date()` once per render via `useMemo(() => new Date(), [data])`; mutations as in the current file plus `check`.

Selection rule:
```ts
const rows = filterRecipients(data.recipients, query, filter);
const selected = data.recipients.find((r) => r.id === selectedId) ?? rows[0] ?? data.recipients[0] ?? null;
```
(the panel shows `selected`; the table highlights `selected?.id`).

- [ ] **Step 4: Checks**

```bash
cd client && npx tsc --noEmit -p . && npx eslint src/components/settings/telegram-report && npx vitest run src/components/settings/telegram-report src/lib/settings-nav.test.ts
```
Expected: PASS, no lint errors. (No prettier.)

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/telegram-report
git commit -m "feat(settings): telegram report page — search, filters, table and side panel"
```

---

### Task 6: ADR, guide, CLAUDE.md, full verification

**Files:**
- Create: `docs/adr/0097-xodim-telegram-yetib-borishi.md`; modify `docs/adr/README.md`
- Modify: `client/src/qollanma/kontent/hisobotlar/telegram-hisobot.mdx`, `client/src/qollanma/yangiliklar.ts`
- Modify: `server/CLAUDE.md`

- [ ] **Step 1: ADR-0097 (Uzbek; header shape of ADR-0093/0095)**

```markdown
# ADR-0097 — Xodimning Telegrami: xabar yetib borishi sahifada ko'rinadi

**Holati:** Qabul qilindi
**Sana:** 2026-10-17
**Bog'liq:** ADR-0066, ADR-0095, `docs/superpowers/plans/2026-10-17-telegram-hisobot-sahifa.md`, `server/src/telegram-report/`, `server/src/telegram/utils/student-chat-reach.ts`

## Kontekst

ADR-0095 sahifasi faqat «Telegram ulanganmi» ni ko'rsatardi. Xodim botni
bloklagan bo'lsa ham «ulangan» turardi va hisobot yetib bormasdi. CEO
(17.10.2026) xabar yetib borishini, oluvchilar ichida qidiruvni va qulayroq
sahifani so'radi.

## Qaror

1. `User.telegramDisconnectedAt` — o'quvchilardagi `Student.telegramDisconnectedAt`
   (ADR-0066) bilan bir xil qoida: bot xodim chatiga xabar yubora olmasa
   (bloklangan, hisob o'chirilgan) yoki Telegram `my_chat_member` orqali
   bloklanganini aytsa belgilanadi; xabar yetsa yoki blokdan chiqarsa
   o'chadi. Yozuvchi — o'sha `StudentChatReach` (xodim qatorlari ham, tarix
   qatori ham). Belgi yuborishni to'xtatmaydi.
2. «Ulanishni tekshirish» — `sendChatAction('typing')`: xodimning chatida
   hech narsa ko'rinmaydi. 403 «bloklagan» — yagona aniq «yetmaydi» javobi;
   boshqa xato belgini o'zgartirmaydi. Belgi shu yerning o'zida yoziladi
   (fon yozuvi sahifaning qayta yuklashiga yetib kelmasligi mumkin), shuning
   uchun bu yo'lda tarix qatori yozilmaydi.
3. Oluvchi qatorida oxirgi yuborish urinishi saqlanadi (`lastAttemptAt/Ok/Note`),
   `deliver()` ning o'zida: avtomatik yuborish ham, «Hozir yuborish» ham.
4. Holat to'rtta: `BLOCKED`, `UNLINKED`, `DELIVERED`, `LINKED` (tartib:
   ulanmagan → bloklangan → oxirgi urinish yetgan → ulangan, hali
   yuborilmagan). «Yetadi» faqat haqiqiy yetgan urinishdan keyin chiqadi.
5. «Bot ishlayaptimi» — `getMe()` javobi, 60 soniya keshlanadi.
6. «Namunani ko'rish» — oluvchining sozlamasi bilan hozirgi haqiqiy raqamlar,
   oddiy matn. Faqat CEO ko'radi (yangi yo'llarning hammasi `@CeoOnly()`).
7. Sahifa: qidiruv, filtr (Hammasi / Yetmaydi / O'chirilgan), tepada
   umumiy raqamlar, ixcham jadval va yon panel.

## Oqibatlari

- Bazaga to'rt ustun qo'shiladi (migratsiya `20261017120000_telegram_staff_reach`).
- Belgi «yetmaydi» desa ham yuborish urinishi davom etadi (ADR-0066); xodim
  blokdan chiqarsa, keyingi xabar yetadi va belgi o'zi o'chadi.
- Xodim botni hech qachon bloklamagan, lekin hisobi o'chirilgan bo'lsa,
  sabab oxirgi urinish izohida ko'rinadi.
```

README row after the 0096 row: `| [0097](0097-xodim-telegram-yetib-borishi.md) | Xodimning Telegrami: xabar yetib borishi sahifada ko'rinadi | Qabul qilindi | 2026-10-17 |`.

- [ ] **Step 2: Guide + news**

In `telegram-hisobot.mdx`: replace the «⚠️ belgisi» sentence with the new states and add a section:

```mdx
## Telegram holati

Har oluvchi qatorida xabar yetib borishi ko'rinadi:

- **Yetadi** — oxirgi hisobot yetib bordi.
- **Ulangan** — Telegram ulangan, lekin hali hisobot yuborilmagan.
- **Yetmaydi** — xodim botni bloklagan yoki Telegram hisobini o'chirgan. Sabab va sana qatorda yoziladi. Xodim botni blokdan chiqarsa, keyingi xabar yetadi va belgi o'zi o'chadi.
- **Ulanmagan** — xodim botda `/xodim` orqali ulanishi kerak.

Tepada oluvchilar soni, nechtasiga hisobot yetishi va botning o'zi ishlayotgani ko'rinadi. «Ulanishni tekshirish» tugmasi xodimga hech narsa ko'rsatmasdan, xabar yetib borishini tekshiradi.

## Qidiruv va namuna

Oluvchilarni ism yoki lavozim bo'yicha qidirish, «Yetmaydi» yoki «O'chirilgan» deb saralash mumkin. Qatorni bossangiz o'ngda uning sozlamalari ochiladi. «Namunani ko'rish» hisobotni shu oluvchining sozlamasi va hozirgi raqamlar bilan ko'rsatadi.
```

`yangiliklar.ts`: new first entry `sana: "2026-10-17"`, `sarlavha: "Telegram hisobot sahifasi yangilandi"`, matn: «Sozlamalar → «Telegram hisobot» endi jadval ko'rinishida: oluvchilarni ism yoki lavozim bo'yicha qidirish, «Yetmaydi» va «O'chirilgan» bo'yicha saralash mumkin. Har oluvchida xabar yetib borishi (xodim botni bloklaganmi), tepada botning holati ko'rinadi, «Ulanishni tekshirish» xodimga bildirmasdan tekshiradi, «Namunani ko'rish» hisobotni hozirgi raqamlar bilan ko'rsatadi.», `rollar: [1]`, `sahifa: { bolim: "hisobotlar", sahifa: "telegram-hisobot" }`. Update that page's `qisqacha` in `sahifalar/hisobotlar.ts` only if its text now contradicts the page (it does not). Add `"0097"` to that page's `adr` array.

- [ ] **Step 3: `server/CLAUDE.md`**

In the «Personal Telegram report» subsection add (English): staff accounts carry `User.telegramDisconnectedAt` written by `StudentChatReach` (now «students and staff») and by `PersonalReportService.probe`; `reachOf` order; `deliver()` records `lastAttempt*`; `botActive()` cached 60 s; `GET …/preview` returns today's real figures as plain text; the two new routes are `@CeoOnly()`. Update the «A student's chat can refuse the bot (ADR-0066)» heading paragraph with one sentence: «Staff accounts follow the same rule (ADR-0097): the same wrapper marks `User` rows on the chat.»

- [ ] **Step 4: Full verification**

```bash
cd server && npx prettier --write src/telegram-report src/telegram && npx eslint src/telegram-report src/telegram/utils/student-chat-reach.ts && npm run typecheck && npm run build && npm test
cd ../client && npx tsc --noEmit -p . && npx eslint src/components/settings/telegram-report src/qollanma src/lib && npx vitest run
```
Expected: all green. If an unrelated spec times out under load, re-run it alone and report both results; do not edit it.

- [ ] **Step 5: Commit**

```bash
git add docs client/src/qollanma server/CLAUDE.md
git commit -m "docs: ADR-0097 staff Telegram reach, guide and CLAUDE.md"
```

---

## After the plan

Controller steps (not tasks): drive the page against a mock API in the browser pane or headless Playwright (mock answers `reach` states, `check`, `preview`) and send screenshots; merge `origin/main` into the branch; push, open the PR, enable auto-fix. Deploy is manual (migration first, then Railway, then Vercel) and only on the CEO's word.
