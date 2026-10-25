# Student chat — web portal and Telegram Mini App (Plan C1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A student can chat 1–1 in the web portal `/portal/chat/*` and, through the same pages, inside the Telegram Mini App: list, thread with text, images and voice, new chat by name or `@username`, privacy and `@username` settings, block and report.

**Architecture:** Client only; the server (Plans A and B) is finished and stays behind `chat.enabled`. Pages live under `app/(student-portal)/portal/chat/`, components in `components/student-portal/chat/`, built from the Lumio primitives (`components/student-portal/lumio`) and styled after `daf-design-system/components/chat/*` (coral bubble right, white left, coral round send button). All data goes through React Query hooks in `chat/chat-queries.ts`; every decision (who may write, why locked, the warning) is the server's `GET /chat/access` — the client computes nothing. The portal has no SSE (the stream is staff-only), so the open thread polls.

**Tech Stack:** Next.js (read `client/node_modules/next/dist/docs/` before touching routing), React Query, Lumio, `@phosphor-icons/react`, vitest (node env, no DOM: logic goes in pure `*.ts` files with tests, components are checked by `npx tsc`, `npx eslint src`, `npm run build`).

## Global Constraints

- All UI text Uzbek Latin, wrapped in `t("…")` (`useT()` from `@/i18n/context`); lists of texts use `msg()`. No English word on screen (the word «username» is written `@username` only inside the field value). New files go into `STRICT_FILES` of `i18n-coverage.test.ts` and get ru/de/en translations (`npm run i18n:check` must pass). German is «Sie».
- Chat texts and names are DATA: never pass a message, a name or a username through `t()`.
- No prettier on `client/`. Student portal: never call staff-only endpoints or `PATCH /users/ui-locale`.
- The client never learns a phone, debt or balance of another student (the API does not send them); do not add any.
- Loading rule: decide with `loadState(query)` (`student-portal/lib/load-state.ts`) and render `LoadFailed`; a request without an answer never draws the empty state.
- Polling: open thread `refetchInterval` 5000 ms, list 20000 ms, both only while the tab is visible (`refetchIntervalInBackground: false`).
- Any audio element for a received voice message MUST call `registerMedia(el)` (`lib/media-registry.ts`) and unregister on unmount, so listening counts as active time.
- Files ≤ 300 lines; one responsibility per file. Pure logic has a vitest file beside it.
- Server contract (exact): `GET /chat/access` → `{enabled, canWrite, reasons[], messages[], warning, quota}`; `GET /chat/conversations` → `ConversationView[]` (`{id, peer:{id,firstName,lastName,username,photo}, lastMessage:{preview,at,mine}|null, unread}`); `POST /chat/conversations` body `{username}` or `{studentId}` → the conversation (use its `id`); `GET /chat/conversations/:id/messages?cursor&limit` → `MessageView[]` page (`{id,senderId,mine,kind,text,file:{mime,sizeBytes,durationSec,purged}|null,createdAt}`; read the real response shape in `chat-conversations.service.ts` `messages()` before typing it); `POST …/messages {text}`; `POST …/files` multipart (`file`, `durationSec`); `GET /chat/messages/:id/file` → signed link; `PATCH …/read`; `DELETE /chat/messages/:id`; `GET /chat/me`, `PATCH /chat/privacy`, `PUT /chat/username {username}`, `POST /chat/block|unblock {studentId}`, `GET /chat/search?q=` (≥2 chars), `POST /chat/report`.
- Open a found student with `{username}` when the result has one; a student found by name has no username to send, so use `{studentId}`. Open the thread with the id the open call returns; an empty conversation is not in the list.

---

### Task 1: Types, queries and pure helpers

**Files:**
- Create: `client/src/components/student-portal/chat/chat-types.ts`
- Create: `client/src/components/student-portal/chat/chat-queries.ts`
- Create: `client/src/components/student-portal/chat/chat-format.ts`
- Test: `client/src/components/student-portal/chat/chat-format.test.ts`

**Interfaces:**
- Produces: `ChatAccess`, `ConversationView`, `MessageView`, `PeerSummary`, `ChatPrivacy` types (copy field-for-field from the server services); hooks `useChatAccess()`, `useConversations()`, `useMessages(id)` (infinite, cursor), `useSendMessage(id)`, `useMarkRead(id)`, `useOpenConversation()`; `CHAT_KEYS`; `clockLabel(iso, now)` («14:05» today, «Kecha», `dd.MM`), `peerName(peer)`, `groupByDay(messages)`, `unreadTotal(list)`.

- [ ] **Step 1: Write failing tests** for `clockLabel` (same Tashkent day → `HH:mm`; previous day → `Kecha`; older → `dd.MM`), `groupByDay` (headers «Bugun» / «Kecha» / `dd.MM.yyyy`, order preserved) and `unreadTotal`. Use `@/lib/tashkent-time` primitives (never the browser zone); build dates as UTC instants near the 19:00Z day edge.
- [ ] **Step 2: Run** `cd client && npx vitest run src/components/student-portal/chat/chat-format.test.ts` — FAIL (module missing).
- [ ] **Step 3: Implement** `chat-format.ts` on top of `tashkentDayNumber`, `tashkentHhmm`, `tashkentDdMm`; types and hooks as listed. `useSendMessage` invalidates `CHAT_KEYS.messages(id)` and `CHAT_KEYS.list`; a 4xx shows the server's Uzbek message through `getErrorMessage`.
- [ ] **Step 4: Run** the test — PASS; `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** `feat(chat): client types, queries and formatting helpers`.

### Task 2: Nav entry, routes and the switched-off state

**Files:**
- Modify: `client/src/lib/student-nav-items.ts` (item «Chat», `/portal/chat`, slot `more`, an icon from `lumio/icon.tsx`, optional `feature: "chat"`)
- Modify: `student-portal/lumio/side-rail.tsx`, `student-more-hub.tsx` (hide items whose `feature` is off: one hook `useChatEnabled()` = `useChatAccess().data?.enabled === true`)
- Modify: `student-portal-nav.test.ts` (the reachability test counts only items whose feature is on; add a case that `chat` is absent when disabled)
- Create: `app/(student-portal)/portal/chat/page.tsx`, `chat/[id]/page.tsx`, `chat/new/page.tsx`, `chat/settings/page.tsx` (each only mounts a component)
- Create: `components/student-portal/chat/chat-gate.tsx`

**Interfaces:**
- Produces: `<ChatGate>` wraps every chat page: while loading → skeleton; `enabled === false` or request failed with 404/403 → `EmptyState` «Chat hali ochilmagan»; otherwise children. Rule from the server: only `GET /chat/access` answers while the switch is off.

- [ ] **Step 1:** Add the `feature` field and the filter; extend the nav test first, watch it fail, then pass.
- [ ] **Step 2:** Create the four route files and `ChatGate`; `isExerciseSessionRoute` is not touched. The thread page hides the bottom nav (like lessons) so the composer owns the bottom edge — add `/portal/chat/<id>` to the shell's "no bottom nav" rule and its test.
- [ ] **Step 3:** `npx vitest run src/components/student-portal` + `npx tsc --noEmit`.
- [ ] **Step 4: Commit** `feat(chat): portal routes, nav entry behind the company switch`.

### Task 3: Conversation list

**Files:** Create `chat/chat-list-page.tsx`, `chat/conversation-row.tsx`.

- [ ] Build from the design `ConversationRow` (avatar via Lumio `Avatar`, name `peerName`, preview, `clockLabel`, coral unread badge); NO online dot. Preview text is data (a message), `lastMessage.mine` prefixes «Siz: » (`t`). Header «Chat» with right slot: «Yangi chat» (→ `/portal/chat/new`) and a gear (→ `/portal/chat/settings`). Above the list show `<ChatAccessBanner>` (Task 4). Empty list: `EmptyState` «Hali yozishma yo'q» + button «Yangi chat». Polling 20 s. Decide with `loadState`.
- [ ] `tsc`, `eslint src/components/student-portal/chat`, commit `feat(chat): conversation list`.

### Task 4: Access banner and locked composer

**Files:** Create `chat/chat-access-banner.tsx`, `chat/chat-access-view.ts` (+ `chat-access-view.test.ts`).

- [ ] Pure `accessView(access)` → `{ mode: "open" | "warning" | "locked" | "banned", lines: string[], progress }` from the server's `reasons`, `messages`, `warning`, `quota`. Test every reason code present in `chat-access.rules.ts` (read it for the exact union), warning only while `canWrite`, banned wins over others. No text is composed here: lines are the server's `messages` / `warning`.
- [ ] Banner: `open` → nothing; `warning` → amber line + progress bar (Lumio `ProgressBar`); `locked`/`banned` → the reasons with progress («Mashq: 40/60 daqiqa»; labels via `t`, numbers from `quota`). Note colours blue/yellow/red only (`sky-*`/`amber-*` are transparent outside Lumio — this is inside `.lumio`, so Lumio tokens are fine; use Lumio tones).
- [ ] Commit `feat(chat): access banner with progress and tomorrow's warning`.

### Task 5: Thread screen with text

**Files:** Create `chat/chat-thread-page.tsx`, `chat/message-bubble.tsx`, `chat/chat-composer.tsx`.

- [ ] `useMessages(id)` newest-first pages reversed for display; scroll to bottom on first load and on own send; «Oldingilarini ko'rsatish» button at the top loads the next cursor page. On open and whenever a message from the peer arrives while visible: `PATCH …/read` once (guard with a ref on the last message id), then invalidate the list.
- [ ] `MessageBubble` per the design (`side="me"` coral, `"them"` white, time under it); day headers from `groupByDay`; deleted-by-sender messages never arrive. Own bubble long-press / ⋯ menu: «O'chirish» → `AlertDialog`-style Lumio sheet «Xabar o'chirilsinmi?» → `DELETE /chat/messages/:id`.
- [ ] `ChatComposer`: text field (max 2000, counter near the limit), send button disabled when empty or sending; Enter sends, Shift+Enter newline; optimistic append marked «yuborilmoqda», on failure the bubble turns red with «Qayta yuborish». When `access.canWrite` is false the composer is replaced by the banner's locked view (reading stays). Header: back chevron, peer avatar+name → menu (Task 7).
- [ ] Polling 5 s while visible. Commit `feat(chat): conversation thread with text`.

### Task 6: Images and voice

**Files:** Create `chat/chat-media.ts` (+ test), `chat/image-picker.tsx`, `chat/voice-recorder.tsx`, `chat/voice-player.tsx`, `chat/media-bubble.tsx`, `chat/use-signed-file.ts`.

- [ ] `chat-media.ts` pure: limits (image 5 MB jpg/png/webp, voice 120 s and 2 MB — import numbers from nowhere else than a constants block mirroring `server/src/chat/chat.constants.ts`; a test reads that server file and fails when they differ), `checkImage(file)`, `voiceMime()` choosing webm/ogg opus like `task-voice-recorder.tsx`. Test the checks.
- [ ] Upload with `FormData` (`durationSec` text part first, then `file`), progress state, server refusal shown as-is.
- [ ] `use-signed-file(messageId)`: `GET /chat/messages/:id/file` on demand, link valid 10 minutes — refetch when older than 8 minutes (`ensureFresh` pattern from `use-task-files.ts`). The browser only uses the link in `<img>` / `<audio>`; never `fetch` the storage URL (no CORS).
- [ ] `MediaBubble`: image thumbnail → full-screen viewer (Lumio `BottomSheet`/dialog); voice → `VoicePlayer` (play/pause, 1x/1.5x, stored length, `registerMedia`); `file.purged` → muted bubble «Fayl o'chirilgan».
- [ ] `VoiceRecorder`: hold-to-record or tap-start/tap-stop, stops itself at 2:00, shows elapsed time, cancel; hidden where `MediaRecorder` supports neither type. Inside the Telegram Mini App microphone permission may be refused: show «Mikrofonga ruxsat berilmadi» (no throw).
- [ ] Commit `feat(chat): images and voice messages`.

### Task 7: New chat, peer menu, block and report

**Files:** Create `chat/new-chat-page.tsx`, `chat/peer-menu.tsx`, `chat/report-dialog.tsx`, `chat/use-chat-search.ts`.

- [ ] New chat: one field, placeholder «Ism yoki @username»; input starting with `@` → show one row «@name ni ochish» that calls `open({username})`; otherwise debounced (300 ms, `use-debounced-value`) `GET /chat/search?q=` once ≥2 chars; rows show photo (Lumio `Avatar`), name, `@username` if any — never anything else. Tap → `open` → `router.replace(/portal/chat/<id>)`. A 404/400 from open shows the server text. «Topilmadi» empty state tells that a student may be hidden by their privacy setting.
- [ ] Peer menu (thread header): «Bloklash» / «Blokdan chiqarish» (confirm sheet), «Shikoyat qilish» → `ReportDialog` (reasons list + optional comment — read `CreateReportDto` for the exact fields; one open report per pair: show the server's refusal). After block the thread stays readable; composer shows «Siz bu o'quvchini blokladingiz».
- [ ] Commit `feat(chat): new chat search, block and report`.

### Task 8: Settings — username and privacy

**Files:** Create `chat/chat-settings-page.tsx`, `chat/username-field.tsx`, `chat/username-rules.ts` (+ test), `chat/privacy-form.tsx`.

- [ ] `username-rules.ts` mirrors `server/src/chat/username/chat-username.rules.ts` (5–32, lowercase latin/digits/`_`, starts with a letter); test pins equality by running the server's valid/invalid vectors (import the server spec vectors as literals copied into the test; a second test reads the server file and compares the regex source text).
- [ ] Field: live validation message in Uzbek, save → `PUT /chat/username`; server «band» message shown inline. Clear = empty is not allowed by the API, so no clear button.
- [ ] Privacy: three Lumio `SegmentedControl`s — «Kim menga yozishi mumkin» (Hamma / Guruhdoshlar / Hech kim), «Meni ism bo'yicha kim topadi» (Hamma / Hech kim; note that `@username` always finds), «Rasmimni kim ko'radi» (Hamma / Guruhdoshlar / Hech kim); each change `PATCH /chat/privacy` with only that field; toast on error, value restored.
- [ ] Commit `feat(chat): username and privacy settings`.

### Task 9: Telegram Mini App entry and unread badge

**Files:**
- Modify: `client/src/lib/telegram-mini-app.ts` — add `studentPortalPath(next)`: accepts exactly `/portal/chat/<uuid>` (and `/portal/chat`), anything else → `/portal`. Pure, exported, tested in `telegram-mini-app.test.ts` (uuid ok, uppercase uuid ok, `//evil.com`, `/portal/chat/../payments`, absolute URL, empty → `/portal`).
- Modify: `components/telegram-mini-app/mini-app-entry.tsx` — student branch: `enter(data, studentPortalPath(nextPage.current))` (today it is the literal `"/portal"`; `nextPage` is already read in `start()` for both audiences).
- Modify: `lumio/bottom-nav.tsx`, `side-rail.tsx` — unread dot on «Ko'proq» / «Chat» from `unreadTotal(useConversations().data)` (only when chat is enabled; no extra request when disabled).

- [ ] Test first (`studentPortalPath`), implement, wire, `tsc`.
- [ ] Manual check in the browser pane: `/tg?next=/portal/chat/<id>` outside Telegram shows the usual notice; the unit test covers the redirect target.
- [ ] Commit `feat(chat): Mini App opens the chat from the Telegram notice; unread badge`.

### Task 10: i18n, docs and verification

**Files:** `i18n/dictionaries/{ru,de,en}.ts`, `i18n-coverage.test.ts` (`STRICT_FILES`), `client/CLAUDE.md` (new «Student chat» section: routes, polling, Mini App `next` rule, file/voice rules), `src/qollanma/` is staff-only — no guide change, `docs/adr/` only if a decision changed (polling instead of SSE is a deliberate interim: note it in the CLAUDE.md section, not an ADR).

- [ ] Add every new text to ru/de/en; run `npm run i18n:check`.
- [ ] Run, once each after the last change: `npx tsc --noEmit`, `npx eslint src` (read the `✖ N problems (X errors…)` line), `npx vitest run`, `npm run build`.
- [ ] Browser check against the mock API pattern (`reference_mock_api_browser_check`): list, thread (text, image, voice bubble, purged bubble), locked banner, new chat, settings, phone width 375 and desktop.
- [ ] Commit `docs(chat): client section and translations`; final whole-branch review.

## Not in this plan (next plans)

- **C2 — student-app (Expo):** same screens natively, push deep link into a thread.
- **C3 — CEO pages:** «Chat shikoyatlari» (`/chat/admin/reports*`), ban/unban, `chat.weekMinutes*` and `chat.enabled` settings; notification group/icon already done.
- **Before turning `chat.enabled` on:** notice storm (cooldown/presence), staff visibility of notices in SMS/history tabs (CEO decision), `STUDENT_PHONE_VERIFICATION_ENABLED` in prod, `StudentAppSession` written from web/Mini App/app, batch `list()` queries, escape `%`/`_` in name search; prod: migration `20261026100000_chat_media_notify` and `R2_CHAT_BUCKET_NAME`.
