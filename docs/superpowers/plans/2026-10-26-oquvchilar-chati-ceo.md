# Student chat — CEO pages, settings, notice and list batching (Plan C3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The CEO can turn the student chat on and off, set the weekly minutes, be told when a student reports a chat, read the report with its text copy of the last 50 messages, close it (optionally banning the reported student), and lift bans — all in the admin panel. The student conversation list stops costing ~150 queries per call.

**Architecture:** Server: batch `ChatConversationsService.list()`; add `GET/PATCH /chat/admin/settings` and `GET /chat/admin/banned` to the existing `@CeoOnly()` `ChatAdminController` (reports, resolve, ban, unban already exist from Plan B); a bell notice to the CEO when a report is filed. Client: one CEO-only settings page `/settings/chat` (`ceoOnly: true` settings item, three tabs via `?tab=`: «Sozlamalar», «Shikoyatlar», «Chatdan chiqarilganlar») in `components/settings/chat/`, built from the existing settings parts (`SettingsPageHeader`, `SettingsCard`, `SettingsSaveBar`, `UnitNumberField`, `FormError`) like `participation-settings-client.tsx`.

**Tech Stack:** NestJS + Prisma + Jest (`server/`), Next.js + React Query + shadcn + vitest (`client/`, node env, no DOM: logic in pure `*.ts` files with tests; components are checked by `tsc`, `eslint src`, static render tests, `npm run build`).

## Global Constraints

- CEO is an IDENTITY, not a capability (ADR-0087): server `@CeoOnly()`, client settings item `ceoOnly: true`; every new route gets its route-manifest entries (`branch-route-policy.ts`, `route-access.snapshot.json`, added by hand like Plan A/B) and a `routeAccess()` spec.
- The chat switch must NOT gate the CEO's pages: `/chat/admin/*` keeps working while `chat.enabled` is off (the CEO reviews after a switch-off and must be able to turn it on).
- Settings writes go through `SettingsService.setMany(companyId, entries, userId)` (one transaction, parsed by the keys' own definitions: `chat.enabled` boolean, `chat.weekMinutesActive` and `chat.weekMinutesRadio` integers 0–1000, all `companyLevelOnly`). Do not invent new keys.
- Another student's phone, debt and balance never appear (reports show name, `@username`, ban state only — as `ChatReportsService.person` already does).
- All admin UI text is Uzbek Latin in `t("…")`; lists of texts use `msg()`; data (names, messages, reasons, notes) never goes through `t()`. New client files go into `STRICT_FILES` of `i18n-coverage.test.ts` with ru/de/en translations (German «Sie»; `npm run i18n:check` green). No English word on screen (not «username», «ban», «report»): «@nom», «chatdan chiqarish», «shikoyat».
- Admin client rules (client/CLAUDE.md): every table has the `#` column + page-size selector 10–50 (default 10, client-side over the loaded cursor pages); destructive confirms are `AlertDialog` with `variant="destructive"` actions; every mutation toasts success and error through `getErrorMessage`; loading = skeletons; a request without an answer never draws the empty state; tabs in the URL (`?tab=`, default tab omitted); no prettier on `client/`; server files are prettier-formatted.
- Server texts that reach the CEO are Uzbek; server code comments English (`server/CLAUDE.md` English; update its «Student chat» section for every contract change).
- Release order for deploy: backend first, then Vercel.

---

### Task 1: Batch the conversation list (server)

**Files:**
- Modify: `server/src/chat/conversations/chat-conversations.service.ts` (`list`), `server/src/chat/people/chat-people.service.ts` (a batched peer-summary method)
- Test: `server/src/chat/conversations/chat-conversations.service.spec.ts`, `chat-people.service.spec.ts`

**Interfaces:**
- Produces: `ChatPeopleService.peerSummaries(me: number, peerIds: number[]): Promise<Map<number, PeerSummary>>` (same privacy rules as `peerSummary`: photo hidden per `whoSeesPhoto`, never phone/debt/balance); `list(me)` returns the exact same `ConversationView[]` as today (order, `lastMessage.preview/at/mine`, `unread`, skipped hard-deleted peers).

- [ ] **Step 1:** Read `list()` (≈ l.229-294) and `peerSummary` in `chat-people.service.ts`. Write failing specs: for 50 conversations the Prisma mock is called a constant number of times (assert call counts ≤ 6: conversations, peers, last messages, read states, unread counts, plus privacy/group-mate lookups used by `peerSummaries`), and results equal the old per-row results for: unread with and without a read state, last message deleted (falls back to the previous non-deleted one), conversation with only deleted messages (`lastMessage: null`), hard-deleted peer skipped without failing the rest, photo hidden by `whoSeesPhoto`.
- [ ] **Step 2:** Run `cd server && npx jest src/chat/conversations src/chat/people` — FAIL.
- [ ] **Step 3:** Implement: one query for the conversations (unchanged), one `student.findMany` for peers + one for their `ChatPrivacy` rows + one group-mate check batch (reuse the existing rule functions in `chat-people.rules.ts`; do not copy rules), last messages via one `DISTINCT ON (conversationId)` raw query (or `groupBy` max + `findMany`; choose the one the existing code style allows, keep the `$queryRaw` typed and parameterised), read states via one `findMany`, unread via one grouped count (`$queryRaw` with the per-conversation `lastReadAt` join, or `groupBy` per case) — per-row `try/catch` stays only where a hard-deleted peer can still occur (skip rows with no peer in the map). Keep `take: 50`.
- [ ] **Step 4:** `npx jest src/chat` PASS; `npm run build` (typecheck); `npx prettier --write` the touched files.
- [ ] **Step 5:** Update `server/CLAUDE.md` («Student chat»: the list is batched, ≤ 6 queries) and commit `perf(chat): batch the conversation list`.

### Task 2: Settings and banned-list endpoints (server)

**Files:**
- Modify: `server/src/chat/chat-admin.controller.ts`, `server/src/chat/dto/chat.dto.ts`, `server/src/chat/reports/chat-ban.service.ts` (a `listBanned`), `server/src/chat/chat.module.ts` (inject `SettingsService` if not yet available), route manifests `server/src/common/permissions/branch-route-policy.ts` and `route-access.snapshot.json`
- Create: `server/src/chat/chat-admin-settings.service.ts` (+ spec)
- Test: `chat-admin.controller.spec.ts`, `chat-admin-settings.service.spec.ts`, `chat-ban.service.spec.ts`

**Interfaces:**
- Produces (all `@CeoOnly()`, under `chat/admin`, NOT behind `ChatEnabledGuard`):
  - `GET /chat/admin/settings` → `{ enabled: boolean; weekMinutesActive: number; weekMinutesRadio: number }`
  - `PATCH /chat/admin/settings` body `{ enabled?: boolean; weekMinutesActive?: number; weekMinutesRadio?: number }` (at least one field, else 400 «Kamida bitta sozlama yuborilishi kerak»; integers 0–1000) → the new full settings object. Writes via `SettingsService.setMany`.
  - `GET /chat/admin/banned` → `{ data: { id: number; name: string; username: string | null; chatBannedAt: string }[] }` (this company's students with `chatBannedAt` set, newest ban first, `deletedAt` null, max 200).
- Consumes: existing `POST /chat/admin/students/:studentId/unban`.

- [ ] **Step 1:** Failing specs: settings read returns the three values with defaults (false/60/30); patch writes only the given keys in one `setMany` call, rejects empty body, rejects 1001 and −1 and 1.5, returns merged values; `listBanned` is company-scoped and excludes banned-but-deleted students; controller routes carry `@CeoOnly()` via `routeAccess()`/`defaultRolesOf()` (see existing `chat-admin.controller.spec.ts`).
- [ ] **Step 2:** Run `npx jest src/chat` — FAIL.
- [ ] **Step 3:** Implement DTO (`UpdateChatSettingsDto`: `@IsOptional() @IsBoolean() enabled`, `@IsOptional() @IsInt() @Min(0) @Max(1000)` for both minutes, class-transformer not needed for JSON), service (maps dto → `[['chat.enabled', v], ['chat.weekMinutesActive', v], …]`), controller routes, manifest + snapshot entries by hand (copy the shape of the existing `chat/admin/*` rows; run `npx jest src/common/permissions` to see the manifest/snapshot specs).
- [ ] **Step 4:** `npx jest src/chat src/common src/settings`, `npm run build`, prettier on touched files.
- [ ] **Step 5:** `server/CLAUDE.md` «Student chat» (CEO routes list) and commit `feat(chat): CEO settings and banned-list endpoints`.

### Task 3: Tell the CEO when a student files a report (server + client mirror)

**Files:**
- Modify: `server/prisma/schema.prisma` (`NotificationType` += `CHAT_REPORT`), new migration `server/prisma/migrations/<ts>_chat_report_notification/migration.sql` (hand-written, idempotent: `ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CHAT_REPORT';`), `server/src/notifications/notification-kind.ts` (group `system`, `actionRequired` true so it counts in the CEO's «Kutilmoqda»; follow how other action-required types are declared), `server/src/chat/reports/chat-reports.service.ts` (`create` notifies after the commit, best-effort: a failing notice must never fail the report), `client/src/components/notifications/notification-view.ts` (`NOTIFICATION_TYPES` += `"CHAT_REPORT"`, the test reads schema.prisma), `notification-row.tsx` (icon), `notification-href.ts` (opens `/settings/chat?tab=shikoyatlar`), `client/src/i18n` if a text is client-side.
- Test: `chat-reports.service.spec.ts`, `notification-kind` spec, `notification-view.test.ts`, `notification-href.test.ts`

**Interfaces:**
- Produces: on a new report, every active CEO of the company (role «CEO», status ACTIVE, not deleted — find the helper other CEO-notifying code uses, e.g. grep `CeoOnly`/`roleIds: [1]`/`notifyCeo` in `server/src/notifications` and `server/src/tasks`) gets one bell row: title «Yangi chat shikoyati», body «{reporter} {reported} haqida shikoyat qildi» with names only (no message text), `relatedEntityType` reuse an existing value that the client `notification-href.ts` can map, or add one (read `notificationHref` first; the href must open `/settings/chat?tab=shikoyatlar&shikoyat=<reportId>`), `groupKey` `CHAT_REPORT` (one folded line for several), push + SSE as the existing service does. The row is resolved (closed, `resolvedAt`) when the report is resolved — use the existing resolve mechanism (`notification.resolved` SSE) as the task notices do; read how `NotificationsService` resolves by related entity.
- [ ] **Step 1:** Read `server/src/notifications/*` (service, kind file, how an action-required notice is created and resolved) and `server/CLAUDE.md` «Notifications (4 channels)». Write failing specs: report creation creates the CEO notice(s); a notification failure does not fail `create` (returns the report id); resolving the report resolves the notices; `NOTIFICATION_GROUP.CHAT_REPORT === 'system'`.
- [ ] **Step 2:** Run the specs — FAIL. **Step 3:** Implement + migration; apply to the dev DB the repo way (hand SQL + `prisma db execute` + `migrate resolve --applied`; `migrate dev` is broken, see CLAUDE.local.md «Prisma Migration Commands») and `npx prisma generate`. **Step 4:** client mirror (type list, icon, href) with tests. **Step 5:** `cd server && npx jest src/notifications src/chat && npm run build`; `cd client && npx vitest run src/components/notifications && npx tsc --noEmit`; commit `feat(chat): notify the CEO about a new chat report`.
- Note: the migration reaches prod through `railway up` (`prisma migrate deploy` on boot).

### Task 4: CEO page shell, settings tab (client)

**Files:**
- Modify: `client/src/lib/settings-nav.ts` (new `ceoOnly` item «Chat», url `/settings/chat`, icon `MessagesSquare` or another already imported lucide icon, description «Chatni yoqish, shikoyatlar va chatdan chiqarilganlar», keywords chat/shikoyat/yozishma/o'quvchilar/bloklash/ban in Uzbek, section «Telegram va arxiv» or the one the file's section comments suggest — keep «sections are topics»), `client/src/lib/settings-nav.test.ts` (per-role expected lists: only the CEO gains it), `client/src/lib/breadcrumb-routes.ts` (+ ru/de/en breadcrumb label)
- Create: `client/src/app/(dashboard)/settings/chat/page.tsx`, `components/settings/chat/chat-settings-page.tsx` (tabs via `?tab=`: default `sozlamalar`, `shikoyatlar`, `chiqarilganlar`), `chat-settings-tab.tsx`, `chat-settings-draft.ts` (+ `chat-settings-draft.test.ts`), `chat-admin-queries.ts`, `chat-admin-types.ts`

**Interfaces:**
- Produces: query hooks `useChatAdminSettings()`, `useSaveChatAdminSettings()` (`GET/PATCH /chat/admin/settings`); `ChatAdminSettings` type; draft helpers `toDraft`, `isDirty`, `draftError(draft, t)`, `draftPatch(saved, draft)` (only changed fields sent; minutes integers 0–1000), mirroring `participation-settings-draft.ts` (read it and copy the shape).
- Page rules: CEO only by identity — the page component renders nothing/redirects for a non-CEO through the same mechanism other `ceoOnly` settings pages use (read `SettingsLayoutShell` and `canOpenSettingsPath`: setting `ceoOnly` on the nav item is what closes the URL; do not add a per-route redirect).

- [ ] **Step 1 (TDD):** failing tests for the draft helpers (dirty/clean, invalid values 1001/−1/1.5/empty, patch contains only changed fields, `enabled` toggle only) and for `settings-nav` (CEO sees «Chat», Branch Director/Administrator/Cashier do not; `canOpenSettingsPath("/settings/chat", …)` false for them).
- [ ] **Step 2:** run them — FAIL. **Step 3:** implement nav item, breadcrumb, page shell with the three-tab `Tabs` (value from `?tab=`, `onValueChange` writes the URL, default omitted, lazy-load the other tabs' data on first activation per CLAUDE.md), settings tab: a `SettingsCard` with the switch «Chat yoqilgan» (shadcn `Switch`; turning ON asks an `AlertDialog` «Chat hamma o'quvchilar uchun ochiladi» with consequence text; turning OFF asks too: «Yozishmalar yopiladi, o'quvchilar chatni ko'rmaydi»; saved through the same PATCH), two `UnitNumberField`s «Oxirgi 7 kunda mashq» («daqiqa») and «Oxirgi 7 kunda radio» («daqiqa») with hints that mirror the spec («Shundan kam bo'lsa o'quvchi chatga yoza olmaydi, o'qiy oladi»), `SettingsSaveBar`. Skeleton while loading, retry block on failure, success toast.
- [ ] **Step 4:** `cd client && npx vitest run src/lib src/components/settings`, `npx tsc --noEmit`, `npx eslint src/components/settings/chat src/lib`. Commit `feat(chat): CEO settings page, switch and weekly minutes`.

### Task 5: Reports tab and report drawer (client)

**Files:**
- Create: `components/settings/chat/chat-reports-tab.tsx`, `chat-report-drawer.tsx`, `chat-report-rules.ts` (+ `chat-report-rules.test.ts`), extend `chat-admin-queries.ts` / `chat-admin-types.ts`

**Interfaces:**
- Consumes: `GET /chat/admin/reports?status&cursor&limit` → `{ data: ReportRow[]; nextCursor }` where a row is `{id,status:'OPEN'|'RESOLVED'|'DISMISSED',reason,createdAt,conversationId,reporter:Person,reported:Person}`, `Person = {id,name,username|null,chatBannedAt|null}`; `GET /chat/admin/reports/:id` → row + `{resolvedAt, resolutionNote, snapshot: SnapshotMessage[]}` with `SnapshotMessage = {id,senderId,kind:'TEXT'|'IMAGE'|'VOICE',text|null,hasFile,deleted,createdAt}`; `PATCH /chat/admin/reports/:id` body `{outcome:'RESOLVED'|'DISMISSED', note?, banReported?}` → the full report (read `chat-reports.service.ts` and the DTO to confirm).
- Pure helpers in `chat-report-rules.ts`: `statusLabel(status, t)` («Ochiq» / «Hal qilindi» / «Rad etildi»), `snapshotLines(report)` → ordered messages with `side` (reporter/reported/other by `senderId`), a text line per kind (TEXT → text; IMAGE/VOICE → t(«Rasm»)/t(«Ovozli xabar») with note «fayl ko'rsatilmaydi»; `deleted` → «o'chirilgan xabar» flag), `canResolve(report)` (OPEN only), `resolveBody(outcome, note, ban)` (trims note, omits empty note, `banReported` only true when asked and outcome RESOLVED).

- [ ] **Step 1 (TDD):** failing tests for the helpers (every status label, snapshot sides/kinds/deleted, `resolveBody`, `canResolve`).
- [ ] **Step 2:** FAIL → **Step 3:** implement. Tab: status filter chips (Ochiq default · Hal qilingan · Rad etilgan · Hammasi — filter by URL `?holat=`), table (`#`, Sana `dd.MM.yyyy, HH:mm`, Shikoyat qilgan, Shikoyat qilingan (name + `@nom`, red mark «Chatdan chiqarilgan» when `chatBannedAt`), Sabab (truncated, `ExpandableText` if one exists in `components/`), Holat badge), client-side pagination over the loaded pages with the 10–50 selector and «Yana ko'rsatish» when `nextCursor`, row opens the drawer through `?shikoyat=<id>` (so the bell link and a reload land on it). Drawer (Sheet, scroll-safe pattern: fixed header/footer, scrolling body): both people, reason, date, the text copy as a chat-like list (reported side vs reporter side, deleted flagged, files named but never shown), «Chatga qaytib yozishmalarni ko'rish yo'q» note is NOT needed; footer for OPEN: note `Textarea` (≤ 500), checkbox «Shikoyat qilingan o'quvchini chatdan chiqarish» (default off), buttons «Hal qilindi» and «Rad etish»; ban selected → `AlertDialog` confirm «{name} chatdan chiqariladi: u yozolmaydi, o'qiy oladi» before submit; a closed report shows outcome, note, date, and an «Chatdan chiqarish»/«Qaytarish» button per the reported person's ban state (`POST …/students/:id/ban|unban` through the Task 6 hooks if present, else add them here). After any mutation: invalidate the reports list, the report, the banned list, and `["notifications"]` (the bell notice closes). Errors via `getErrorMessage`.
- [ ] **Step 4:** `npx vitest run src/components/settings/chat`, `npx tsc --noEmit`, `npx eslint src/components/settings/chat`. Commit `feat(chat): CEO report list and review drawer`.

### Task 6: Banned list tab (client)

**Files:**
- Create: `components/settings/chat/chat-banned-tab.tsx`; extend queries with `useChatBanned()`, `useBanStudent()`, `useUnbanStudent()` (`POST /chat/admin/students/:id/ban|unban`), invalidating banned list + reports + report detail.

- [ ] Table (`#`, Ism, `@nom`, Chatdan chiqarilgan sana, row action ⋯ → «Qaytarish» with `AlertDialog` «{name} chatga qaytariladi»), page-size selector 10–50 over the returned list (≤ 200), empty state that tells what it means («Chatdan chiqarilgan o'quvchi yo'q — shikoyatni ko'rib chiqishda chiqarish mumkin»), skeleton, retry. Static-render test for loading/failed/empty/data (see `student-portal-load-states.test.ts` for the pattern in this repo). Commit `feat(chat): CEO banned-students list with unban`.

### Task 7: i18n, docs, guide and verification

**Files:** `client/src/i18n/dictionaries/{ru,de,en}.ts`, `client/src/i18n/i18n-coverage.test.ts` (`STRICT_FILES`: every new file under `components/settings/chat/` with texts, the touched `settings-nav.ts`/`breadcrumb-routes.ts` if they are strict), `client/CLAUDE.md` (a «Chat settings and reports (`/settings/chat`)» paragraph in English: tabs, URL keys `tab`/`holat`/`shikoyat`, CEO identity, bell link, the switch confirm rules), `server/CLAUDE.md` (already updated per task — verify), `docs/adr/` — none needed unless a decision changed (the CEO notice is covered by ADR-0129's spirit; if the notice contradicts ADR-0129 «content never shown», it does not: names only).

- [ ] Add every new text to ru/de/en (settings vocabulary: copy the glossary of nearby entries, e.g. grep «Sozlamalar», «Saqlash», «Chatdan»…); run `npm run i18n:check` until green.
- [ ] Verification, once each, sequentially: client `npx vitest run`, `npm run i18n:check`, `npx tsc --noEmit`, `npx eslint src` (errors 0), `npm run build`; server `npx jest src/chat src/common src/settings src/notifications`, `npm run build`.
- [ ] Browser check with the mock-API method (`reference_mock_api_browser_check`): staff session cookies as CEO (`user` cookie roles `[{id:1}]`), mock `/chat/admin/*` + `/settings/*`; screenshots of the three tabs at 1280 px and 390 px, the drawer with a 50-message copy, both confirm dialogs.
- [ ] Commit `docs(chat): CEO pages translations and docs`; final whole-branch review.

## Not in this plan

- Mobile app (Expo) screens (Plan C2).
- iPhone voice (`audio/mp4` needs a server type check), SSE for the portal, idempotency key for sends, keeping a failed voice upload.
- Before `chat.enabled` goes on in production: Railway `R2_CHAT_BUCKET_NAME` + private bucket; `STUDENT_PHONE_VERIFICATION_ENABLED` state; `StudentAppSession` written from web/Mini App/app; notice storm (cooldown/presence); staff seeing «yangi xabar» rows in SMS/history (CEO decision).
