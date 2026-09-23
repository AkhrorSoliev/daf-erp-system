# Review — Telegram Digest Batching Implementation Plan

**Date:** 2026-09-23
**Reviewed:** `docs/superpowers/plans/2026-09-23-telegram-digest-batching.md` (3029 lines, 15 tasks, uncommitted)
against the approved spec `docs/superpowers/specs/2026-09-23-telegram-digest-batching-design.md`,
ADR-0025, and the source on `worktree-telegram-digest-batching` (= `origin/main` 0534d57e + design commit).

**Method:** four parallel read-only reviewers (Tasks 1–3, 4–5, 6–10, 11–15) plus controller cross-checks
(Telegram send-site inventory, source-scanning guard specs, module graph, prod data). Every BLOCKER and
MAJOR below was re-verified in the source by the controller.

**Verdict:** the spec's direction is right, but the plan is **not correct as written**. It would not boot,
not build, and several of its own tests fail. It also silently changes user-visible behavior the spec
did not agree to, and loses messages in plausible edge cases.

---

## BLOCKERS — the plan as written fails

**B1. App does not boot.** `TelegramDigestModule` (Task 2 Step 6, plan 397–405) never imports
`TelegramModule`, but Task 5's cron injects `TelegramService` (plan 1162, 1191). `TelegramModule` is not
`@Global` (`src/telegram/telegram.module.ts:13-28`). Nest throws at startup; unit specs mock the service,
`test/app.e2e-spec.ts` is not in `npm test`, typecheck does not check DI. Railway would crash-loop after
`migrate deploy`. Found independently by all four reviewers.
*Fix:* `imports: [TelegramModule]` in Task 5 Step 5 (module graph checked: TelegramModule reaches only
Upload/Users/MockExams/Transactions/CashAccounts/PaymentLinks — no cycle). Add a boot check to Task 15.

**B2. Typecheck / `nest build` fail.**
- Task 4 (plan 861–868): `[TelegramDigestCategory.TASK_ASSIGNED, …].includes(i.category)` → TS2345
  (Prisma enum members are literal types). Use `const TASK_CATEGORIES: ReadonlySet<TelegramDigestCategory>`.
- Task 14 Step 3 (plan 2943–2961) removes only imports + providers; `TelegramGroupBroadcastService` is
  still in `exports` (`telegram-groups.module.ts:45`) → cannot find name. Spell out the final `exports`.

**B3. The plan's own tests fail.**
- Task 4 (plan 641–642, 669): `toContain('100 000')` — `formatSum` uses U+00A0 (`format.util.ts:7`,
  bytes C2 A0). Normalize with `.replace(/\u00A0/g, ' ')` as existing specs do.
- Task 6 (plan 1324–1347): the new test uses an undeclared `telegramService` (spec provides
  `{ getBot: () => null }` inline, `notification-events.listener.spec.ts:57`) and a module-level `enqueue`
  mock that is never cleared (no `clearAllMocks`, no `clearMocks` in jest config) → `not.toHaveBeenCalled()`
  fails. Task 7 copies this setup and leaves old tests reading `smsService.sendToStudent.mock.calls[0]`.
- Task 13 (plan 2647, 2720–2731): `groupUpdate = jest.fn()` returns `undefined`; the cron calls
  `.update(...).catch(...)` → TypeError escapes `flushDigests`. Add `groupUpdate.mockResolvedValue({})`.

**B4. Verification steps prove nothing.**
- Commands mix `server/`-relative and repo-relative paths: Global Constraints set cwd = `server/`, but
  most commits use `git add server/src/...` (plan 419, 567, 1000, 1302, 1484, 1616, 1732, 1937, 2043,
  2293, 2609, 2908, 2936–2938) → "pathspec did not match"; `cd server` fails at 82 and 2991.
- Task 15 Step 4's "untouched files" check uses `server/src/...` pathspecs from `server/` → always empty,
  and diffs against local `main` (62bd8e4c, 214 commits behind `origin/main`). Use
  `git diff --exit-code "$(git merge-base HEAD origin/main)" -- src/...`.
- Task 1 Step 5 cannot fail (nothing references the model yet). Task 15 has no boot check and no
  grep proving the removed code is gone.

---

## MAJOR — behavior the spec did not agree to, or real message loss

**M1. Student profile "SMS" tab and history timeline lose automated messages.** The spec (§ SmsMessage
audit) requires one `SmsMessage` row per STUDENT event at send time with a shared `telegramMessageId`;
plan line 1499 says Task 7 adds it to the cron, but no step or code does. Today `sms.service.ts:94-121`
writes `SmsMessage` + an EntityHistory entry (`SMS_YUBORILDI`), shown in `client/.../students/sms-tab.tsx`
and the history timeline. PAYMENT_* payloads also lack `performedById` (today's `senderUserId`).

**M2. Frozen / departed / graduated students stop getting payment receipts.** Task 3 filters students by
`isActive: true`; `students-status.service.ts:268` sets `isActive = status === ACTIVE`. Today receipts
filter only `deletedAt: null` (`payment-events.listener.ts:36-38`) and enrolled/removed use no filter.
Payments are accepted for any non-deleted student (`payments-write.service.ts:97`). Debtors paying old debt
and auto-paused students paying to resume would get nothing. **Needs a CEO decision** (spec change).

**M3. Receipt link dropped.** Today's receipt ends with `📄 Kvitansiya: <INVOICE_BASE_URL>/<paymentId>`
(`payment-events.listener.ts:52-59, :128`, two tests); the spec's payload example includes `receiptUrl`;
the renderer's `paymentLine` (plan 914–918) has no link.

**M4. Auto-pause messages are in neither list.** `absence-pause/absence-pause-notify.service.ts` sends
3-stage Telegram messages (student, branch admins, teachers, CEO alerts) directly from the 07:30 cron and
stores the send result in `AbsenceWarningLog.sentToStudent` (`absence-auto-pause.cron.service.ts:207-223`).
Batching it would break that field. Must be added to the spec/ADR "instant" list (ADR-0025 is unmerged).

**M5. One special character loses a student's whole digest.** The renderer passes payloads to
`buildEnrollmentMessage`/`buildRemovalMessage`, which insert `groupName`, `courseName`, `reason` raw into
HTML (`sms-templates.ts:44-46, 58-60`); `reason` is admin free text. Telegram 400 "can't parse entities" is
classified transient → retried daily for 7 days, then deleted. Today only that one message fails.

**M6. Telegram's 4096-character limit is not handled.**
- Personal: no cap; CEO correction reasons can be 500 chars (`correct-payment.dto.ts:37-40`); 400 "message
  is too long" → transient → 7 days of retries → silently deleted.
- Group: only a 30-lines-per-section cap (`constants.ts:13`), now over 24–72 h of events with free-text
  status reasons; on failure the rows are deleted anyway → the whole day's (or weekend's) digest is lost.

**M7. Personal cron robustness (Task 5).** 7-day purge only runs inside the send-error path: exceptions in
resolve/render keep rows forever; with no bot token the cron returns before reading rows (unbounded growth).
`forceExpire` also deletes today's rows. The warning counts recipients, not rows. `deleteMany` sits outside
the per-recipient try/catch: one DB error ends the run for everyone after, and a successful send whose delete
failed is re-sent tomorrow.

**M8. Group cron robustness (Task 13).** GROUP rows are never purged by the 7-day rule (spec/ADR say "any
row"); the no-bot path returns first. Per-company work has no try/catch: one exception skips the final
delete (duplicates next day) and a repeatable one stops every company. Transient send errors delete the
rows — acceptable for the old 3-hour batches, but now it drops a full day or weekend. **CEO decision:**
retry next run on transient errors?

**M9. Multi-assignee task updates collapse.** Task 6 dedups `TASK_STATUS_CHANGED` for the author by
`relatedEntityId: String(comment.id)`, but a task has several assignees (`comments.service.ts:145-151`) and
each status change emits its own event (`:471`). "Ali bajardi" is hidden by a later "Vali ko'rdi".
Key on `${comment.id}:${assignee.userId}`.

**M10. The migrated handlers are effectively untested.** Task 6's existing spec only covers
`handlePaymentCorrected` with Telegram disabled; the task/status/salary handlers have no tests, so Step 2's
expected failure cannot happen. Task 12's listener spec is described, not written (and drops the existing
fallback/escaping/negative cases).

---

## MINOR

1. `Keldi: 0` is printed; spec says zero values are omitted (plan 926).
2. Duplicate `METHOD_LABELS` (plan 759, 2155) — reuse `payments/shared/method-label.ts`
   (`PAYMENT_METHOD_LABEL`; TRANSFER is "Bank o'tkazmasi", plan says "O'tkazma").
3. No `orderBy` in either cron and dedup reorders rows → lines in arbitrary order.
4. Debt section drops today's "Iltimos, balansingizni to'ldiring" + portal link, and prints "— 0 so'm"
   where today the price line is skipped (`student-debt-notification.listener.ts:127-134`).
5. A queued debt line can be stale if the charge was reversed (attendance corrected to EXCUSED) before 20:00
   while the balance is still negative — re-check the unreversed SINGLE_UNCOVERED charge at render.
6. 429 rate limit not handled; attendance reminders share the main bot at 20:00 Mon–Sat.
7. Permanent failures (403/chat not found) delete rows with no log line (today: FAILED SmsMessage rows).
8. `ATTENDANCE_COMPLETED` keyed by `groupId` merges days after a retry; payload has no date.
9. Group digest window label is `HH:MM – HH:MM` with no dates ("20:30 – 20:00" after a weekend); status icons
   wrong (❄️ for graduate/unfreeze, 🚀 for group finished; `STUDENT_TRANSITION.icon` never stored); group
   status lines lack reason and actor (spec: "kim, sabab, kim o'zgartirgani"); actor shows double
   parentheses; dropping `groupedByBranch` reverses a deliberate choice (branch name repeated per line).
10. Task 12: the `entityType === 'Student'` guard is gone (latent); fallback lines for missing rows become
    silent drops; `WEEKDAY_LABELS` left in the code block → `no-unused-vars` error; Step 1 says "single
    ≥500k threshold" but the rule is ≥500k **or** Payme/Click/Uzum.
11. Branch-less groups: the plan's filter is fail-closed (matches `TelegramGroupBroadcastService` and the
    `TelegramGroup.receivesAllBranches` schema comment), unlike today's digest cron which gives them
    everything. **Prod check 2026-09-23 (read-only): exactly one approved active group, "Moliya-DaF Fergana",
    company 1001, branchId 1, receivesAllBranches false → no impact.** Keep fail-closed; add a test; say so in
    the spec.
12. Holiday check is global (any company/branch holiday skips all) and compares a UTC-midnight `endDate` at
    15:00 UTC — existing behavior carried over; out of scope, note only.
13. Redis leftovers: `tg-group:batch:<companyId>` entries at deploy time are never sent (≤3 h of events, or a
    weekend). Deploy right after a working day's 21:00 flush, or migrate them once.
14. Payloads are `Record<string, unknown>` — category/payload mismatches are not type-checked (Task 15 Step 2
    claims they are). Use a category→payload map or `satisfies`. `changeParts`/`statusLabel` are stored as
    finished text, which the spec forbids.
15. Task 8's `companyId == null` note is wrong (`Student.companyId` is never null there); the two
    "should not throw" tests with `companyId: null` prove nothing.
16. Task 3 spec uses one shared `findFirst` mock for both tables; add user-not-found cases.
17. Task 9 spec imports unused `TransactionType` (lint error in specs too); prettier line-length errors
    throughout (fixable with `--fix`); duplicate `@prisma/client` imports in Tasks 6/10.
18. Stale comments after the change: `group-report-scope.ts:15`, `constants.ts:5-7, 15-17`,
    `payments-write.service.ts:290-292`.
19. Group digest no longer dedups/throttles; a duplicate status event appears twice (UNSURE whether the spec's
    dedup rule applies to groups).
20. No guard spec enforces ADR-0025's "no direct `sendMessage`" rule (the repo has single-source guards,
    e.g. `common/date/tashkent.single-source.spec.ts`) — optional.
21. Spec text contains Cyrillic letters ("fақат", design §Render qoidalari) — Latin-only rule.

---

## Verified correct

- **Bots:** every personal path uses `TelegramService.getBot()` (`TELEGRAM_BOT_TOKEN`); groups use the admin
  bot. The plan keeps this split. `SmsService.sendToStudent` is Telegram-only — no SMS fallback is lost.
- **Guards:** `common/event-wiring.spec.ts` — the rewritten listeners keep exactly the same `@OnEvent` names;
  `common/date/tashkent.single-source.spec.ts` — no banned pattern in plan code.
- **Data:** schema placement, names, SQL (Prisma 7.5.0 style), migration workflow commands; `Student.balance`
  is `Int` and is the balance today's receipt shows; every payload field Tasks 6–12 write matches what the
  renderers read; recipients match today's for every handler; ids overlap between Student/User is handled
  by keying on kind.
- **Group side:** selection query matches `broadcast()` exactly; thresholds (≥500k or online) preserved; ≥5M
  instant path removed as agreed; Sunday/holiday skip preserved; only rows read in the run are deleted;
  403 → group deactivated; nothing else in `src`, `scripts`, `test` or `client` depends on the removed code.
- **No conflicts** with other open branches (`feat/yangilik-xabari`, `feat/telegram-tushum-tarkibi`,
  `feat/stets-platforma`, `feat/oylik-tolov-tizimi`, `feat/avtomatik-pauza`, …).
- The app assumes a single instance (no cron locks anywhere) — consistent with the rest of the codebase.

## Decisions pending (CEO)

1. Receipts / notices to non-ACTIVE (frozen, departed, graduated) but not deleted students — keep as today?
2. Auto-pause messages — stay instant (add to the spec/ADR list)?
3. Group digest on a transient send failure — retry at the next run instead of dropping the day?

---

## Resolution — plan revision 2 (2026-09-23/24)

The plan was rewritten (revision 2, Tasks 0–17) after the CEO answered the three pending decisions:
(1) students filtered on `deletedAt` only; (2) auto-pause messages stay instant (later refined in
another session: stages 1–2 at 20:30, pause at 07:30 — PR #511, docs updated here); (3) the group
digest retries transient failures at the next run, tracked per group (`deliveredGroupIds`).

**Second review** (independent, read-only): no BLOCKER or MAJOR; 44/48 findings resolved, the rest
partial/noted. Its follow-ups were then applied too: documents committed in Task 0; per-part row
deletion with one retry (no resend after a failed delete); permanent non-403 group errors stop the
run from waiting for that chat; receipt/reversal closing lines restored; audit text decoded so the
SMS tab shows `&` not `&amp;`; header chains kept together when splitting; teacher chat resolved at
20:00, not at enqueue; `RecipientKindByCategory` ties each category to its recipient kind;
`direct-send.guard.spec.ts` enforces ADR-0025's "no direct sends"; `telegram-branch-routing.spec.ts`
now tests the real `isVisibleToGroup`; stronger Task 17 checks (merge-base, promise-path diff, table
diff); `server/CLAUDE.md` updated; one-command boot check with `CRONS_ENABLED=false`.

**Dry run of revision 2** (throwaway worktree, no DB writes, no commits): every code block and edit
of the plan applied with exact matches (31 full files); `prisma generate` → 16 categories;
`npm run typecheck` → 0 errors (a canary error was caught, so the check is real); the plan's own
specs → 18 suites / 168 tests pass, matching the per-task counts; full suite → 411 suites / 5348
tests pass; eslint → 0 errors after the plan's prettier step; `npm run build` ok; boot check →
"Nest application successfully started" (removing `imports: [TelegramModule]` reproduces the
revision-1 blocker: "Nest can't resolve dependencies of the TelegramDigestPersonalCronService");
Task 17 Steps 3–6 pass as written (untouched files, promise path identical, crons at 20:00, guard);
the guard fails on a canary file with a direct `sendMessage` and passes once it is removed.

Not covered by the dry run: Task 1's `db execute`/`migrate resolve` against the dev DB and Task 17
Step 7 (they need the real migration).
