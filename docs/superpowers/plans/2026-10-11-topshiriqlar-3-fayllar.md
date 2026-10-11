# Topshiriqlar — 3-bosqich «Fayllar, rasm, ovoz» Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** People can attach photos, documents, short videos and voice messages to a task, on the website and as replies in Telegram. The files sit in a private bucket and open through 10-minute links. A task given «Rasm bilan tasdiqlansin» cannot go to review until a photo has been added since it was created or last returned: on the website the footer says «Rasm qo'shib, tekshiruvga yuborish», and in Telegram «Bajardim» asks «Rasmni shu xabarga javob qilib yuboring» and sends the task to review once the photo arrives.

**Architecture:** One new table `TaskFile`. Each file also gets a feed row: `TaskEvent.fileId`, with type `FILE`, `VOICE` or the new `FILE_DELETED`. Uploads go **through the server** (`POST /tasks/:id/files`, multipart, ≤ 20 MB), not through presigned PUTs. The server checks the content's magic bytes, writes the object with `PutObject` to `R2_TASKS_BUCKET_NAME` and commits the row and its event in one transaction; if the commit fails, the object is deleted. Telegram files take the same `TaskFilesService.upload` path after the bot's `getFile`. Reading is `GET /tasks/:id/files`, which re-checks access and returns presigned GET URLs (inline and attachment, 600 s) plus `hasFreshPhoto`. A delete is soft (`deletedAt`). The 03:00 run removes the object 30 days later and stamps `purgedAt`. A new file is announced through the existing `task.commented` event with `attachment: 'FILE' | 'VOICE'`, so the bell, push, SSE and Telegram need no new wiring. The photo rule is one count query (`hasFreshPhoto`) inside `changeStatusTx`.

**Tech Stack:** NestJS 11 + Prisma 7 (PostgreSQL), `@aws-sdk/client-s3` 3.1016 + `@aws-sdk/s3-request-presigner` (new, same version), `@nestjs/platform-express` (multer), `@nestjs/schedule`, `@nestjs/event-emitter`, telegraf, Jest. Client: Next.js 16, React 19 (React Compiler), zustand, `MediaRecorder`, vitest.

Spec: `docs/superpowers/specs/2026-10-07-topshiriqlar-design.md` §3.2 (`requiresPhoto` row), §3.4–3.5, §4 screens 1, 7, 8, 9, 15, 16, 18, §5.3, §6.1–6.2 («Yangi izoh / ovoz / fayl», photo/document/voice replies, `PHOTO_PROMPT`), §9.4, §9.6 (03:00), §13.

## Global Constraints

- Worktree: `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup` (branch `feat/topshiriqlar-3-fayllar`, from `origin/main` 54016d9e). Never `cd` to the main checkout or `/tmp`; use absolute paths inside the worktree. Plain bash commands, no shell variables.
- **Never touch a database** except the throwaway one in Task 14. The dev DB in `server/.env` is shared and behind; prod is off-limits. Never run `prisma migrate deploy|dev|resolve`, `db push` or `db execute`. The migration SQL is produced offline (schema-to-schema diff, Task 1). `npx prisma generate` is the only Prisma command that runs.
- Migration timestamp `20261011200000`, which is later than `20261011120000_task_recurrence`, the newest on `origin/main` (54016d9e). **Recheck at PR time.**
- **Secrets:** R2 keys come only from env (`ConfigService`). Nothing prints a key, a presigned URL (it carries the access key id and a signature) or a Telegram file link (it carries the bot token). Log the object key, never a URL. No real credential or production id goes into the repo; the repo is public.
- UI and bot text: Uzbek, Latin script only, no English words (format names JPG, PNG, PDF, DOCX, XLSX, MP4 and the unit «MB» are allowed). In JSX, text with an apostrophe goes in a JS string (`{"Fayl qo'shish"}` or a constant), never `&apos;`. Existing `&apos;` in touched files stays as it is.
- Server: run `npx prettier --write <touched .ts files>` before every commit. **Client: never run Prettier.** React Compiler rules: no prop or state mutation, no synchronous `setState` in an effect body. A zustand action called from an effect is fine.
- Dates: Tashkent time only through `server/src/common/date/tashkent.ts` and `client/src/lib/tashkent-time.ts` / `client/src/components/tasks/task-due.ts` (`tashkentDayAndTime`).
- Every write to `Task*` / `TaskFile` stays inside `src/tasks/` (`task-write.single-source.spec.ts`, extended in Task 1). `src/common/event-wiring.spec.ts` stays green: this plan adds **no new event name** (files reuse `task.commented`). Events are emitted after the commit.
- New files ≤ 500 lines, and no existing file grows further past 500. The exception is `tasks.service.ts` (531), which gets exactly one line in Task 6. New tests for files that are already ≥ 500 lines (`task-telegram.handler.spec.ts`, `task-telegram.handler.replies.spec.ts`, `task-telegram-text.spec.ts`, `task-notify-plan.spec.ts`, `tasks.service.spec.ts`, `tasks-read.service.spec.ts`, `task-recurrences.service.spec.ts` at 491) go into **new** spec files. Each new spec file repeats its own fixtures, because a shared helper would be built into `dist`.
- The browser never `fetch`es or `XHR`s an R2 URL. It only puts them in `<img src>`, `<audio src>` and `<a href>`, so the private bucket needs **no CORS rule** (decision 1).
- Commits: English message, with the trailer as a second `-m`: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Use `git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add <repo-relative paths>`, then `git -C … commit`.
- Server gate per task (from `server/`): `npx prettier --write <files>` → `npx eslint <files> --quiet` → `npx jest <specs>` → `npm run typecheck`. Never run `npm run build` and `npm test` at the same time.
- Client gate per task (from `client/`): `npx tsc --noEmit` → `npx eslint <files> --quiet` → `npx vitest run <tests>`. If the plain command fails with `configLoader`, use `npx vitest --config vitest.config.ts run <tests>`.
- ADR number: **0086** is the next free number on `origin/main` today (0085 = dialog ovozi). **Recheck `docs/adr/README.md` at PR time** and renumber with `git mv` if `main` has taken it.
- Deploy order: `R2_TASKS_BUCKET_NAME` → migration + server → Vercel (see «Deploy order» at the end).

---

## Design decisions (beyond the brief)

1. **Uploads go through the server; there is no presigned PUT and no CORS step.** The spec (§3.5, §9.4) has the browser PUT straight to R2. That needs a CORS policy on `daf-tasks`, which the account token cannot set. It would also need a presign → PUT → complete handshake, pending rows with a 1-hour cleanup, a `HeadObject` size check, and a ranged `GetObject` to sniff the content after the fact. Through the server: one `POST /tasks/:id/files`. The server sees the whole file before storing it, so the type check reads the real bytes (spec: «mime from content») and a refused file never reaches the bucket. There is one writer for the website and Telegram (Telegram already had to go through the server, §9.4). There are no pending rows, no handshake, and no one-time dashboard step that could be done wrong. The cost: each upload (≤ 20 MB) is buffered in server memory for the duration of one request, and the bytes cross Railway once. For a school with a few dozen staff this is negligible. Reading stays direct: `GET /tasks/:id/files` returns presigned GET URLs (600 s, access re-checked on every call). `<img>`, `<audio>` and links do not use CORS. Recorded in ADR-0086 as a change to §9.4.
2. **Routes** (all `@AnyStaff()` from the class; the task policy narrows further): `GET /tasks/config` → `{ filesEnabled }` (declared above `GET /tasks/:id`), `GET /tasks/:id/files` → `{ data: TaskFileView[], hasFreshPhoto }`, `POST /tasks/:id/files` (multipart `file`, `name?`, `durationSec?`) → `{ file, event }`, `DELETE /tasks/:id/files/:fileId` → `{ event }`. There are no `/presign`, `/complete` or `/url` routes.
3. **Type from content.** `sniffMime` reads magic bytes: JPEG, PNG, WebP, PDF, OOXML ZIP (`word/document.xml` → DOCX, `xl/workbook.xml` → XLSX), `OggS` → `audio/ogg`, EBML with the `webm` doctype → `audio/webm`, `ftyp` at byte 4 → `video/mp4`. Anything else gets a 400. The extension comes from the sniffed type. The display name keeps the person's base name with that extension (`safeFileName`). `kind`: image → `IMAGE`, audio → `VOICE` (any ogg/webm, recorded or attached), everything else (pdf, docx, xlsx, mp4) → `DOCUMENT`. Limits: 20 MB per file; audio ≤ 3 minutes (the declared `durationSec`, from the recorder or Telegram) **and** ≤ 2 MB, which is about 5 minutes of the recorder's 48 kbit/s. The size cap is the guard, because a client-declared duration cannot be trusted.
4. **Who:** upload, see and download — anyone who can view the task (`loadForAccess`, 404 otherwise), on open and closed tasks alike, like comments. Delete — the uploader, or whoever manages the task (`access.canManage`: the author, the CEO, a Branch Director of the task's branch); anyone else gets 403 «Faylni faqat qo'shgan odam yoki beruvchi o'chiradi». The delete is a conditional `updateMany` (`deletedAt: null` in the `where`), so two simultaneous deletes write one history row.
5. **Feed:** a file is a `TaskEvent` with type `FILE` (or `VOICE`), `fileId` and `text` = name. A delete writes `FILE_DELETED` (a new enum value) with the same `fileId` and name, and the feed shows the grey line «faylni o'chirdi: «name»». The event points at the file (`TaskEvent.fileId`, FK `ON DELETE SET NULL`). The spec's `TaskFile.eventId` back-pointer is not added, because one direction is enough.
6. **Notices = a comment's.** `task.commented` gets an optional `attachment: 'FILE' | 'VOICE'`. The bell title is «Yangi fayl» / «Ovozli xabar» (text = file name / «Ovozli xabar»). Telegram sends the usual comment notice (author + assignees, never watchers, never the uploader) with the headline «Yangi fayl» / «Ovozli xabar» and «Ochish». The bot does not forward the file itself.
7. **The photo rule:** `hasFreshPhoto(db, task)` = an `IMAGE` file, not deleted, with `createdAt > (lastReturnedAt ?? task.createdAt)`, uploaded by anyone. It is evaluated in `changeStatusTx` only when `requiresPhoto` is set (an extra count inside the serializable transaction). A self-task (author = only assignee) goes straight to DONE, as before, and needs no photo (spec table §3.2). `GET /tasks/:id/files` carries `hasFreshPhoto`, so the client knows whether to show the photo dialog without a second rule.
8. **`requiresPhoto` is set on create only** (`CreateTaskDto.requiresPhoto?`; «Batafsil» → «Rasm bilan tasdiqlansin»). The spec's `PATCH requiresPhoto` is left out: nothing in the brief needs it, and a toggle in the sheet is a separate decision. «Nusxa olish» copies it. A recurring create with `requiresPhoto` gets a 400 «Takrorlanuvchi topshiriqda rasm bilan tasdiqlash yo'q» (brief decision 6), and the dialog hides the box when «Takrorlash» is chosen or files are off.
9. **Telegram replies** (spec §6.2): a photo (largest size), document, video or voice replying to a `NOTICE` or `PHOTO_PROMPT` message is downloaded (`getFileLink` + the existing `downloadFile`; `file_size` > 20 MB and voice > 180 s are refused before downloading) and stored through `TaskFilesService.upload` with `via: 'TELEGRAM'`. A caption becomes a comment after the file. A reply to a `PHOTO_PROMPT` that stored an `IMAGE` then calls `changeStatus(IN_REVIEW)` and answers «Rasm qo'shildi. Topshiriq tekshiruvga yuborildi.». A text reply to a `PHOTO_PROMPT` repeats the prompt and stores nothing. A file replying to a `RETURN_PROMPT` gets «Qaytarish sababini matn bilan yozing.». Stickers, audio tracks, round videos, locations and the like get «Bu turdagi xabar qabul qilinmaydi: matn, rasm, hujjat, video yoki ovozli xabar yuboring.».
10. **«Bajardim» on a `requiresPhoto` task in Telegram:** the button is now shown. The press calls `changeStatus` as before. When the service refuses with `PHOTO_REQUIRED_MESSAGE`, the bot answers the press and sends a force-reply prompt naming the task (`Rasmni shu xabarga javob qilib yuboring.` + title), recorded as `PHOTO_PROMPT`. With a fresh photo already there, the press simply moves the task.
11. **The handler split:** `task-telegram.handler.ts` is at 500 lines. Task 7 moves the reply side (`onMessage`, `handleReply`, `ack`) into `TaskTelegramReplies` (`task-telegram-replies.ts`). The identity helpers (`me`, `lookup`) move into `task-telegram-actor.ts` as plain functions both classes call. There is no behaviour change, and the existing specs pass with only the constructor and `onMessage` target changed.
12. **`R2_TASKS_BUCKET_NAME` is optional.** Without it, `filesEnabled: false`, the client hides every file control, upload and delete answer 503 «Fayllar hozircha o'chiq», the list is empty and the purge does nothing. `env.validation.ts` rejects it when it is set but the R2 keys are not, and logs «Topshiriq fayllari» among the disabled integrations when it is absent. (The spec's «required from phase 3» would break every laptop and CI run.)
13. **Purge** (`TaskFilesService.purge`, `@Cron('0 0 3 * * *')` Tashkent): rows with `deletedAt` older than 30 days and `purgedAt: null`, 500 a night, oldest first. Each object is deleted with `DeleteObjectCommand` (the call `UploadService` already proves on R2). Only the rows whose delete succeeded are stamped `purgedAt`; a failure is logged with the key and retried the next night. The row itself stays, which keeps the history. `ponytail:` an object whose row never committed **and** whose compensating delete also failed is an orphan nobody sweeps. It is logged with its key; add a bucket-listing sweep if it ever shows up.
14. **Signed URLs** are minted for every file on every list call (local HMAC, no network). The drawer reloads the list every 8 minutes while it is open and after every upload or delete, so a link is never older than 10 minutes when clicked.
15. **Voice on the website:** `MediaRecorder` with `audio/webm;codecs=opus`, else `audio/ogg;codecs=opus`, at 48 kbit/s. Where neither is supported (old iOS Safari), the mic button is not shown. Recording stops itself at 3:00. The client sends `durationSec` and stores it, because Chrome's webm has no duration header and the player shows the stored length. The player is `<audio controls>` plus a «1x / 1,5x» toggle.
16. **mp4** is a `DOCUMENT`: its row opens the inline URL in a new tab, where the browser plays it. There is no in-page video player.
17. **Card:** `filesCount` (`_count.files` where `deletedAt: null`) with a paperclip next to the comment count (spec screen 1, «fayl soni»).
18. **ADR-0086** (short, Uzbek) records 1, 3, 5, 7, 8 (create-only), 9, 10 and 12.

## File Structure

**Server — new**
- `server/prisma/migrations/20261011200000_task_files/migration.sql`
- `server/src/tasks/task-file-rules.ts` (+ `.spec.ts`) — pure: limits, messages, `TASK_FILE_TYPES`, `sniffMime`, `checkTaskFile`, `safeFileName`, `taskFileKey`, `contentDisposition`, `freshPhotoSince`.
- `server/src/tasks/task-file-storage.ts` (+ `.spec.ts`) — `TaskFileStorage`: `enabled`, `put`, `remove`, `signedGet`.
- `server/src/tasks/task-files.service.ts` (+ `.spec.ts`) — `TaskFilesService`: `config`, `list`, `upload`, `remove`, `purge` (cron).
- `server/src/tasks/dto/upload-task-file.dto.ts`
- `server/src/tasks/task-notify-plan.files.spec.ts`
- `server/src/tasks/task-status-writes.photo.spec.ts`
- `server/src/tasks/task-create.photo.spec.ts`
- `server/src/tasks/telegram/task-telegram-actor.ts` — `resolveMe`, `lookupSeen`, types `Me`, `Seen`.
- `server/src/tasks/telegram/task-telegram-replies.ts` — `TaskTelegramReplies`.
- `server/src/tasks/telegram/task-telegram-media.ts` (+ `.spec.ts`) — pure `pickAttachment`.
- `server/src/tasks/telegram/task-telegram-replies.files.spec.ts`, `server/src/tasks/telegram/task-telegram.handler.photo.spec.ts`, `server/src/tasks/telegram/task-telegram-text.files.spec.ts`
- `docs/adr/0086-topshiriq-fayllari.md`

**Server — modified**
- `server/prisma/schema.prisma` (enums `TaskEventType`, new `TaskFileKind`, `TaskTelegramPurpose` comment; models `TaskFile`, `TaskEvent`, `Task`, `User`).
- `server/package.json`, `server/package-lock.json` — `@aws-sdk/s3-request-presigner`.
- `server/src/config/env.validation.ts` (+ spec).
- `server/src/tasks/task-write.single-source.spec.ts` — `File` in the scanned names.
- `server/src/tasks/task-select.ts` — event `fileId`, card `filesCount`.
- `server/src/tasks/task-status-writes.ts` — `hasFreshPhoto`, used in `changeStatusTx`.
- `server/src/tasks/task-events.ts`, `server/src/tasks/task-notify-plan.ts` — `attachment`.
- `server/src/tasks/task-create.ts`, `server/src/tasks/dto/create-task.dto.ts`, `server/src/tasks/tasks.service.ts` (one line), `server/src/tasks/task-recurrences.service.ts`.
- `server/src/tasks/tasks.controller.ts` (+ spec), `server/src/tasks/tasks.module.ts`, `server/src/tasks/tasks.module.di.spec.ts`.
- `server/src/common/auth/branch-route-policy.ts`, `server/src/common/permissions/route-access.snapshot.json`.
- `server/src/tasks/telegram/task-telegram.handler.ts`, `task-telegram-text.ts`, `task-telegram-text.spec.ts` (test #2 only), `task-telegram.handler.replies.spec.ts`, `task-telegram.handler.spec.ts`, `task-telegram.handler.steps.spec.ts` (constructor only).
- `server/CLAUDE.md`, `docs/adr/README.md`.

**Client — new**
- `client/src/components/tasks/task-file-rules.ts` (+ `.test.ts`) — sizes, durations, accept lists, `voiceReducer`, `pickVoiceMime`, `photoFirst`, `fileOfEvent`.
- `client/src/components/tasks/use-task-files.ts` — the files store.
- `client/src/components/tasks/task-drawer-files.tsx` — «Fayllar» section + image viewer.
- `client/src/components/tasks/task-voice-recorder.tsx`, `client/src/components/tasks/task-voice-player.tsx`
- `client/src/components/tasks/task-photo-dialog.tsx`

**Client — modified**
- `client/src/hooks/use-tasks.ts` (types), `task-drawer.tsx`, `task-drawer-feed.tsx`, `task-feed-text.ts` (+ test), `task-drawer-footer.tsx`, `task-create-dialog.tsx`, `task-card.tsx`, `client/CLAUDE.md`, `client/src/qollanma/kontent/boshlash/topshiriqlar.mdx`, `client/src/qollanma/sahifalar/boshlash.ts`, `client/src/qollanma/yangiliklar.ts`.

---

### Task 1: Table, event column, migration, one-door spec

**Files:**
- Modify: `server/prisma/schema.prisma` (`enum TaskEventType` ~line 180, `enum TaskTelegramPurpose` ~line 211, `model Task` ~line 2001, `model TaskEvent` ~line 2086, `model User` relation list next to `taskEvents` ~line 423)
- Create: `server/prisma/migrations/20261011200000_task_files/migration.sql`
- Modify: `server/src/tasks/task-write.single-source.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: the Prisma model `TaskFile` (delegate `prisma.taskFile`, fields below); the enum `TaskFileKind` (`IMAGE | DOCUMENT | VOICE`); `TaskEventType.FILE_DELETED`; `TaskEvent.fileId: string | null` with the relation `TaskEvent.file`; `Task.files`.

- [ ] **Step 1: Extend the one-door spec.** It stays green, because no `taskFile` write exists yet; from Task 4 on it guards them.

In `server/src/tasks/task-write.single-source.spec.ts`:

```ts
const WRITE =
  /\b(tx|prisma|db|this\.prisma)\.task(?:Participant|Step|Event|Outbox|TelegramMessage|Recurrence|File)?\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/g;
```

Rename the second test to `'no other module writes a Task, TaskParticipant, TaskStep, TaskEvent, TaskOutbox, TaskTelegramMessage, TaskRecurrence or TaskFile row'`. Add this sentence to the header comment, after the recurrence one: `A task file (TaskFile) is written only by task-files.service.ts.`

- [ ] **Step 2: Schema**

In `enum TaskEventType`, after `REASSIGNED`, add `FILE_DELETED`.

In `enum TaskTelegramPurpose`, replace the comment `/// Not used before phase 3 (photo upload).` above `PHOTO_PROMPT` with `/// «Rasmni shu xabarga javob qilib yuboring» (phase 3): a photo reply sends the task to review.`

Under `enum TaskRecurrenceFreq { … }` add:

```prisma
/// Spec 2026-10-07 §3.5 (ADR-0086): image → IMAGE, ogg/webm audio → VOICE, the rest → DOCUMENT.
enum TaskFileKind {
  IMAGE
  DOCUMENT
  VOICE
}
```

Add the model right after `model TaskRecurrence { … }`:

```prisma
/// A file on a task (spec 2026-10-07 §3.5, ADR-0086). The object lives in the
/// PRIVATE bucket R2_TASKS_BUCKET_NAME under `key`; it is read only through a
/// presigned GET minted after an access check. A delete is soft (`deletedAt`);
/// the 03:00 run removes the object 30 days later and stamps `purgedAt`, the row
/// stays for the history. Written only by tasks/task-files.service.ts.
model TaskFile {
  id           String       @id @default(uuid())
  taskId       String
  task         Task         @relation(fields: [taskId], references: [id], onDelete: Cascade)
  /// `tasks/<companyId>/<taskId>/<uuid><ext>`; the extension comes from the sniffed type.
  key          String       @unique
  /// The person's base name with the sniffed extension (`safeFileName`).
  name         String
  size         Int
  mime         String
  kind         TaskFileKind
  /// VOICE: seconds, from the recorder or Telegram; null when unknown.
  durationSec  Int?
  uploadedById Int?
  uploadedBy   User?        @relation("TaskFileUploader", fields: [uploadedById], references: [id], onDelete: SetNull)
  via          TaskEventVia @default(WEB)
  createdAt    DateTime     @default(now())
  deletedAt    DateTime?
  /// A bare id, like TaskOutbox.userId.
  deletedById  Int?
  purgedAt     DateTime?

  events TaskEvent[]

  @@index([taskId, createdAt])
  @@index([deletedAt, purgedAt])
}
```

In `model TaskEvent`, after `meta`:

```prisma
  /// FILE / VOICE / FILE_DELETED: the file the row is about (ADR-0086).
  fileId    String?
  file      TaskFile?     @relation(fields: [fileId], references: [id], onDelete: SetNull)
```

In `model Task`, add `files            TaskFile[]` to the relation list (after `telegramMessages`). In `model User`, next to `taskEvents`, add `taskFilesUploaded                TaskFile[]                 @relation("TaskFileUploader")`.

- [ ] **Step 3: Migration, offline**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server
git show HEAD:server/prisma/schema.prisma > prisma/.schema-before.prisma
mkdir -p prisma/migrations/20261011200000_task_files
npx prisma migrate diff --from-schema prisma/.schema-before.prisma --to-schema prisma/schema.prisma --script > prisma/migrations/20261011200000_task_files/migration.sql
rm prisma/.schema-before.prisma
cat prisma/migrations/20261011200000_task_files/migration.sql
```

If the first line is `Loaded Prisma config from prisma.config.ts.`, delete it. The file must contain exactly these statements (formatting may differ) and NOTHING else. In particular there must be no `DROP INDEX`, especially not `task_open_source_unique` or `TaskOutbox_time_row_key`; if one appears, delete that line. Anything else unexpected: stop and report.
1. `ALTER TYPE "TaskEventType" ADD VALUE 'FILE_DELETED';`
2. `CREATE TYPE "TaskFileKind" AS ENUM ('IMAGE', 'DOCUMENT', 'VOICE');`
3. `ALTER TABLE "TaskEvent" ADD COLUMN "fileId" TEXT;`
4. `CREATE TABLE "TaskFile" (…)` with every column above (`"via" "TaskEventVia" NOT NULL DEFAULT 'WEB'`, `"size" INTEGER NOT NULL`, …) and its primary key.
5. `CREATE UNIQUE INDEX "TaskFile_key_key"`, `CREATE INDEX "TaskFile_taskId_createdAt_idx"`, `CREATE INDEX "TaskFile_deletedAt_purgedAt_idx"`.
6. Three `ADD CONSTRAINT … FOREIGN KEY`: `TaskEvent.fileId` → `TaskFile` `ON DELETE SET NULL`, `TaskFile.taskId` → `Task` `ON DELETE CASCADE`, `TaskFile.uploadedById` → `User` `ON DELETE SET NULL`.

Add one comment line at the top: `-- ADR-0086: task files in the private bucket; a deleted file keeps its row (deletedAt, purgedAt).`

- [ ] **Step 4: Generate and check**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server
npx prisma generate
npx prettier --write src/tasks/task-write.single-source.spec.ts
npx jest src/tasks/task-write.single-source.spec.ts
npm run typecheck
```

Expected: 2 tests pass and typecheck is clean.

- [ ] **Step 5: Commit**

```bash
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add server/prisma/schema.prisma server/prisma/migrations/20261011200000_task_files/migration.sql server/src/tasks/task-write.single-source.spec.ts
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup commit -m "feat(tasks): TaskFile table and TaskEvent.fileId" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The file rules (pure)

**Files:**
- Create: `server/src/tasks/task-file-rules.ts`
- Test: `server/src/tasks/task-file-rules.spec.ts`

**Interfaces:**
- Consumes: `TaskFileKind` from `@prisma/client` (Task 1).
- Produces (all exported from `task-file-rules.ts`):
  - constants `MAX_TASK_FILE_BYTES = 20 * 1024 * 1024`, `MAX_VOICE_SECONDS = 180`, `MAX_VOICE_BYTES = 2 * 1024 * 1024`, `SIGNED_URL_SECONDS = 600`, `PURGE_AFTER_DAYS = 30`, `PURGE_BATCH = 500`
  - messages `FILE_TYPE_MESSAGE`, `FILE_SIZE_MESSAGE`, `VOICE_LIMIT_MESSAGE`, `EMPTY_FILE_MESSAGE`, `FILES_OFF_MESSAGE`, `DELETE_REFUSED_MESSAGE`, `FILE_NOT_FOUND_MESSAGE`
  - `TASK_FILE_TYPES: Readonly<Record<string, { ext: string; kind: TaskFileKind }>>`
  - `sniffMime(b: Buffer): string | null`
  - `checkTaskFile(input: { buffer: Buffer; durationSec?: number }): { mime: string; ext: string; kind: TaskFileKind }` (throws `BadRequestException`)
  - `safeFileName(raw: string | undefined, ext: string): string`
  - `taskFileKey(companyId: number, taskId: string, ext: string): string`
  - `contentDisposition(name: string, download: boolean): string`
  - `freshPhotoSince(task: { createdAt: Date; lastReturnedAt: Date | null }): Date`

- [ ] **Step 1: Write the failing test** — `server/src/tasks/task-file-rules.spec.ts`

```ts
import { BadRequestException } from '@nestjs/common';
import {
  EMPTY_FILE_MESSAGE,
  FILE_SIZE_MESSAGE,
  FILE_TYPE_MESSAGE,
  MAX_TASK_FILE_BYTES,
  MAX_VOICE_BYTES,
  VOICE_LIMIT_MESSAGE,
  checkTaskFile,
  contentDisposition,
  freshPhotoSince,
  safeFileName,
  sniffMime,
  taskFileKey,
} from './task-file-rules';

const hex = (h: string) => Buffer.from(h, 'hex');
const pad = (b: Buffer, n = 32) => Buffer.concat([b, Buffer.alloc(n)]);
const PNG = pad(hex('89504e470d0a1a0a'));
const JPG = pad(hex('ffd8ffe0'));
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(16)]);
const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n');
const OGG = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(24), Buffer.from('OpusHead'), Buffer.alloc(8)]);
const WEBM = Buffer.concat([hex('1a45dfa3'), Buffer.alloc(8), Buffer.from('webm'), Buffer.alloc(16)]);
const MKV = Buffer.concat([hex('1a45dfa3'), Buffer.alloc(8), Buffer.from('matroska'), Buffer.alloc(16)]);
const MP4 = Buffer.concat([hex('00000020'), Buffer.from('ftypisom'), Buffer.alloc(16)]);
const zip = (entry: string) => Buffer.concat([hex('504b0304'), Buffer.alloc(26), Buffer.from(entry), Buffer.alloc(16)]);
const HTML = Buffer.from('<html><script>alert(1)</script></html>');

describe('sniffMime', () => {
  it.each([
    [PNG, 'image/png'],
    [JPG, 'image/jpeg'],
    [WEBP, 'image/webp'],
    [PDF, 'application/pdf'],
    [OGG, 'audio/ogg'],
    [WEBM, 'audio/webm'],
    [MP4, 'video/mp4'],
    [zip('word/document.xml'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    [zip('xl/workbook.xml'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ])('reads the type from the bytes (%#)', (buf, mime) => {
    expect(sniffMime(buf)).toBe(mime);
  });
  it('knows nothing else: html, a plain zip, a non-webm matroska, an empty buffer', () => {
    for (const b of [HTML, zip('notes.txt'), MKV, Buffer.alloc(0)]) {
      expect(sniffMime(b)).toBeNull();
    }
  });
});

describe('checkTaskFile', () => {
  it('gives the type, extension and kind', () => {
    expect(checkTaskFile({ buffer: PNG })).toEqual({ mime: 'image/png', ext: '.png', kind: 'IMAGE' });
    expect(checkTaskFile({ buffer: OGG, durationSec: 42 })).toEqual({ mime: 'audio/ogg', ext: '.ogg', kind: 'VOICE' });
    expect(checkTaskFile({ buffer: WEBM })).toEqual({ mime: 'audio/webm', ext: '.webm', kind: 'VOICE' });
    expect(checkTaskFile({ buffer: MP4 })).toMatchObject({ ext: '.mp4', kind: 'DOCUMENT' });
    expect(checkTaskFile({ buffer: zip('xl/workbook.xml') })).toMatchObject({ ext: '.xlsx', kind: 'DOCUMENT' });
  });
  const refused = (input: { buffer: Buffer; durationSec?: number }, message: string) => {
    expect(() => checkTaskFile(input)).toThrow(BadRequestException);
    expect(() => checkTaskFile(input)).toThrow(message);
  };
  it('refuses an unknown type, an empty file, an oversized one', () => {
    refused({ buffer: HTML }, FILE_TYPE_MESSAGE);
    refused({ buffer: Buffer.alloc(0) }, EMPTY_FILE_MESSAGE);
    refused({ buffer: Buffer.concat([PNG, Buffer.alloc(MAX_TASK_FILE_BYTES)]) }, FILE_SIZE_MESSAGE);
  });
  it('refuses audio over 3 minutes or over 2 MB', () => {
    refused({ buffer: OGG, durationSec: 181 }, VOICE_LIMIT_MESSAGE);
    refused({ buffer: Buffer.concat([OGG, Buffer.alloc(MAX_VOICE_BYTES)]) }, VOICE_LIMIT_MESSAGE);
    expect(checkTaskFile({ buffer: OGG, durationSec: 180 }).kind).toBe('VOICE');
  });
});

describe('safeFileName', () => {
  it.each([
    ['Hisobot.PDF', '.pdf', 'Hisobot.pdf'],
    ['C:\\fakepath\\rasm.png', '.png', 'rasm.png'],
    ['../../etc/passwd', '.pdf', 'passwd.pdf'],
    ['photo.html', '.png', 'photo.png'],
    ['a\u0000b.txt.exe', '.pdf', 'ab.txt.pdf'],
    ['Ўқув режаси.docx', '.docx', 'Ўқув режаси.docx'],
    [undefined, '.jpg', 'fayl.jpg'],
    ['   ', '.jpg', 'fayl.jpg'],
    ['.png', '.png', 'fayl.png'],
  ])('%p → %p', (raw, ext, out) => {
    expect(safeFileName(raw, ext)).toBe(out);
  });
  it('clips a long name to 120 characters before the extension', () => {
    expect(safeFileName('x'.repeat(300) + '.pdf', '.pdf')).toBe('x'.repeat(120) + '.pdf');
  });
});

it('taskFileKey: company, task, a fresh uuid and the extension', () => {
  const key = taskFileKey(3, 'T1', '.png');
  expect(key).toMatch(/^tasks\/3\/T1\/[0-9a-f-]{36}\.png$/);
  expect(taskFileKey(3, 'T1', '.png')).not.toBe(key);
});

it('contentDisposition: an ASCII fallback and the UTF-8 name', () => {
  expect(contentDisposition('Hisobot oktabr.pdf', true)).toBe(
    `attachment; filename="Hisobot oktabr.pdf"; filename*=UTF-8''Hisobot%20oktabr.pdf`,
  );
  expect(contentDisposition(`Ўқув "1".pdf`, false)).toBe(
    `inline; filename="____ _1_.pdf"; filename*=UTF-8''${encodeURIComponent('Ўқув "1".pdf')}`,
  );
  expect(contentDisposition("o'quv.pdf", true)).toContain(`filename*=UTF-8''o%27quv.pdf`);
});

it('freshPhotoSince: the last return, else the creation', () => {
  const createdAt = new Date('2026-10-11T05:00:00Z');
  const lastReturnedAt = new Date('2026-10-12T05:00:00Z');
  expect(freshPhotoSince({ createdAt, lastReturnedAt: null })).toBe(createdAt);
  expect(freshPhotoSince({ createdAt, lastReturnedAt })).toBe(lastReturnedAt);
});
```

- [ ] **Step 2: Run it** — `cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server && npx jest src/tasks/task-file-rules.spec.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `server/src/tasks/task-file-rules.ts`

```ts
import { BadRequestException } from '@nestjs/common';
import type { TaskFileKind } from '@prisma/client';
import { randomUUID } from 'crypto';

/**
 * What a task file may be (spec 2026-10-07 §3.5, ADR-0086). Pure: the
 * service and the Telegram replies both check through `checkTaskFile`.
 * The type comes from the BYTES, never from the name or the declared type
 * (the rule of `upload/upload.constraints.ts`): a renamed `.html` is refused.
 */
export const MAX_TASK_FILE_BYTES = 20 * 1024 * 1024; // Telegram's getFile limit too
export const MAX_VOICE_SECONDS = 180;
/** ≈ 5 minutes of the website recorder's 48 kbit/s: the guard a client-declared duration cannot be. */
export const MAX_VOICE_BYTES = 2 * 1024 * 1024;
export const SIGNED_URL_SECONDS = 600;
export const PURGE_AFTER_DAYS = 30;
export const PURGE_BATCH = 500;

export const FILE_TYPE_MESSAGE =
  'Faqat JPG, PNG, WebP, PDF, DOCX, XLSX, MP4 fayllar va ovozli xabar qabul qilinadi';
export const FILE_SIZE_MESSAGE = 'Fayl hajmi 20 MB dan oshmasligi kerak';
export const VOICE_LIMIT_MESSAGE = 'Ovozli xabar 3 daqiqadan oshmasligi kerak';
export const EMPTY_FILE_MESSAGE = "Fayl bo'sh";
export const FILES_OFF_MESSAGE = "Fayllar hozircha o'chiq";
export const DELETE_REFUSED_MESSAGE =
  "Faylni faqat qo'shgan odam yoki beruvchi o'chiradi";
export const FILE_NOT_FOUND_MESSAGE = 'Fayl topilmadi';

const DOCX =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const TASK_FILE_TYPES: Readonly<
  Record<string, { ext: string; kind: TaskFileKind }>
> = {
  'image/jpeg': { ext: '.jpg', kind: 'IMAGE' },
  'image/png': { ext: '.png', kind: 'IMAGE' },
  'image/webp': { ext: '.webp', kind: 'IMAGE' },
  'application/pdf': { ext: '.pdf', kind: 'DOCUMENT' },
  [DOCX]: { ext: '.docx', kind: 'DOCUMENT' },
  [XLSX]: { ext: '.xlsx', kind: 'DOCUMENT' },
  'video/mp4': { ext: '.mp4', kind: 'DOCUMENT' },
  'audio/ogg': { ext: '.ogg', kind: 'VOICE' },
  'audio/webm': { ext: '.webm', kind: 'VOICE' },
};

/** Magic bytes → type; null for anything not allowed. */
export function sniffMime(b: Buffer): string | null {
  const hexAt = (off: number, hex: string) =>
    b.length >= off + hex.length / 2 &&
    b.subarray(off, off + hex.length / 2).toString('hex') === hex;
  const textAt = (off: number, s: string) =>
    b.length >= off + s.length &&
    b.subarray(off, off + s.length).toString('latin1') === s;
  if (hexAt(0, 'ffd8ff')) return 'image/jpeg';
  if (hexAt(0, '89504e470d0a1a0a')) return 'image/png';
  if (textAt(0, 'RIFF') && textAt(8, 'WEBP')) return 'image/webp';
  if (textAt(0, '%PDF-')) return 'application/pdf';
  if (textAt(0, 'OggS')) return 'audio/ogg';
  // EBML: webm says so in its doctype within the first bytes; other matroska is refused.
  if (hexAt(0, '1a45dfa3')) {
    return b.subarray(0, 64).includes('webm') ? 'audio/webm' : null;
  }
  if (textAt(4, 'ftyp')) return 'video/mp4';
  // OOXML is a zip; its part names are stored uncompressed in the headers.
  if (hexAt(0, '504b0304')) {
    if (b.includes('word/document.xml')) return DOCX;
    if (b.includes('xl/workbook.xml')) return XLSX;
  }
  return null;
}

export function checkTaskFile(input: {
  buffer: Buffer;
  durationSec?: number;
}): { mime: string; ext: string; kind: TaskFileKind } {
  const { buffer, durationSec } = input;
  if (buffer.length === 0) throw new BadRequestException(EMPTY_FILE_MESSAGE);
  if (buffer.length > MAX_TASK_FILE_BYTES) {
    throw new BadRequestException(FILE_SIZE_MESSAGE);
  }
  const mime = sniffMime(buffer);
  const type = mime ? TASK_FILE_TYPES[mime] : undefined;
  if (!mime || !type) throw new BadRequestException(FILE_TYPE_MESSAGE);
  if (
    type.kind === 'VOICE' &&
    (buffer.length > MAX_VOICE_BYTES || (durationSec ?? 0) > MAX_VOICE_SECONDS)
  ) {
    throw new BadRequestException(VOICE_LIMIT_MESSAGE);
  }
  return { mime, ext: type.ext, kind: type.kind };
}

const NAME_MAX = 120;

/** The base name the person gave, cleaned, with the extension of the real type. */
export function safeFileName(raw: string | undefined, ext: string): string {
  const base = (raw ?? '').split(/[\\/]/).pop() ?? '';
  const cleaned = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .replace(/\.[A-Za-z0-9]{1,5}$/, '')
    .trim();
  const clipped = Array.from(cleaned).slice(0, NAME_MAX).join('');
  return `${clipped || 'fayl'}${ext}`;
}

export function taskFileKey(
  companyId: number,
  taskId: string,
  ext: string,
): string {
  return `tasks/${companyId}/${taskId}/${randomUUID()}${ext}`;
}

/** RFC 6266 / 5987: an ASCII fallback plus the exact UTF-8 name. */
export function contentDisposition(name: string, download: boolean): string {
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, '_');
  const utf8 = encodeURIComponent(name).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${download ? 'attachment' : 'inline'}; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}

/** Spec §3.2: a photo counts from the last return, or from the creation. */
export function freshPhotoSince(task: {
  createdAt: Date;
  lastReturnedAt: Date | null;
}): Date {
  return task.lastReturnedAt ?? task.createdAt;
}
```

Note: `safeFileName('.png', '.png')` strips `.png`, leaves `''` and gives `fayl.png`, as the test expects. If ESLint flags the control-character regex differently, keep the inline disable comment on that line only.

- [ ] **Step 4: Run it** — same command. Expected: PASS.

- [ ] **Step 5: Gate and commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server
npx prettier --write src/tasks/task-file-rules.ts src/tasks/task-file-rules.spec.ts
npx eslint src/tasks/task-file-rules.ts src/tasks/task-file-rules.spec.ts --quiet
npx jest src/tasks/task-file-rules.spec.ts
npm run typecheck
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add server/src/tasks/task-file-rules.ts server/src/tasks/task-file-rules.spec.ts
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup commit -m "feat(tasks): file type, size and name rules read from content" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The private bucket — `TaskFileStorage`, presigner, env check

**Files:**
- Modify: `server/package.json`, `server/package-lock.json`
- Create: `server/src/tasks/task-file-storage.ts`
- Test: `server/src/tasks/task-file-storage.spec.ts`
- Modify: `server/src/config/env.validation.ts`, `server/src/config/env.validation.spec.ts`

**Interfaces:**
- Consumes: `SIGNED_URL_SECONDS`, `FILES_OFF_MESSAGE`, `contentDisposition` (Task 2).
- Produces: `@Injectable() class TaskFileStorage` (constructor `(config: ConfigService)`):
  - `readonly enabled: boolean`
  - `put(key: string, body: Buffer, mime: string): Promise<void>` (503 `FILES_OFF_MESSAGE` when off)
  - `remove(key: string): Promise<boolean>` (never throws; false = failed, logged with the key)
  - `signedGet(key: string, mime: string, name: string, download: boolean): Promise<string>`

- [ ] **Step 1: Add the presigner at the installed client's version**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server
grep '"version"' node_modules/@aws-sdk/client-s3/package.json
npm install @aws-sdk/s3-request-presigner@3.1016.0
grep -n 's3-request-presigner' package.json
```

Expected: `"@aws-sdk/s3-request-presigner": "^3.1016.0"` next to `client-s3`. If the installed `client-s3` version differs from 3.1016.0, install the presigner at that exact version instead. `npm ls @aws-sdk/client-s3` must show one version, with no duplicate `@smithy/*` tree for the presigner.

- [ ] **Step 2: Write the failing test** — `server/src/tasks/task-file-storage.spec.ts`

```ts
import { ServiceUnavailableException, Logger } from '@nestjs/common';
import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { TaskFileStorage } from './task-file-storage';
import { FILES_OFF_MESSAGE } from './task-file-rules';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://signed.example/x'),
}));

const ENV = {
  R2_TASKS_BUCKET_NAME: 'daf-tasks',
  R2_ENDPOINT: 'https://acc.r2.cloudflarestorage.com',
  R2_ACCESS_KEY_ID: 'id',
  R2_SECRET_ACCESS_KEY: 'secret',
};
const config = (over: Record<string, string | undefined> = {}) =>
  ({ get: (k: string) => ({ ...ENV, ...over })[k as keyof typeof ENV] }) as never;
const make = (over: Record<string, string | undefined> = {}) => {
  const storage = new TaskFileStorage(config(over));
  const send = jest.fn().mockResolvedValue({});
  (storage as unknown as { s3: { send: jest.Mock } }).s3 = { send };
  return { storage, send };
};

afterEach(() => jest.clearAllMocks());

it('is on with the bucket and the R2 keys, off without the bucket', () => {
  expect(make().storage.enabled).toBe(true);
  expect(make({ R2_TASKS_BUCKET_NAME: undefined }).storage.enabled).toBe(false);
  expect(make({ R2_TASKS_BUCKET_NAME: '  ' }).storage.enabled).toBe(false);
  expect(make({ R2_ENDPOINT: undefined }).storage.enabled).toBe(false);
});

it('put: one PutObject into the tasks bucket with the type', async () => {
  const { storage, send } = make();
  await storage.put('tasks/1/T/a.png', Buffer.from('x'), 'image/png');
  const cmd = send.mock.calls[0][0];
  expect(cmd).toBeInstanceOf(PutObjectCommand);
  expect(cmd.input).toEqual({ Bucket: 'daf-tasks', Key: 'tasks/1/T/a.png', Body: Buffer.from('x'), ContentType: 'image/png' });
});

it('off: put and signedGet answer 503, nothing is sent', async () => {
  const { storage, send } = make({ R2_TASKS_BUCKET_NAME: undefined });
  await expect(storage.put('k', Buffer.from('x'), 'image/png')).rejects.toThrow(ServiceUnavailableException);
  await expect(storage.signedGet('k', 'image/png', 'a.png', false)).rejects.toThrow(FILES_OFF_MESSAGE);
  expect(send).not.toHaveBeenCalled();
});

it('signedGet: 10 minutes, the type and the disposition ride on the URL', async () => {
  const { storage } = make();
  await expect(storage.signedGet('tasks/1/T/a.pdf', 'application/pdf', 'Hisobot.pdf', true)).resolves.toBe('https://signed.example/x');
  const [, cmd, opts] = (getSignedUrl as jest.Mock).mock.calls[0];
  expect(cmd).toBeInstanceOf(GetObjectCommand);
  expect(cmd.input).toEqual({
    Bucket: 'daf-tasks',
    Key: 'tasks/1/T/a.pdf',
    ResponseContentType: 'application/pdf',
    ResponseContentDisposition: `attachment; filename="Hisobot.pdf"; filename*=UTF-8''Hisobot.pdf`,
  });
  expect(opts).toEqual({ expiresIn: 600 });
});

it('remove: true when deleted; false and a warning with the key (never a URL) when not', async () => {
  const { storage, send } = make();
  await expect(storage.remove('tasks/1/T/a.png')).resolves.toBe(true);
  expect(send.mock.calls[0][0]).toBeInstanceOf(DeleteObjectCommand);
  const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  send.mockRejectedValueOnce(new Error('network'));
  await expect(storage.remove('tasks/1/T/b.png')).resolves.toBe(false);
  expect(warn.mock.calls[0][0]).toContain('tasks/1/T/b.png');
  warn.mockRestore();
});
```

- [ ] **Step 3: Run it** — `npx jest src/tasks/task-file-storage.spec.ts`. Expected: FAIL (module not found).

- [ ] **Step 4: Implement** — `server/src/tasks/task-file-storage.ts`

```ts
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { describeError } from '../telegram-digest/telegram-send';
import {
  FILES_OFF_MESSAGE,
  SIGNED_URL_SECONDS,
  contentDisposition,
} from './task-file-rules';

/**
 * The PRIVATE bucket of task files (ADR-0086): `R2_TASKS_BUCKET_NAME` with the
 * same R2 endpoint and keys as the public photo bucket. Nothing is public: a
 * file is read only through `signedGet`, which the service calls after an
 * access check. Without the bucket name the feature is off (`enabled`).
 * Never log a URL here — a presigned one carries the access key id.
 */
@Injectable()
export class TaskFileStorage {
  private readonly logger = new Logger(TaskFileStorage.name);
  readonly enabled: boolean;
  private readonly bucket: string;
  private readonly s3: S3Client;

  constructor(config: ConfigService) {
    const get = (k: string) => config.get<string>(k)?.trim() || '';
    this.bucket = get('R2_TASKS_BUCKET_NAME');
    const endpoint = get('R2_ENDPOINT');
    const accessKeyId = get('R2_ACCESS_KEY_ID');
    const secretAccessKey = get('R2_SECRET_ACCESS_KEY');
    this.enabled = Boolean(
      this.bucket && endpoint && accessKeyId && secretAccessKey,
    );
    this.s3 = new S3Client({
      region: 'auto',
      endpoint: endpoint || undefined,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  private assertOn(): void {
    if (!this.enabled) throw new ServiceUnavailableException(FILES_OFF_MESSAGE);
  }

  async put(key: string, body: Buffer, mime: string): Promise<void> {
    this.assertOn();
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: mime,
      }),
    );
  }

  /** DeleteObject (missing key = success on R2). Never throws: the caller decides. */
  async remove(key: string): Promise<boolean> {
    if (!this.enabled) return false;
    try {
      await this.s3.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch (err) {
      this.logger.warn(`task file ${key} not deleted: ${describeError(err)}`);
      return false;
    }
  }

  /** A 10-minute GET; `download` asks the browser to save instead of show. */
  async signedGet(
    key: string,
    mime: string,
    name: string,
    download: boolean,
  ): Promise<string> {
    this.assertOn();
    return getSignedUrl(
      this.s3,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentType: mime,
        ResponseContentDisposition: contentDisposition(name, download),
      }),
      { expiresIn: SIGNED_URL_SECONDS },
    );
  }
}
```

(`describeError` is the repo's error formatter; it prints the message, not request URLs. If you would rather not import from `telegram-digest`, use `err instanceof Error ? err.message : String(err)`.)

- [ ] **Step 5: The env check** — in `server/src/config/env.validation.ts`, inside `validateEnv`, right after the `TELEGRAM_MINI_APP_URL` block, add:

```ts
  // Task files (ADR-0086): the private bucket rides on the R2 group's keys.
  // Absent = the feature is off (logged); set without R2 = a mistake.
  if (isSet(config, 'R2_TASKS_BUCKET_NAME')) {
    if (!isSet(config, 'R2_ENDPOINT')) {
      errors.push(
        "R2_TASKS_BUCKET_NAME — R2_* kalitlarisiz ishlamaydi (Fayl yuklash guruhi o'rnatilmagan)",
      );
    }
  } else {
    disabled.push('Topshiriq fayllari (R2_TASKS_BUCKET_NAME)');
  }
```

In `server/src/config/env.validation.spec.ts`, add two tests. Read the file first and reuse its existing «valid config» fixture (the minimal `DATABASE_URL` + `JWT_SECRET` object and the full R2 group it already uses for the R2 tests):
- `R2_TASKS_BUCKET_NAME: 'daf-tasks'` without any `R2_*` key → `toThrow(/R2_TASKS_BUCKET_NAME/)`.
- the full R2 group plus `R2_TASKS_BUCKET_NAME: 'daf-tasks'` → does not throw.

- [ ] **Step 6: Run** — `npx jest src/tasks/task-file-storage.spec.ts src/config/env.validation.spec.ts`. Expected: PASS.

- [ ] **Step 7: Gate and commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server
npx prettier --write src/tasks/task-file-storage.ts src/tasks/task-file-storage.spec.ts src/config/env.validation.ts src/config/env.validation.spec.ts
npx eslint src/tasks/task-file-storage.ts src/tasks/task-file-storage.spec.ts src/config/env.validation.ts src/config/env.validation.spec.ts --quiet
npm run typecheck
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add server/package.json server/package-lock.json server/src/tasks/task-file-storage.ts server/src/tasks/task-file-storage.spec.ts server/src/config/env.validation.ts server/src/config/env.validation.spec.ts
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup commit -m "feat(tasks): private R2 bucket for task files with presigned reads" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `TaskFilesService` — list, upload, delete, purge; the notice; the read shapes

**Files:**
- Create: `server/src/tasks/task-files.service.ts`
- Test: `server/src/tasks/task-files.service.spec.ts`
- Modify: `server/src/tasks/task-status-writes.ts` (export `hasFreshPhoto`; Task 6 uses it inside `changeStatusTx`)
- Modify: `server/src/tasks/task-select.ts` (event `fileId`, card `filesCount`)
- Modify: `server/src/tasks/task-events.ts`, `server/src/tasks/task-notify-plan.ts`
- Create: `server/src/tasks/task-notify-plan.files.spec.ts`

**Interfaces:**
- Consumes: `TaskFileStorage` (Task 3); everything in `task-file-rules.ts` (Task 2); `TasksService.loadForAccess(db, id, actor): Promise<TaskCtx>`, `TasksService.eventTask(row)`; `TASK_EVENT_SELECT`, `TaskEventRow` (`task-select.ts`); `TASK_EVENTS.COMMENTED`.
- Produces:
  - `export async function hasFreshPhoto(db: Prisma.TransactionClient | PrismaService, task: { id: string; createdAt: Date; lastReturnedAt: Date | null }): Promise<boolean>` in `task-status-writes.ts`
  - `TaskCommentedPayload.attachment?: 'FILE' | 'VOICE'`; `TgNotice` `COMMENT` gains `attachment?: 'FILE' | 'VOICE'`
  - `TASK_EVENT_SELECT.fileId`; card field `filesCount: number`
  - `@Injectable() class TaskFilesService` (constructor `(prisma: PrismaService, emitter: EventEmitter2, tasks: TasksService, storage: TaskFileStorage)`):
    - `config(): { filesEnabled: boolean }`
    - `list(taskId: string, actor: TaskActor): Promise<{ data: TaskFileView[]; hasFreshPhoto: boolean }>`
    - `upload(taskId: string, input: { buffer: Buffer; name?: string; durationSec?: number }, actor: TaskActor): Promise<{ file: TaskFileView; event: TaskEventRow }>`
    - `remove(taskId: string, fileId: string, actor: TaskActor): Promise<{ event: TaskEventRow }>`
    - `purge(now?: Date): Promise<number>` — `@Cron('0 0 3 * * *', { timeZone: 'Asia/Tashkent' })`
  - `export type TaskFileView = { id: string; name: string; size: number; mime: string; kind: TaskFileKind; durationSec: number | null; via: TaskEventVia; createdAt: Date; uploadedBy: { id: number; firstName: string; lastName: string; photo: string | null } | null; canDelete: boolean; url: string; downloadUrl: string }`

- [ ] **Step 1: Read shapes.** In `server/src/tasks/task-select.ts`:
  - `TASK_EVENT_SELECT`: add `fileId: true,` after `meta: true,`.
  - `TASK_CARD_SELECT._count`: `_count: { select: { steps: true, events: true, files: { where: { deletedAt: null } } } },`
  - `toTaskCard`: after `eventsCount: r._count.events,` add `filesCount: r._count.files,`.

  Run `npx jest src/tasks/tasks-read.service.spec.ts src/tasks/tasks.service.spec.ts`. If a fixture with a typed `_count` no longer compiles, add `files: 0` to that fixture's `_count`. Change nothing else in those files.

- [ ] **Step 2: The notice payload.** In `server/src/tasks/task-events.ts`, extend:

```ts
export interface TaskCommentedPayload {
  task: TaskEventTask;
  actorId: number;
  text: string;
  /** A file or a voice message (ADR-0086): the same notice, its own headline. */
  attachment?: 'FILE' | 'VOICE';
}
```

In `server/src/tasks/task-notify-plan.ts`, change the `TgNotice` member to `| { kind: 'COMMENT'; by: string; text: string; attachment?: 'FILE' | 'VOICE' }` and replace the `TASK_EVENTS.COMMENTED` case with:

```ts
    case TASK_EVENTS.COMMENTED: {
      const p = payload as TaskCommentedPayload;
      const by = who(names, p.actorId);
      const watching = new Set(watchers(p.task));
      const title =
        p.attachment === 'VOICE'
          ? 'Ovozli xabar'
          : p.attachment === 'FILE'
            ? 'Yangi fayl'
            : 'Yangi izoh';
      return mk(
        everyone(p.task).filter((u) => u !== p.actorId),
        'TASK_UPDATED',
        title,
        `${by}: «${clip(p.text, 80)}» — ${clip(p.task.title, 50)}`,
        false,
        (u) =>
          watching.has(u)
            ? null
            : {
                kind: 'COMMENT',
                by,
                text: clip(p.text, 300),
                ...(p.attachment && { attachment: p.attachment }),
              },
      );
    }
```

- [ ] **Step 3: The notice test** — `server/src/tasks/task-notify-plan.files.spec.ts`

```ts
import { TASK_EVENTS } from './task-events';
import { planNotices } from './task-notify-plan';

// Files reuse the comment notice (ADR-0086); the plain comment cases are in task-notify-plan.spec.ts.
const task = {
  id: 'T1', companyId: 1, title: 'Oktabr banneri', kind: 'MANUAL', authorId: 30, dueAt: null, status: 'IN_PROGRESS' as const,
  participants: [
    { userId: 40, role: 'ASSIGNEE' as const },
    { userId: 50, role: 'WATCHER' as const },
  ],
};
const names = new Map([[30, 'Soliyev A.'], [40, 'Rahimov A.'], [50, 'Karimov B.']]);

it('a file: «Yangi fayl» in the bell for everyone but the uploader; Telegram for author and assignees only', () => {
  const n = planNotices(TASK_EVENTS.COMMENTED, { task, actorId: 40, text: 'chek.jpg', attachment: 'FILE' }, names);
  expect(n.map((x) => x.userId).sort()).toEqual([30, 50]);
  expect(n.every((x) => x.title === 'Yangi fayl')).toBe(true);
  expect(n.find((x) => x.userId === 30)!.message).toBe('Rahimov A.: «chek.jpg» — Oktabr banneri');
  expect(n.find((x) => x.userId === 30)!.telegram).toEqual({ kind: 'COMMENT', by: 'Rahimov A.', text: 'chek.jpg', attachment: 'FILE' });
  expect(n.find((x) => x.userId === 50)!.telegram).toBeNull();
});

it('a voice message: «Ovozli xabar»', () => {
  const n = planNotices(TASK_EVENTS.COMMENTED, { task, actorId: 30, text: 'Ovozli xabar', attachment: 'VOICE' }, names);
  expect(n.map((x) => [x.userId, x.title])).toEqual([[40, 'Ovozli xabar'], [50, 'Ovozli xabar']]);
  expect(n.find((x) => x.userId === 40)!.telegram).toEqual({ kind: 'COMMENT', by: 'Soliyev A.', text: 'Ovozli xabar', attachment: 'VOICE' });
});

it('a plain comment is unchanged: no attachment key at all', () => {
  const n = planNotices(TASK_EVENTS.COMMENTED, { task, actorId: 40, text: 'Tayyor' }, names);
  expect(n.find((x) => x.userId === 30)!.telegram).toEqual({ kind: 'COMMENT', by: 'Rahimov A.', text: 'Tayyor' });
  expect(n[0].title).toBe('Yangi izoh');
});
```

- [ ] **Step 4: `hasFreshPhoto`** — append to `server/src/tasks/task-status-writes.ts` (add `import type { PrismaService } from '../prisma/prisma.service';` and `import { freshPhotoSince } from './task-file-rules';`):

```ts
/**
 * Spec §3.2: a `requiresPhoto` task goes to review only with an image added
 * after its last return (or its creation), by anyone, still not deleted.
 */
export async function hasFreshPhoto(
  db: Tx | PrismaService,
  task: { id: string; createdAt: Date; lastReturnedAt: Date | null },
): Promise<boolean> {
  const n = await db.taskFile.count({
    where: {
      taskId: task.id,
      kind: 'IMAGE',
      deletedAt: null,
      createdAt: { gt: freshPhotoSince(task) },
    },
  });
  return n > 0;
}
```

(`TaskRow` has `createdAt` and `lastReturnedAt`: `TASK_DETAIL_SELECT` selects both.)

- [ ] **Step 5: Write the failing service test** — `server/src/tasks/task-files.service.spec.ts`

```ts
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { TaskFilesService } from './task-files.service';
import { TASK_EVENTS } from './task-events';
import { DELETE_REFUSED_MESSAGE, FILE_TYPE_MESSAGE } from './task-file-rules';

const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(32)]);
const OGG = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(32)]);
const NOW = new Date('2026-11-20T00:00:00Z');
const actor = (userId: number, via?: 'WEB' | 'TELEGRAM') =>
  ({ userId, companyId: 1, roleIds: [4], roleNames: [], scope: { kind: 'branches', branchIds: [1] }, headerBranchId: null, ...(via && { via }) }) as never;
const row = (over: Record<string, unknown> = {}) => ({
  id: 'T1', companyId: 1, requiresPhoto: false, createdAt: new Date('2026-10-11T05:00:00Z'), lastReturnedAt: null, ...over,
});
const person = { id: 40, firstName: 'Ali', lastName: 'Rahimov', photo: null };
const fileRow = (over: Record<string, unknown> = {}) => ({
  id: 'F1', key: 'tasks/1/T1/u.png', name: 'chek.png', size: 40, mime: 'image/png', kind: 'IMAGE', durationSec: null,
  via: 'WEB', createdAt: NOW, uploadedById: 40, uploadedBy: person, ...over,
});

let prisma: any;
let tasks: any;
let storage: any;
let emitter: any;
let svc: TaskFilesService;
const access = (over: Record<string, boolean> = {}) => ({ canManage: false, ...over });

beforeEach(() => {
  prisma = {
    taskFile: {
      create: jest.fn().mockResolvedValue(fileRow()),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(0),
    },
    taskEvent: { create: jest.fn().mockResolvedValue({ id: 'E1', type: 'FILE', fileId: 'F1' }) },
  };
  prisma.$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(prisma));
  tasks = {
    loadForAccess: jest.fn().mockResolvedValue({ row: row(), access: access() }),
    eventTask: jest.fn((r: { id: string }) => ({ id: r.id })),
  };
  storage = {
    enabled: true,
    put: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(true),
    signedGet: jest.fn(async (_k: string, _m: string, _n: string, download: boolean) => (download ? 'https://dl' : 'https://view')),
  };
  emitter = { emit: jest.fn() };
  svc = new TaskFilesService(prisma, emitter, tasks, storage);
});

describe('upload', () => {
  it('stores the object, then the row and its FILE event; tells the others after the commit', async () => {
    const out = await svc.upload('T1', { buffer: PNG, name: 'C:\\x\\chek.PNG' }, actor(40));
    const [key, body, mime] = storage.put.mock.calls[0];
    expect(key).toMatch(/^tasks\/1\/T1\/[0-9a-f-]{36}\.png$/);
    expect(body).toBe(PNG);
    expect(mime).toBe('image/png');
    expect(prisma.taskFile.create.mock.calls[0][0].data).toEqual({
      taskId: 'T1', key, name: 'chek.png', size: PNG.length, mime: 'image/png', kind: 'IMAGE', durationSec: null, uploadedById: 40, via: 'WEB',
    });
    expect(prisma.taskEvent.create.mock.calls[0][0].data).toEqual({
      taskId: 'T1', type: 'FILE', actorId: 40, text: 'chek.png', fileId: 'F1', via: 'WEB',
    });
    expect(emitter.emit).toHaveBeenCalledWith(TASK_EVENTS.COMMENTED, { task: { id: 'T1' }, actorId: 40, text: 'chek.png', attachment: 'FILE' });
    expect(out.file).toMatchObject({ id: 'F1', canDelete: true, url: 'https://view', downloadUrl: 'https://dl' });
    expect(out.file).not.toHaveProperty('key');
    expect(out.event).toEqual({ id: 'E1', type: 'FILE', fileId: 'F1' });
  });

  it('a voice message from Telegram: VOICE row and event, its length, «Ovozli xabar»', async () => {
    prisma.taskFile.create.mockResolvedValue(fileRow({ kind: 'VOICE', mime: 'audio/ogg', durationSec: 42 }));
    await svc.upload('T1', { buffer: OGG, name: 'ovozli-xabar.ogg', durationSec: 42 }, actor(40, 'TELEGRAM'));
    expect(prisma.taskFile.create.mock.calls[0][0].data).toMatchObject({ kind: 'VOICE', durationSec: 42, via: 'TELEGRAM' });
    expect(prisma.taskEvent.create.mock.calls[0][0].data).toMatchObject({ type: 'VOICE', via: 'TELEGRAM' });
    expect(emitter.emit.mock.calls[0][1]).toMatchObject({ text: 'Ovozli xabar', attachment: 'VOICE' });
  });

  it('a refused type: 400 before anything is stored', async () => {
    await expect(svc.upload('T1', { buffer: Buffer.from('<html>'), name: 'a.html' }, actor(40))).rejects.toThrow(FILE_TYPE_MESSAGE);
    expect(storage.put).not.toHaveBeenCalled();
    expect(prisma.taskFile.create).not.toHaveBeenCalled();
  });

  it('a task the caller cannot see: its 404, nothing stored', async () => {
    tasks.loadForAccess.mockRejectedValue(new NotFoundException('Topshiriq topilmadi'));
    await expect(svc.upload('T1', { buffer: PNG }, actor(99))).rejects.toThrow(NotFoundException);
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('the row does not commit: the object is removed, the error goes on, nobody is told', async () => {
    prisma.$transaction.mockRejectedValue(new Error('db down'));
    await expect(svc.upload('T1', { buffer: PNG }, actor(40))).rejects.toThrow('db down');
    expect(storage.remove).toHaveBeenCalledWith(storage.put.mock.calls[0][0]);
    expect(emitter.emit).not.toHaveBeenCalled();
  });

  it('files off: 503, the task is not even loaded', async () => {
    storage.enabled = false;
    await expect(svc.upload('T1', { buffer: PNG }, actor(40))).rejects.toThrow(ServiceUnavailableException);
    expect(tasks.loadForAccess).not.toHaveBeenCalled();
  });
});

describe('remove', () => {
  beforeEach(() => prisma.taskFile.findFirst.mockResolvedValue({ id: 'F1', name: 'chek.png', uploadedById: 40 }));

  it('the uploader: soft delete and a FILE_DELETED line', async () => {
    await svc.remove('T1', 'F1', actor(40));
    expect(prisma.taskFile.updateMany).toHaveBeenCalledWith({
      where: { id: 'F1', deletedAt: null },
      data: { deletedAt: expect.any(Date), deletedById: 40 },
    });
    expect(prisma.taskEvent.create.mock.calls[0][0].data).toEqual({
      taskId: 'T1', type: 'FILE_DELETED', actorId: 40, text: 'chek.png', fileId: 'F1', via: 'WEB',
    });
    expect(emitter.emit).not.toHaveBeenCalled();
  });
  it('a manager of the task may; anyone else gets 403', async () => {
    tasks.loadForAccess.mockResolvedValue({ row: row(), access: access({ canManage: true }) });
    await expect(svc.remove('T1', 'F1', actor(30))).resolves.toBeDefined();
    tasks.loadForAccess.mockResolvedValue({ row: row(), access: access() });
    await expect(svc.remove('T1', 'F1', actor(50))).rejects.toThrow(new ForbiddenException(DELETE_REFUSED_MESSAGE));
  });
  it('a missing or already deleted file: 404; a delete that lost the race: 404, no line', async () => {
    prisma.taskFile.findFirst.mockResolvedValue(null);
    await expect(svc.remove('T1', 'F9', actor(40))).rejects.toThrow(NotFoundException);
    prisma.taskFile.findFirst.mockResolvedValue({ id: 'F1', name: 'chek.png', uploadedById: 40 });
    prisma.taskFile.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.remove('T1', 'F1', actor(40))).rejects.toThrow(NotFoundException);
    expect(prisma.taskEvent.create).not.toHaveBeenCalled();
  });
});

describe('list', () => {
  it('live files with fresh links, who may delete each; no photo question for an ordinary task', async () => {
    prisma.taskFile.findMany.mockResolvedValue([fileRow(), fileRow({ id: 'F2', uploadedById: 41, uploadedBy: null })]);
    const out = await svc.list('T1', actor(40));
    expect(prisma.taskFile.findMany.mock.calls[0][0].where).toEqual({ taskId: 'T1', deletedAt: null });
    expect(out.data.map((f) => [f.id, f.canDelete, f.url])).toEqual([['F1', true, 'https://view'], ['F2', false, 'https://view']]);
    expect(out.hasFreshPhoto).toBe(false);
    expect(prisma.taskFile.count).not.toHaveBeenCalled();
  });
  it('a photo task: counts images after the last return', async () => {
    const lastReturnedAt = new Date('2026-10-12T05:00:00Z');
    tasks.loadForAccess.mockResolvedValue({ row: row({ requiresPhoto: true, lastReturnedAt }), access: access() });
    prisma.taskFile.count.mockResolvedValue(1);
    expect((await svc.list('T1', actor(40))).hasFreshPhoto).toBe(true);
    expect(prisma.taskFile.count).toHaveBeenCalledWith({
      where: { taskId: 'T1', kind: 'IMAGE', deletedAt: null, createdAt: { gt: lastReturnedAt } },
    });
  });
  it('files off: an empty list, no signing', async () => {
    storage.enabled = false;
    prisma.taskFile.findMany.mockResolvedValue([fileRow()]);
    expect((await svc.list('T1', actor(40))).data).toEqual([]);
    expect(storage.signedGet).not.toHaveBeenCalled();
  });
});

describe('purge (03:00)', () => {
  it('deletes the objects of files deleted 30+ days ago and stamps only those that went', async () => {
    prisma.taskFile.findMany.mockResolvedValue([{ id: 'F1', key: 'k1' }, { id: 'F2', key: 'k2' }]);
    storage.remove.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(svc.purge(NOW)).resolves.toBe(1);
    expect(prisma.taskFile.findMany.mock.calls[0][0]).toMatchObject({
      where: { deletedAt: { lt: new Date('2026-10-21T00:00:00Z') }, purgedAt: null },
      take: 500,
    });
    expect(prisma.taskFile.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['F1'] } }, data: { purgedAt: NOW } });
  });
  it('files off: nothing', async () => {
    storage.enabled = false;
    await expect(svc.purge(NOW)).resolves.toBe(0);
    expect(prisma.taskFile.findMany).not.toHaveBeenCalled();
  });
});

it('config says whether files are on', () => {
  expect(svc.config()).toEqual({ filesEnabled: true });
  storage.enabled = false;
  expect(svc.config()).toEqual({ filesEnabled: false });
});

it('BadRequestException is what a refused file throws (the controller relies on it)', () => {
  expect(new BadRequestException(FILE_TYPE_MESSAGE).getStatus()).toBe(400);
});
```

- [ ] **Step 6: Run it** — `npx jest src/tasks/task-files.service.spec.ts`. Expected: FAIL (module not found).

- [ ] **Step 7: Implement** — `server/src/tasks/task-files.service.ts`

```ts
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron } from '@nestjs/schedule';
import type { Prisma, TaskEventVia, TaskFileKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TasksService, type TaskActor } from './tasks.service';
import { TaskFileStorage } from './task-file-storage';
import { TASK_EVENTS } from './task-events';
import { TASK_EVENT_SELECT, type TaskEventRow } from './task-select';
import { hasFreshPhoto } from './task-status-writes';
import {
  DELETE_REFUSED_MESSAGE,
  FILES_OFF_MESSAGE,
  FILE_NOT_FOUND_MESSAGE,
  PURGE_AFTER_DAYS,
  PURGE_BATCH,
  checkTaskFile,
  safeFileName,
  taskFileKey,
} from './task-file-rules';

const FILE_SELECT = {
  id: true,
  key: true,
  name: true,
  size: true,
  mime: true,
  kind: true,
  durationSec: true,
  via: true,
  createdAt: true,
  uploadedById: true,
  uploadedBy: {
    select: { id: true, firstName: true, lastName: true, photo: true },
  },
} satisfies Prisma.TaskFileSelect;
type FileRow = Prisma.TaskFileGetPayload<{ select: typeof FILE_SELECT }>;

export type TaskFileView = {
  id: string;
  name: string;
  size: number;
  mime: string;
  kind: TaskFileKind;
  durationSec: number | null;
  via: TaskEventVia;
  createdAt: Date;
  uploadedBy: FileRow['uploadedBy'];
  canDelete: boolean;
  url: string;
  downloadUrl: string;
};

/**
 * Task files (spec §3.5, ADR-0086). The server stores every upload (website
 * multipart and Telegram alike) after reading its type from the bytes, and
 * hands out 10-minute links after the same access check as the task. A file is
 * a feed row (`FILE` / `VOICE`) and a comment's notice; a delete is soft.
 */
@Injectable()
export class TaskFilesService {
  constructor(
    private prisma: PrismaService,
    private emitter: EventEmitter2,
    private tasks: TasksService,
    private storage: TaskFileStorage,
  ) {}

  config(): { filesEnabled: boolean } {
    return { filesEnabled: this.storage.enabled };
  }

  async list(
    taskId: string,
    actor: TaskActor,
  ): Promise<{ data: TaskFileView[]; hasFreshPhoto: boolean }> {
    const { row, access } = await this.tasks.loadForAccess(
      this.prisma,
      taskId,
      actor,
    );
    const [files, fresh] = await Promise.all([
      this.prisma.taskFile.findMany({
        where: { taskId, deletedAt: null },
        select: FILE_SELECT,
        orderBy: { createdAt: 'asc' },
        take: 200,
      }),
      row.requiresPhoto ? hasFreshPhoto(this.prisma, row) : false,
    ]);
    const data = this.storage.enabled
      ? await Promise.all(
          files.map((f) => this.view(f, actor.userId, access.canManage)),
        )
      : [];
    return { data, hasFreshPhoto: fresh };
  }

  async upload(
    taskId: string,
    input: { buffer: Buffer; name?: string; durationSec?: number },
    actor: TaskActor,
  ): Promise<{ file: TaskFileView; event: TaskEventRow }> {
    if (!this.storage.enabled) {
      throw new ServiceUnavailableException(FILES_OFF_MESSAGE);
    }
    // Who may view the task may add to it (like a comment); 404 otherwise.
    const { row, access } = await this.tasks.loadForAccess(
      this.prisma,
      taskId,
      actor,
    );
    const { mime, ext, kind } = checkTaskFile(input);
    const name = safeFileName(input.name, ext);
    const key = taskFileKey(row.companyId, row.id, ext);
    const via = actor.via ?? 'WEB';
    await this.storage.put(key, input.buffer, mime);
    let saved: { file: FileRow; event: TaskEventRow };
    try {
      saved = await this.prisma.$transaction(async (tx) => {
        const file = await tx.taskFile.create({
          data: {
            taskId,
            key,
            name,
            size: input.buffer.length,
            mime,
            kind,
            durationSec: kind === 'VOICE' ? (input.durationSec ?? null) : null,
            uploadedById: actor.userId,
            via,
          },
          select: FILE_SELECT,
        });
        const event = await tx.taskEvent.create({
          data: {
            taskId,
            type: kind === 'VOICE' ? 'VOICE' : 'FILE',
            actorId: actor.userId,
            text: name,
            fileId: file.id,
            via,
          },
          select: TASK_EVENT_SELECT,
        });
        return { file, event };
      });
    } catch (err) {
      // No row, no way to reach the object: take it back (logged if that fails too).
      await this.storage.remove(key);
      throw err;
    }
    this.emitter.emit(TASK_EVENTS.COMMENTED, {
      task: this.tasks.eventTask(row),
      actorId: actor.userId,
      text: kind === 'VOICE' ? 'Ovozli xabar' : name,
      attachment: kind === 'VOICE' ? 'VOICE' : 'FILE',
    });
    return {
      file: await this.view(saved.file, actor.userId, access.canManage),
      event: saved.event,
    };
  }

  async remove(
    taskId: string,
    fileId: string,
    actor: TaskActor,
  ): Promise<{ event: TaskEventRow }> {
    const { access } = await this.tasks.loadForAccess(
      this.prisma,
      taskId,
      actor,
    );
    const file = await this.prisma.taskFile.findFirst({
      where: { id: fileId, taskId, deletedAt: null },
      select: { id: true, name: true, uploadedById: true },
    });
    if (!file) throw new NotFoundException(FILE_NOT_FOUND_MESSAGE);
    if (file.uploadedById !== actor.userId && !access.canManage) {
      throw new ForbiddenException(DELETE_REFUSED_MESSAGE);
    }
    const event = await this.prisma.$transaction(async (tx) => {
      // Conditional: two deletes at once write one history line.
      const { count } = await tx.taskFile.updateMany({
        where: { id: file.id, deletedAt: null },
        data: { deletedAt: new Date(), deletedById: actor.userId },
      });
      if (count === 0) throw new NotFoundException(FILE_NOT_FOUND_MESSAGE);
      return tx.taskEvent.create({
        data: {
          taskId,
          type: 'FILE_DELETED',
          actorId: actor.userId,
          text: file.name,
          fileId: file.id,
          via: actor.via ?? 'WEB',
        },
        select: TASK_EVENT_SELECT,
      });
    });
    return { event };
  }

  /** Spec §9.6: the objects of files deleted 30+ days ago. The rows stay (history). */
  @Cron('0 0 3 * * *', { timeZone: 'Asia/Tashkent' })
  async purge(now = new Date()): Promise<number> {
    if (!this.storage.enabled) return 0;
    const before = new Date(now.getTime() - PURGE_AFTER_DAYS * 864e5);
    const rows = await this.prisma.taskFile.findMany({
      where: { deletedAt: { lt: before }, purgedAt: null },
      select: { id: true, key: true },
      orderBy: { deletedAt: 'asc' },
      take: PURGE_BATCH,
    });
    const gone: string[] = [];
    for (const r of rows) {
      if (await this.storage.remove(r.key)) gone.push(r.id);
    }
    if (gone.length) {
      await this.prisma.taskFile.updateMany({
        where: { id: { in: gone } },
        data: { purgedAt: now },
      });
    }
    return gone.length;
  }

  private async view(
    f: FileRow,
    userId: number,
    canManage: boolean,
  ): Promise<TaskFileView> {
    const [url, downloadUrl] = await Promise.all([
      this.storage.signedGet(f.key, f.mime, f.name, false),
      this.storage.signedGet(f.key, f.mime, f.name, true),
    ]);
    return {
      id: f.id,
      name: f.name,
      size: f.size,
      mime: f.mime,
      kind: f.kind,
      durationSec: f.durationSec,
      via: f.via,
      createdAt: f.createdAt,
      uploadedBy: f.uploadedBy,
      canDelete: f.uploadedById === userId || canManage,
      url,
      downloadUrl,
    };
  }
}
```

The `purge` `findMany` passes `orderBy`, so the test's `toMatchObject` (on `where` + `take`) still matches.

- [ ] **Step 8: Run** — `npx jest src/tasks/task-files.service.spec.ts src/tasks/task-notify-plan.files.spec.ts src/tasks/task-notify-plan.spec.ts src/tasks/task-write.single-source.spec.ts src/tasks/tasks-read.service.spec.ts`. Expected: PASS. The single-source spec now sees the `taskFile` writes, all inside `src/tasks/`.

- [ ] **Step 9: Gate and commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server
npx prettier --write src/tasks/task-files.service.ts src/tasks/task-files.service.spec.ts src/tasks/task-status-writes.ts src/tasks/task-select.ts src/tasks/task-events.ts src/tasks/task-notify-plan.ts src/tasks/task-notify-plan.files.spec.ts
npx eslint src/tasks/task-files.service.ts src/tasks/task-files.service.spec.ts src/tasks/task-status-writes.ts src/tasks/task-select.ts src/tasks/task-events.ts src/tasks/task-notify-plan.ts src/tasks/task-notify-plan.files.spec.ts --quiet
npm run typecheck
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add server/src/tasks/task-files.service.ts server/src/tasks/task-files.service.spec.ts server/src/tasks/task-status-writes.ts server/src/tasks/task-select.ts server/src/tasks/task-events.ts server/src/tasks/task-notify-plan.ts server/src/tasks/task-notify-plan.files.spec.ts
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup commit -m "feat(tasks): TaskFilesService — upload, list with signed links, soft delete, 03:00 purge" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(If the test file's untyped mocks trip `@typescript-eslint/no-unsafe-*`, follow what the neighbouring specs do: they use `any` with the same file-level setup. Copy their eslint header comment if they have one.)

---

### Task 5: Routes, module, manifest, snapshot

**Files:**
- Create: `server/src/tasks/dto/upload-task-file.dto.ts`
- Modify: `server/src/tasks/tasks.controller.ts`, `server/src/tasks/tasks.controller.spec.ts`
- Modify: `server/src/tasks/tasks.module.ts`, `server/src/tasks/tasks.module.di.spec.ts`
- Modify: `server/src/common/auth/branch-route-policy.ts`, `server/src/common/permissions/route-access.snapshot.json`

**Interfaces:**
- Consumes: `TaskFilesService` (Task 4), `TaskFileStorage` (Task 3), `MAX_TASK_FILE_BYTES`, `MAX_VOICE_SECONDS`, `VOICE_LIMIT_MESSAGE` (Task 2).
- Produces: `GET /tasks/config`, `GET /tasks/:id/files`, `POST /tasks/:id/files`, `DELETE /tasks/:id/files/:fileId`. The controller's 4th constructor argument is `files: TaskFilesService`. `TasksModule` provides `TaskFileStorage` and `TaskFilesService`.

- [ ] **Step 1: DTO** — `server/src/tasks/dto/upload-task-file.dto.ts`

```ts
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  MAX_VOICE_SECONDS,
  VOICE_LIMIT_MESSAGE,
} from '../task-file-rules';

/** The text fields of `POST /tasks/:id/files` (multipart; the file itself is `file`). */
export class UploadTaskFileDto {
  /** The name as the person sees it: multer decodes the part's filename as latin1, so UTF-8 names travel here. */
  @IsOptional() @IsString() @MaxLength(255) name?: string;
  /** A recording's length from the website recorder. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_VOICE_SECONDS, { message: VOICE_LIMIT_MESSAGE })
  durationSec?: number;
}
```

- [ ] **Step 2: Failing controller spec.** In `server/src/tasks/tasks.controller.spec.ts`:
  - import `TaskFilesService` from `./task-files.service` and add `{ provide: TaskFilesService, useValue: {} }` to **both** `createTestingModule` provider lists;
  - change `'gives all twenty routes …'` to `'gives all twenty-four routes …'` and `toHaveLength(20)` to `toHaveLength(24)`;
  - add:

```ts
  it('declares GET config before GET :id, so the word is never read as an id', () => {
    const names = Object.getOwnPropertyNames(proto);
    expect(names.indexOf('config')).toBeLessThan(names.indexOf('detail'));
  });
  it('an upload without a file is a 400; with one, the service gets the bytes, the UTF-8 name and the length', async () => {
    const actor = { userId: 1 };
    const upload = jest.fn().mockResolvedValue({});
    const mod = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [
        { provide: TasksService, useValue: { loadActor: jest.fn().mockResolvedValue(actor) } },
        { provide: TasksReadService, useValue: {} },
        { provide: TaskRecurrencesService, useValue: {} },
        { provide: TaskFilesService, useValue: { upload } },
      ],
    }).compile();
    const c = mod.get(TasksController);
    await expect(c.uploadFile('T1', undefined, {}, 1, 1)).rejects.toThrow('Fayl yuklanmadi');
    const buffer = Buffer.from('x');
    await c.uploadFile('T1', { buffer, originalname: 'Ð\u009e.png' } as never, { name: 'Ўқув.png', durationSec: 12 }, 1, 1);
    expect(upload).toHaveBeenCalledWith('T1', { buffer, name: 'Ўқув.png', durationSec: 12 }, actor);
  });
```

Run `npx jest src/tasks/tasks.controller.spec.ts`. Expected: FAIL.

- [ ] **Step 3: Controller.** In `server/src/tasks/tasks.controller.ts`:
  - imports: add `BadRequestException, UploadedFile, UseInterceptors` to the `@nestjs/common` import; `import { FileInterceptor } from '@nestjs/platform-express';`; `import { TaskFilesService } from './task-files.service';`; `import { UploadTaskFileDto } from './dto/upload-task-file.dto';`; `import { MAX_TASK_FILE_BYTES } from './task-file-rules';`.
  - constructor: add `private files: TaskFilesService,` as the 4th parameter.
  - right **above** `@Get('recurrences')` add:

```ts
  // Static, so above `:id`. Off (no R2_TASKS_BUCKET_NAME) → the client hides every file control.
  @Get('config') config() {
    return this.files.config();
  }
```

  - after `comment(...)` (the `POST :id/events` route) add:

```ts
  @Get(':id/files') async fileList(
    @Param('id') id: string,
    @CurrentUser('id') uid: number,
    @CurrentUser('companyId') cid: number,
  ) {
    return this.files.list(id, await this.actor(uid, cid));
  }
  // Through the server, not a presigned PUT (ADR-0086): the type is read from the bytes.
  @Post(':id/files')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_TASK_FILE_BYTES, files: 1 },
    }),
  )
  async uploadFile(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadTaskFileDto,
    @CurrentUser('id') uid: number,
    @CurrentUser('companyId') cid: number,
  ) {
    if (!file) throw new BadRequestException('Fayl yuklanmadi');
    return this.files.upload(
      id,
      {
        buffer: file.buffer,
        name: dto.name ?? file.originalname,
        durationSec: dto.durationSec,
      },
      await this.actor(uid, cid),
    );
  }
  @Delete(':id/files/:fileId') async removeFile(
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @CurrentUser('id') uid: number,
    @CurrentUser('companyId') cid: number,
  ) {
    return this.files.remove(id, fileId, await this.actor(uid, cid));
  }
```

- [ ] **Step 4: Module and DI.** In `server/src/tasks/tasks.module.ts`, import `TaskFileStorage` and `TaskFilesService` and add both to `providers` (after `TaskRecurrenceRunner`). In `server/src/tasks/tasks.module.di.spec.ts`, import both and add them to the `for (const token of [...])` list.

- [ ] **Step 5: Route manifest.** In `server/src/common/auth/branch-route-policy.ts`:
  - add `'DELETE /tasks/:id/files/:fileId'`, `'GET /tasks/:id/files'` and `'POST /tasks/:id/files'` to the `BRANCH_SCOPED_BY_ENTITY` tasks block's `routes` (keep the list's alphabetical order) and append to its `reason`: `' A task file route (list, upload, delete) loads the task through the same `loadForAccess` first; a delete then also needs the uploader or `canManage`.'`
  - add a new block right after the tasks `BRANCH_SCOPED_BY_SERVICE` block:

```ts
  {
    policy: 'COMPANY_WIDE',
    reason:
      'A server switch, not data: whether the private task-file bucket is ' +
      'configured (`R2_TASKS_BUCKET_NAME`, ADR-0086). The same answer for ' +
      'every caller and branch.',
    routes: ['GET /tasks/config'],
  },
```

  In `server/src/common/permissions/route-access.snapshot.json`, add four rows, each in its alphabetical place among the keys, with the same value as `"GET /tasks"`:

```json
  "DELETE /tasks/:id/files/:fileId": ["Administrator", "Branch Director", "CEO", "Cashier", "Teacher"],
  "GET /tasks/:id/files": ["Administrator", "Branch Director", "CEO", "Cashier", "Teacher"],
  "GET /tasks/config": ["Administrator", "Branch Director", "CEO", "Cashier", "Teacher"],
  "POST /tasks/:id/files": ["Administrator", "Branch Director", "CEO", "Cashier", "Teacher"],
```

  Use the file's own multi-line formatting: one role per line, two-space indent, as the neighbouring rows are.

- [ ] **Step 6: Run**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server
npx jest src/tasks/tasks.controller.spec.ts src/tasks/tasks.module.di.spec.ts src/common/auth/branch-route-policy.spec.ts src/common/permissions/permission-routes.spec.ts
```

Expected: PASS. The 24 routes carry the any-staff marker, every route is classified, and the snapshot matches.

- [ ] **Step 7: Gate and commit**

```bash
npx prettier --write src/tasks/dto/upload-task-file.dto.ts src/tasks/tasks.controller.ts src/tasks/tasks.controller.spec.ts src/tasks/tasks.module.ts src/tasks/tasks.module.di.spec.ts src/common/auth/branch-route-policy.ts
npx eslint src/tasks/dto/upload-task-file.dto.ts src/tasks/tasks.controller.ts src/tasks/tasks.controller.spec.ts src/tasks/tasks.module.ts src/tasks/tasks.module.di.spec.ts src/common/auth/branch-route-policy.ts --quiet
npm run typecheck
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add server/src/tasks/dto/upload-task-file.dto.ts server/src/tasks/tasks.controller.ts server/src/tasks/tasks.controller.spec.ts server/src/tasks/tasks.module.ts server/src/tasks/tasks.module.di.spec.ts server/src/common/auth/branch-route-policy.ts server/src/common/permissions/route-access.snapshot.json
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup commit -m "feat(tasks): file routes — config, list, multipart upload, delete" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The photo rule and «Rasm bilan tasdiqlansin» on create

**Files:**
- Modify: `server/src/tasks/task-status-writes.ts` (`changeStatusTx`)
- Modify: `server/src/tasks/dto/create-task.dto.ts`, `server/src/tasks/task-create.ts`, `server/src/tasks/tasks.service.ts` (`duplicate`, one line), `server/src/tasks/task-recurrences.service.ts`
- Create: `server/src/tasks/task-status-writes.photo.spec.ts`, `server/src/tasks/task-create.photo.spec.ts`

**Interfaces:**
- Consumes: `hasFreshPhoto` (Task 4), `PHOTO_REQUIRED_MESSAGE` (`task-transitions.ts`).
- Produces: `CreateTaskDto.requiresPhoto?: boolean`; `createCopiesTx` writes `requiresPhoto`; `export const RECURRING_PHOTO_MESSAGE = "Takrorlanuvchi topshiriqda rasm bilan tasdiqlash yo'q"` (in `task-recurrences.service.ts`). `changeStatusTx` refuses `IN_REVIEW` with 400 `PHOTO_REQUIRED_MESSAGE` without a fresh photo; the Telegram handler (Task 8) matches that exact message.

- [ ] **Step 1: Failing tests**

`server/src/tasks/task-status-writes.photo.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { changeStatusTx } from './task-status-writes';
import { PHOTO_REQUIRED_MESSAGE } from './task-transitions';

const createdAt = new Date('2026-10-11T05:00:00Z');
const tx = (photos: number) => ({
  taskFile: { count: jest.fn().mockResolvedValue(photos) },
  task: { update: jest.fn().mockResolvedValue({ id: 'T1' }) },
  taskEvent: { create: jest.fn() },
  taskParticipant: { updateMany: jest.fn() },
  taskOutbox: { deleteMany: jest.fn() },
});
const ctx = (over: Record<string, unknown> = {}) =>
  ({
    row: {
      id: 'T1', status: 'IN_PROGRESS', kind: 'MANUAL', authorId: 30, requiresPhoto: true, createdAt,
      lastReturnedAt: null, claimedById: null, startedAt: createdAt,
      participants: [{ userId: 40, role: 'ASSIGNEE' }],
      ...over,
    },
    access: { canWork: true, isAssignee: true },
  }) as never;

it('a photo task without a fresh photo stays where it is: 400, nothing written', async () => {
  const t = tx(0);
  await expect(changeStatusTx(t as never, ctx(), 'IN_REVIEW', 40)).rejects.toThrow(new BadRequestException(PHOTO_REQUIRED_MESSAGE));
  expect(t.task.update).not.toHaveBeenCalled();
  expect(t.taskFile.count).toHaveBeenCalledWith({
    where: { taskId: 'T1', kind: 'IMAGE', deletedAt: null, createdAt: { gt: createdAt } },
  });
});

it('with a photo added after the last return it goes to review', async () => {
  const lastReturnedAt = new Date('2026-10-12T05:00:00Z');
  const t = tx(1);
  await changeStatusTx(t as never, ctx({ lastReturnedAt }), 'IN_REVIEW', 40);
  expect(t.taskFile.count.mock.calls[0][0].where.createdAt).toEqual({ gt: lastReturnedAt });
  expect(t.task.update).toHaveBeenCalled();
});

it('no question asked when no photo is required, or when only starting', async () => {
  const plain = tx(0);
  await changeStatusTx(plain as never, ctx({ requiresPhoto: false }), 'IN_REVIEW', 40);
  await changeStatusTx(plain as never, ctx({ status: 'NEW' }), 'IN_PROGRESS', 40);
  expect(plain.taskFile.count).not.toHaveBeenCalled();
});

it('a self-task (author = only assignee) closes without a photo, as the table says', async () => {
  const t = tx(0);
  await changeStatusTx(t as never, ctx({ authorId: 40 }), 'DONE', 40);
  expect(t.taskFile.count).not.toHaveBeenCalled();
  expect(t.task.update).toHaveBeenCalled();
});
```

`server/src/tasks/task-create.photo.spec.ts`:

```ts
import { createCopiesTx } from './task-create';
import { RECURRING_PHOTO_MESSAGE, TaskRecurrencesService } from './task-recurrences.service';

const make = () => ({ task: { create: jest.fn().mockResolvedValue({ id: 'T1' }) } });
const base = { companyId: 1, branchId: null, authorId: 30, dueAt: null, batchId: null, watcherIds: [] };

it('createCopiesTx writes requiresPhoto only when asked', async () => {
  const tx = make();
  await createCopiesTx(tx as never, { ...base, dto: { title: 'A', assigneeIds: [40], requiresPhoto: true } }, [[40]], jest.fn());
  await createCopiesTx(tx as never, { ...base, dto: { title: 'B', assigneeIds: [40] } }, [[40]], jest.fn());
  expect(tx.task.create.mock.calls[0][0].data.requiresPhoto).toBe(true);
  expect(tx.task.create.mock.calls[1][0].data.requiresPhoto).toBe(false);
});

it('a recurring task cannot require a photo (400 before anything is read)', async () => {
  const svc = new TaskRecurrencesService({} as never, {} as never, {} as never);
  await expect(
    svc.create(
      { title: 'X', assigneeIds: [40], requiresPhoto: true, recurrence: { freq: 'DAILY', dueTime: '10:00' } } as never,
      { userId: 30 } as never,
    ),
  ).rejects.toThrow(RECURRING_PHOTO_MESSAGE);
});
```

Before writing the second test, check the `TaskRecurrencesService` constructor arity in `task-recurrences.service.ts`; it is `(prisma, emitter, tasks)` in the 4b plan, so pass one `{} as never` per parameter.

Run: `npx jest src/tasks/task-status-writes.photo.spec.ts src/tasks/task-create.photo.spec.ts`. Expected: FAIL.

- [ ] **Step 2: Implement**
  - `task-status-writes.ts`, in `changeStatusTx`, replace the `checkTransition({...})` call's last two lines (the comment `// No photo upload in this phase…` and `hasFreshPhoto: false,`) with `hasFreshPhoto: fresh,`, and put this right before `const verdict = checkTransition({`:

```ts
  // Asked only when it matters: a photo task heading for review (spec §3.2).
  const fresh =
    row.requiresPhoto && to === 'IN_REVIEW' && !selfTask
      ? await hasFreshPhoto(tx, row)
      : true;
```

  `hasFreshPhoto` is a function declaration in the same file, so it is hoisted. `checkTransition` only reads it on the `IN_REVIEW` path.
  - `dto/create-task.dto.ts`, after `separateCopies`: `/** «Rasm bilan tasdiqlansin» (spec §3.2): review needs a fresh photo. */ @IsOptional() @IsBoolean() requiresPhoto?: boolean;`
  - `task-create.ts`, in `createCopiesTx`'s `tx.task.create` data, after `batchId: t.batchId,`: `requiresPhoto: dto.requiresPhoto === true,`
  - `tasks.service.ts`, in `duplicate`, inside the `this.create({...})` object after `steps: …,`: `requiresPhoto: row.requiresPhoto,` (the one allowed line).
  - `task-recurrences.service.ts`: export `RECURRING_PHOTO_MESSAGE` (value above) at module level. In `create`, right after the `if (dto.dueAt) { … }` block, add `if (dto.requiresPhoto) throw new BadRequestException(RECURRING_PHOTO_MESSAGE);` (the brief's decision 6: a rule does not carry it).

- [ ] **Step 3: Run** — `npx jest src/tasks/task-status-writes.photo.spec.ts src/tasks/task-create.photo.spec.ts src/tasks/task-transitions.spec.ts src/tasks/tasks.service.spec.ts src/tasks/task-recurrences.service.spec.ts`. Expected: PASS. `tasks.service.spec.ts` fixtures have `requiresPhoto: false`, so they never reach the count.

- [ ] **Step 4: Gate and commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server
npx prettier --write src/tasks/task-status-writes.ts src/tasks/dto/create-task.dto.ts src/tasks/task-create.ts src/tasks/tasks.service.ts src/tasks/task-recurrences.service.ts src/tasks/task-status-writes.photo.spec.ts src/tasks/task-create.photo.spec.ts
npx eslint src/tasks/task-status-writes.ts src/tasks/dto/create-task.dto.ts src/tasks/task-create.ts src/tasks/tasks.service.ts src/tasks/task-recurrences.service.ts src/tasks/task-status-writes.photo.spec.ts src/tasks/task-create.photo.spec.ts --quiet
npm run typecheck
wc -l src/tasks/tasks.service.ts
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add server/src/tasks/task-status-writes.ts server/src/tasks/dto/create-task.dto.ts server/src/tasks/task-create.ts server/src/tasks/tasks.service.ts server/src/tasks/task-recurrences.service.ts server/src/tasks/task-status-writes.photo.spec.ts server/src/tasks/task-create.photo.spec.ts
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup commit -m "feat(tasks): a photo task goes to review only with a fresh photo; requiresPhoto on create" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `wc -l` prints 532.

---

### Task 7: Split the Telegram handler (no behaviour change)

**Files:**
- Create: `server/src/tasks/telegram/task-telegram-actor.ts`, `server/src/tasks/telegram/task-telegram-replies.ts`
- Modify: `server/src/tasks/telegram/task-telegram.handler.ts`, `server/src/tasks/tasks.module.ts`, `server/src/tasks/tasks.module.di.spec.ts`
- Modify (constructor/target only): `server/src/tasks/telegram/task-telegram.handler.replies.spec.ts`, `task-telegram.handler.spec.ts`, `task-telegram.handler.steps.spec.ts`

**Interfaces:**
- Consumes: the handler as it is today.
- Produces:
  - `task-telegram-actor.ts`: `export interface Me { actor: TaskActor; chatId: string }`, `export interface Seen { view: TgTaskView; canManage: boolean }`, `export async function resolveMe(prisma: PrismaService, tasks: TasksService, chatId: string, say: (text: string) => Promise<unknown>): Promise<Me | null>` (the body of today's `me`), `export async function lookupSeen(prisma: PrismaService, tasks: TasksService, me: Me, taskId: string): Promise<Seen | null>` (the body of today's `lookup`).
  - `@Injectable() class TaskTelegramReplies` (constructor `(prisma: PrismaService, tasks: TasksService)`; Task 8 adds a 3rd), with `onMessage(ctx: BotContext, next: () => Promise<void>): Promise<void>` and private `handleReply`, `ack`, moved verbatim from the handler.
  - `TaskTelegramHandler` constructor `(prisma, tasks, telegram, sender, replies: TaskTelegramReplies)`; `onApplicationBootstrap` registers `tk.on('message', (ctx, next) => this.replies.onMessage(ctx, next))`. The handler no longer has `onMessage`.

- [ ] **Step 1: Move code.**
  - `task-telegram-actor.ts`: move the `Me` and `Seen` interfaces and the bodies of `me()` and `lookup()` here, as the two exported functions above. Replace `this.prisma` and `this.tasks` with the parameters. It imports `ForbiddenException`, `NotFoundException`, `PrismaService`, `TasksService`/`TaskActor`, `loadTaskView`, `staffOfChat`, `NOT_YOURS`, `SEVERAL_ACCOUNTS`, `TgTaskView`.
  - In the handler, keep thin private wrappers so the rest of the file is untouched:

```ts
  private me(chatId: string, say: (text: string) => Promise<unknown>) {
    return resolveMe(this.prisma, this.tasks, chatId, say);
  }
  private lookup(me: Me, taskId: string) {
    return lookupSeen(this.prisma, this.tasks, me, taskId);
  }
```

  - `task-telegram-replies.ts`: move `startsWithCommand`, `onMessage`, `handleReply` and `ack` verbatim into `TaskTelegramReplies`, with its own `logger = new Logger(TaskTelegramReplies.name)`. Inside it, `this.me(...)` becomes `resolveMe(this.prisma, this.tasks, …)` and `this.lookup(...)` becomes `lookupSeen(this.prisma, this.tasks, …)`. Keep the doc comments.
  - Handler: constructor gets `private replies: TaskTelegramReplies` (5th); `tk.on('message', (ctx, next) => this.replies.onMessage(ctx, next));`; delete the moved members and the imports only they used (`TEXT_ONLY`, `ADDED_TO_TASK`, `returnedReply`, `shortName`, `Message`).
  - Module: add `TaskTelegramReplies` to `providers` before `TaskTelegramHandler`; DI spec: add it to the token list.

- [ ] **Step 2: Specs, mechanically.**
  - `task-telegram.handler.replies.spec.ts`: import `TaskTelegramReplies`; declare `let replies: TaskTelegramReplies;`; in `beforeEach`, `replies = new TaskTelegramReplies(prisma, tasks);` and `handler = new TaskTelegramHandler(prisma, tasks, telegram, sender, replies);`. Replace every `handler.onMessage(` with `replies.onMessage(`. Nothing else changes: the composer tests still call `handler.onApplicationBootstrap()` and now reach `replies.onMessage` through it.
  - `task-telegram.handler.spec.ts` (2 places) and `task-telegram.handler.steps.spec.ts` (1 place): add a 5th argument `{ onMessage: jest.fn() } as never` to `new TaskTelegramHandler(...)`.

- [ ] **Step 3: Run**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server
npx jest src/tasks/telegram src/tasks/tasks.module.di.spec.ts
wc -l src/tasks/telegram/task-telegram.handler.ts src/tasks/telegram/task-telegram-replies.ts src/tasks/telegram/task-telegram-actor.ts
```

Expected: every telegram spec passes with the same number of tests as before the change. Run `npx jest src/tasks/telegram` once on the parent commit first and note the count. The handler is about 400 lines.

- [ ] **Step 4: Gate and commit**

```bash
npx prettier --write src/tasks/telegram/task-telegram-actor.ts src/tasks/telegram/task-telegram-replies.ts src/tasks/telegram/task-telegram.handler.ts src/tasks/telegram/task-telegram.handler.replies.spec.ts src/tasks/telegram/task-telegram.handler.spec.ts src/tasks/telegram/task-telegram.handler.steps.spec.ts src/tasks/tasks.module.ts src/tasks/tasks.module.di.spec.ts
npx eslint src/tasks/telegram src/tasks/tasks.module.ts src/tasks/tasks.module.di.spec.ts --quiet
npm run typecheck
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add server/src/tasks/telegram server/src/tasks/tasks.module.ts server/src/tasks/tasks.module.di.spec.ts
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup commit -m "refactor(tasks-telegram): move replies out of the 500-line handler" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Telegram — file, photo and voice replies; «Bajardim» asks for the photo

**Files:**
- Create: `server/src/tasks/telegram/task-telegram-media.ts` (+ `.spec.ts`)
- Modify: `server/src/tasks/telegram/task-telegram-replies.ts`, `task-telegram.handler.ts`, `task-telegram-text.ts`, `task-telegram-text.spec.ts` (test #2), `task-telegram.handler.replies.spec.ts` (the PHOTO_PROMPT test, the TEXT_ONLY test)
- Create: `server/src/tasks/telegram/task-telegram-replies.files.spec.ts`, `task-telegram.handler.photo.spec.ts`, `task-telegram-text.files.spec.ts`

**Interfaces:**
- Consumes: `TaskFilesService.upload` (Task 4), `PHOTO_REQUIRED_MESSAGE`, `FILE_SIZE_MESSAGE`, `VOICE_LIMIT_MESSAGE`, `MAX_TASK_FILE_BYTES`, `MAX_VOICE_SECONDS`, `downloadFile` (`src/telegram/utils/download.util.ts`), `TgNotice` `COMMENT.attachment` (Task 4).
- Produces (in `task-telegram-text.ts`): `PHOTO_PROMPT = 'Rasmni shu xabarga javob qilib yuboring.'`, `PHOTO_PLACEHOLDER = 'Rasm'`, `PHOTO_SENT = "Rasm qo'shildi. Topshiriq tekshiruvga yuborildi."`, `PHOTO_STILL_NEEDED = "Fayl qo'shildi. Tekshiruvga yuborish uchun rasm yuboring."`, `RETURN_TEXT_ONLY = 'Qaytarish sababini matn bilan yozing.'`, `photoPromptText(title: string): string`. `TEXT_ONLY` is removed. In `task-telegram-media.ts`: `UNSUPPORTED_MEDIA`, `interface TgAttachment { fileId: string; name: string; durationSec?: number }`, `pickAttachment(msg: Message): TgAttachment | { refused: string } | null`. `TaskTelegramReplies` constructor `(prisma, tasks, files: TaskFilesService)`.

- [ ] **Step 1: Failing pure test** — `task-telegram-media.spec.ts`

```ts
import { pickAttachment, UNSUPPORTED_MEDIA } from './task-telegram-media';
import { FILE_SIZE_MESSAGE, VOICE_LIMIT_MESSAGE } from '../task-file-rules';

const m = (x: object) => ({ message_id: 1, date: 1, chat: { id: 1, type: 'private' }, ...x }) as never;
const MB = 1024 * 1024;

it('a photo: the largest size, «rasm.jpg»', () => {
  expect(pickAttachment(m({ photo: [{ file_id: 's', file_size: 10 }, { file_id: 'L', file_size: 900 }] }))).toEqual({ fileId: 'L', name: 'rasm.jpg' });
});
it('a document keeps its name; a video too; a voice gets its length', () => {
  expect(pickAttachment(m({ document: { file_id: 'd', file_name: 'Hisobot.pdf', file_size: 100 } }))).toEqual({ fileId: 'd', name: 'Hisobot.pdf' });
  expect(pickAttachment(m({ document: { file_id: 'd' } }))).toEqual({ fileId: 'd', name: 'fayl' });
  expect(pickAttachment(m({ video: { file_id: 'v', duration: 9 } }))).toEqual({ fileId: 'v', name: 'video.mp4' });
  expect(pickAttachment(m({ voice: { file_id: 'o', duration: 42, file_size: 1000 } }))).toEqual({ fileId: 'o', name: 'ovozli-xabar.ogg', durationSec: 42 });
});
it('refused before downloading: over 20 MB, a voice over 3 minutes', () => {
  expect(pickAttachment(m({ document: { file_id: 'd', file_size: 21 * MB } }))).toEqual({ refused: FILE_SIZE_MESSAGE });
  expect(pickAttachment(m({ photo: [{ file_id: 'L', file_size: 21 * MB }] }))).toEqual({ refused: FILE_SIZE_MESSAGE });
  expect(pickAttachment(m({ voice: { file_id: 'o', duration: 181 } }))).toEqual({ refused: VOICE_LIMIT_MESSAGE });
});
it('a text is not an attachment; a sticker, an audio track, a round video are refused', () => {
  expect(pickAttachment(m({ text: 'salom' }))).toBeNull();
  for (const x of [{ sticker: { file_id: 's' } }, { audio: { file_id: 'a' } }, { video_note: { file_id: 'n' } }, { location: {} }]) {
    expect(pickAttachment(m(x))).toEqual({ refused: UNSUPPORTED_MEDIA });
  }
});
```

- [ ] **Step 2: Implement** — `task-telegram-media.ts`

```ts
import type { Message } from 'telegraf/types';
import {
  FILE_SIZE_MESSAGE,
  MAX_TASK_FILE_BYTES,
  MAX_VOICE_SECONDS,
  VOICE_LIMIT_MESSAGE,
} from '../task-file-rules';

export const UNSUPPORTED_MEDIA =
  'Bu turdagi xabar qabul qilinmaydi: matn, rasm, hujjat, video yoki ovozli xabar yuboring.';

/** What the bot downloads (`getFile`); the service reads the type from the bytes. */
export interface TgAttachment {
  fileId: string;
  name: string;
  durationSec?: number;
}

/**
 * The file in a reply (spec §6.2), refused early when Telegram already says it
 * is too big or too long — nothing is downloaded then. null = a text message.
 */
export function pickAttachment(
  msg: Message,
): TgAttachment | { refused: string } | null {
  const big = (size?: number) => (size ?? 0) > MAX_TASK_FILE_BYTES;
  if ('photo' in msg && msg.photo.length) {
    const p = msg.photo[msg.photo.length - 1];
    return big(p.file_size)
      ? { refused: FILE_SIZE_MESSAGE }
      : { fileId: p.file_id, name: 'rasm.jpg' };
  }
  if ('document' in msg) {
    const d = msg.document;
    return big(d.file_size)
      ? { refused: FILE_SIZE_MESSAGE }
      : { fileId: d.file_id, name: d.file_name ?? 'fayl' };
  }
  if ('video' in msg) {
    const v = msg.video;
    return big(v.file_size)
      ? { refused: FILE_SIZE_MESSAGE }
      : { fileId: v.file_id, name: v.file_name ?? 'video.mp4' };
  }
  if ('voice' in msg) {
    const v = msg.voice;
    if (v.duration > MAX_VOICE_SECONDS) return { refused: VOICE_LIMIT_MESSAGE };
    return big(v.file_size)
      ? { refused: FILE_SIZE_MESSAGE }
      : { fileId: v.file_id, name: 'ovozli-xabar.ogg', durationSec: v.duration };
  }
  if ('text' in msg) return null;
  return { refused: UNSUPPORTED_MEDIA };
}
```

- [ ] **Step 3: Texts.** In `task-telegram-text.ts`:
  - delete `TEXT_ONLY` and its comment; add the produced constants and

```ts
/** The «Bajardim» prompt of a photo task, sent with HTML; it names the task (as the return prompt does). */
export function photoPromptText(title: string): string {
  return `${PHOTO_PROMPT}\n<b>${esc(clip(title, 80))}</b>`;
}
```

  - replace the comment above `PHOTO_LINE` with `// The assignee's line on a photo task: «Bajardim» asks for the photo (PHOTO_PROMPT).`
  - `headline`, case `'COMMENT'`: `return n.attachment === 'VOICE' ? 'Ovozli xabar' : n.attachment === 'FILE' ? 'Yangi fayl' : 'Yangi izoh';`
  - `stateButtons`: replace the comment and `if (!view.requiresPhoto) row.push(cb('Bajardim', …))` with a plain `row.push(cb('Bajardim', tkData('done', view.id)));` and the comment `// On a photo task the press asks for the photo (the service refuses review without one).`
  - `task-telegram-text.spec.ts` test `#2`: rename it to `'#2 a task confirmed with a photo: «Bajardim» too (it asks for the photo), and the photo line'`; expectations `[['Boshladim', 'Bajardim'], ['Ochish']]` and `[['Bajardim'], ['Ochish']]`.
  - `task-telegram-text.files.spec.ts` (new): copy the `view()` fixture and the `labels` helper from `task-telegram-text.spec.ts`, then assert:
    - `{ kind: 'COMMENT', by: 'Rahimov A.', text: 'chek.jpg', attachment: 'FILE' }` → first line `<b>Yangi fayl</b>`, second the title, third `Rahimov A.: «chek.jpg»`, buttons `[['Ochish']]`;
    - with `attachment: 'VOICE'` the first line is `<b>Ovozli xabar</b>`;
    - `photoPromptText('<b>x</b>')` is `Rasmni shu xabarga javob qilib yuboring.\n<b>&lt;b&gt;x&lt;/b&gt;</b>`.

- [ ] **Step 4: «Bajardim» asks for the photo (handler).** In `handleAction`'s `catch (err)` block, right after `if (!(err instanceof HttpException)) throw err;`, add:

```ts
      // A photo task without a fresh photo (spec §6.1): ask for it as a reply.
      if (cmd.action === 'done' && err.message === PHOTO_REQUIRED_MESSAGE) {
        await this.answer(ctx);
        return this.askPhoto(ctx, me, view);
      }
```

and the method, next to `askReason`:

```ts
  /** «Rasmni shu xabarga javob qilib yuboring»: a photo reply sends the task to review (`TaskTelegramReplies`). */
  private async askPhoto(
    ctx: BotContext,
    me: Me,
    view: TgTaskView,
  ): Promise<void> {
    const cardId = ctx.callbackQuery?.message?.message_id;
    const prompt = await ctx.reply(photoPromptText(view.title), {
      parse_mode: 'HTML',
      ...(cardId !== undefined && {
        reply_parameters: {
          message_id: cardId,
          allow_sending_without_reply: true,
        },
      }),
      reply_markup: {
        force_reply: true,
        input_field_placeholder: PHOTO_PLACEHOLDER,
      },
    });
    await this.sender.record(
      me.chatId,
      prompt.message_id,
      view,
      me.actor.userId,
      'PHOTO_PROMPT',
    );
  }
```

(imports: `PHOTO_REQUIRED_MESSAGE` from `../task-transitions`; `PHOTO_PLACEHOLDER`, `photoPromptText` from `./task-telegram-text`).

`task-telegram.handler.photo.spec.ts` (new): copy the fixture block (`TASK`, `actorOf`, `view`, `press`, `as`, the `jest.mock('./task-telegram-view', …)` and the `beforeEach` that builds the handler) from `task-telegram.handler.spec.ts`, with the 5th constructor argument `{ onMessage: jest.fn() } as never`. Tests:
  - `tasks.changeStatus.mockRejectedValue(new BadRequestException(PHOTO_REQUIRED_MESSAGE))`, `loadTaskView` → `view({ requiresPhoto: true, status: 'IN_PROGRESS' })`, `press('tk:done:'+TASK)` as user 40 (assignee, author 30). Expect: `answerCbQuery` called once with no text; `ctx.reply` called with `photoPromptText('Oktabr banneri')` and `{ parse_mode: 'HTML', reply_parameters: { message_id: 5, allow_sending_without_reply: true }, reply_markup: { force_reply: true, input_field_placeholder: 'Rasm' } }`; `sender.record` called with `('700', 9, expect.objectContaining({ id: TASK }), 40, 'PHOTO_PROMPT')`; `editMessageText` not called.
  - With a fresh photo (`changeStatus` resolves), the press just moves it: `changeStatus` called with `(TASK, 'IN_REVIEW', expect.objectContaining({ via: 'TELEGRAM' }))`, no reply, the card is redrawn (`editMessageText` called).
  - Any other refusal (e.g. `new BadRequestException('Holat allaqachon shunday')`) keeps today's behaviour: an alert with the message and a redraw, no prompt.

- [ ] **Step 5: Replies store files.** `TaskTelegramReplies` constructor gets `private files: TaskFilesService` (3rd). Rewrite `handleReply` from the `if (!link) return false;` line on:

```ts
    if (!link) return false;
    const attachment = pickAttachment(msg);
    if (attachment && 'refused' in attachment) {
      await ctx.reply(attachment.refused);
      return true;
    }
    const text = 'text' in msg ? msg.text.trim() : '';
    if (!attachment && !text) {
      await ctx.reply(UNSUPPORTED_MEDIA);
      return true;
    }
    const me = await resolveMe(this.prisma, this.tasks, chatId, (t) =>
      ctx.reply(t),
    );
    if (!me) return true;
    // The same rule as for a button: the replier must be the author or on it.
    if (!(await lookupSeen(this.prisma, this.tasks, me, link.taskId))) {
      await ctx.reply(NOT_YOURS);
      return true;
    }
    try {
      if (attachment) {
        await this.storeAttachment(ctx, me, link, attachment);
        return true;
      }
      switch (link.purpose) {
        case 'RETURN_PROMPT': {
          // unchanged: review RETURN with `text`, ack returnedReply(...)
          break;
        }
        case 'NOTICE':
          // unchanged: addComment, ack ADDED_TO_TASK
          break;
        case 'PHOTO_PROMPT':
          // A text where a photo was asked for: ask again, store nothing.
          await ctx.reply(PHOTO_PROMPT);
          break;
      }
    } catch (err) {
      if (!(err instanceof HttpException)) throw err;
      await ctx.reply(
        err instanceof NotFoundException ? NOT_YOURS : err.message,
      );
    }
    return true;
```

(Keep the `RETURN_PROMPT` and `NOTICE` bodies exactly as they are today. Drop the `default:` warn branch: every purpose now has a case, and TypeScript's exhaustiveness covers a new one.) Add:

```ts
  /**
   * A photo, document, video or voice reply (spec §6.2): downloaded from
   * Telegram (≤ 20 MB, checked before), stored like a website upload. A photo
   * answering «Rasmni … yuboring» then sends the task to review. The file link
   * carries the bot token: it is never logged.
   */
  private async storeAttachment(
    ctx: BotContext,
    me: Me,
    link: { taskId: string; purpose: TaskTelegramPurpose },
    a: TgAttachment,
  ): Promise<void> {
    if (link.purpose === 'RETURN_PROMPT') {
      await ctx.reply(RETURN_TEXT_ONLY);
      return;
    }
    const href = (await ctx.telegram.getFileLink(a.fileId)).href;
    const buffer = await downloadFile(href);
    const { file } = await this.files.upload(
      link.taskId,
      { buffer, name: a.name, durationSec: a.durationSec },
      me.actor,
    );
    const msg = ctx.message;
    const caption =
      msg && 'caption' in msg ? (msg.caption?.trim() ?? '') : '';
    if (caption) await this.tasks.addComment(link.taskId, caption, me.actor);
    if (link.purpose !== 'PHOTO_PROMPT') {
      return this.ack(ctx, ADDED_TO_TASK);
    }
    if (file.kind !== 'IMAGE') return this.ack(ctx, PHOTO_STILL_NEEDED);
    try {
      await this.tasks.changeStatus(link.taskId, 'IN_REVIEW', me.actor);
      await this.ack(ctx, PHOTO_SENT);
    } catch (err) {
      if (!(err instanceof HttpException)) throw err;
      // The photo is saved; the move was not (already in review, returned…).
      await this.ack(ctx, `${ADDED_TO_TASK} ${err.message}`);
    }
  }
```

(imports: `TaskTelegramPurpose` type from `@prisma/client`; `downloadFile` from `../../telegram/utils/download.util`; `TaskFilesService` from `../task-files.service`; `pickAttachment`, `UNSUPPORTED_MEDIA`, `TgAttachment` from `./task-telegram-media`; `PHOTO_PROMPT`, `PHOTO_SENT`, `PHOTO_STILL_NEEDED`, `RETURN_TEXT_ONLY` from `./task-telegram-text`.)

Update `task-telegram.handler.replies.spec.ts`: construct `new TaskTelegramReplies(prisma, tasks, files)` with `files = { upload: jest.fn() }` declared next to `tasks`. Replace the two tests that relied on `TEXT_ONLY`:
  - `'a photo, file, voice or caption reply: text only for now, nothing stored'` → delete it (covered by the new spec file below);
  - `'a reply to a message of any other purpose (PHOTO_PROMPT, phase 3) is never a comment'` → rename to `'a text reply to the photo prompt asks for the photo again; nothing stored'`, expect `ctx.reply` with `PHOTO_PROMPT`, `addComment` / `review` / `files.upload` not called, `next` not called, and no warn assertion.
  - fix the imports (`TEXT_ONLY` gone, `PHOTO_PROMPT` added).
The file must stay ≤ 499 lines.

`task-telegram-replies.files.spec.ts` (new): copy the fixtures from the replies spec (`TASK`, `actorOf`, `view`, `as`, `mute`, `jest.mock('./task-telegram-view', …)`), add `jest.mock('../../telegram/utils/download.util', () => ({ downloadFile: jest.fn() }))`, and build `ctx` as `{ chat: { id: 700, type: 'private' }, message: msg, reply: jest.fn().mockResolvedValue({ message_id: 12 }), telegram: { getFileLink: jest.fn().mockResolvedValue({ href: 'https://api.telegram.org/file/botTOKEN/x' }) } }`. `downloadFile` resolves `Buffer.from('img')`; `files.upload` resolves `{ file: { kind: 'IMAGE' } }`; `tasks` has `loadActor`, `loadForAccess`, `addComment`, `changeStatus`, `review`. Tests:
  1. A photo replying to a `NOTICE`: `getFileLink('L')` (the largest), `files.upload(TASK, { buffer, name: 'rasm.jpg', durationSec: undefined }, objectContaining({ via: 'TELEGRAM' }))`, reply `ADDED_TO_TASK`, `changeStatus` not called, `next` not called.
  2. A voice: `files.upload` gets `durationSec: 42` and `name: 'ovozli-xabar.ogg'`.
  3. A caption becomes a comment after the file: `addComment(TASK, 'Mana chek', …)` is called after `files.upload` (check `invocationCallOrder`).
  4. A photo replying to the `PHOTO_PROMPT`: upload, then `changeStatus(TASK, 'IN_REVIEW', …)`, reply `PHOTO_SENT`. If `changeStatus` rejects with `new BadRequestException('Holat allaqachon shunday')`, the reply is `"Topshiriqqa qo'shildi. Holat allaqachon shunday"`. If the stored file is a `DOCUMENT`, the reply is `PHOTO_STILL_NEEDED` and there is no `changeStatus`.
  5. A file replying to a `RETURN_PROMPT`: reply `RETURN_TEXT_ONLY`, nothing downloaded or stored.
  6. Refused early: a document with `file_size` 21 MB → reply `FILE_SIZE_MESSAGE`; a sticker → `UNSUPPORTED_MEDIA`. In both cases `getFileLink`, `staffOfChat` and `files.upload` are not called.
  7. The service refuses the file (`files.upload` rejects `new BadRequestException(FILE_TYPE_MESSAGE)`) → its message is replied; `ServiceUnavailableException(FILES_OFF_MESSAGE)` → that message.
  8. A download failure (`downloadFile` rejects `new Error('File download failed: HTTP 404')`) → `TRY_LATER` is replied, and the error log line does not contain `botTOKEN` (spy on `Logger.prototype.error`).

- [ ] **Step 6: Module.** `TaskTelegramReplies` now needs `TaskFilesService`; both are already in `TasksModule`, so no change. Run the DI spec.

- [ ] **Step 7: Run and gate**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server
npx jest src/tasks/telegram src/tasks/tasks.module.di.spec.ts
npx prettier --write src/tasks/telegram/*.ts
npx eslint src/tasks/telegram --quiet
npm run typecheck
wc -l src/tasks/telegram/*.ts
```

Expected: all green; no file over 500 lines (the two existing big specs are not longer than before).

- [ ] **Step 8: Commit**

```bash
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add server/src/tasks/telegram
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup commit -m "feat(tasks-telegram): photo, file and voice replies; «Bajardim» asks for the photo" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Client — types, file rules, the files store

**Files:**
- Modify: `client/src/hooks/use-tasks.ts`
- Create: `client/src/components/tasks/task-file-rules.ts` (+ `task-file-rules.test.ts`)
- Create: `client/src/components/tasks/use-task-files.ts`

**Interfaces:**
- Consumes: the server routes of Task 5 and the response shapes of Task 4.
- Produces:
  - `use-tasks.ts`: `export type TaskFileKind = "IMAGE" | "DOCUMENT" | "VOICE"`, `export interface TaskFileView { id: string; name: string; size: number; mime: string; kind: TaskFileKind; durationSec: number | null; via: "WEB" | "TELEGRAM" | "SYSTEM"; createdAt: string; uploadedBy: TaskPerson | null; canDelete: boolean; url: string; downloadUrl: string }`. `TaskEvent` gains `fileId?: string | null`; `TaskCard` gains `filesCount?: number` (optional: an older server answers without it).
  - `task-file-rules.ts`: `MAX_FILE_BYTES`, `VOICE_LIMIT_SEC = 180`, `FILE_URL_REFRESH_MS = 8 * 60_000`, `FILE_ACCEPT`, `PHOTO_ACCEPT`, `FILE_TOO_BIG`, `formatSize(bytes)`, `formatDuration(sec)`, `fileOfEvent(files, ev)`, `photoFirst(task, target, hasFreshPhoto)`, `pickVoiceMime(isSupported)`, `voiceFileName(mime)`, `VoiceState`, `VoiceAction`, `voiceReducer`.
  - `use-task-files.ts`: `useTaskFiles` (zustand) — `{ enabled: boolean | null; taskId: string | null; files: TaskFileView[]; hasFreshPhoto: boolean; uploading: number; loadConfig(); load(taskId); upload(taskId, file: Blob, name: string, durationSec?: number): Promise<boolean>; remove(taskId, fileId): Promise<boolean> }`.

- [ ] **Step 1: Types** in `use-tasks.ts`, as listed above. Put `TaskFileKind` / `TaskFileView` next to `TaskStep`, add `fileId?: string | null;` at the end of `TaskEvent`, and add `filesCount?: number;` after `eventsCount: number;` in `TaskCard`.

- [ ] **Step 2: Failing test** — `client/src/components/tasks/task-file-rules.test.ts`

```ts
import { describe, expect, it } from "vitest";
import type { TaskEvent, TaskFileView } from "@/hooks/use-tasks";
import {
  VOICE_LIMIT_SEC, fileOfEvent, formatDuration, formatSize, photoFirst, pickVoiceMime, voiceFileName, voiceReducer,
} from "./task-file-rules";

describe("formatSize / formatDuration", () => {
  it("reads like the mockup", () => {
    expect(formatSize(900)).toBe("900 B");
    expect(formatSize(1536)).toBe("1,5 KB");
    expect(formatSize(1258291)).toBe("1,2 MB");
    expect(formatSize(20 * 1024 * 1024)).toBe("20 MB");
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(180)).toBe("3:00");
  });
});

describe("fileOfEvent", () => {
  const f = { id: "F1" } as TaskFileView;
  it("finds the event's live file, nothing for a deleted or a plain one", () => {
    expect(fileOfEvent([f], { fileId: "F1" } as TaskEvent)).toBe(f);
    expect(fileOfEvent([f], { fileId: "F2" } as TaskEvent)).toBeUndefined();
    expect(fileOfEvent([f], { fileId: null } as TaskEvent)).toBeUndefined();
  });
});

describe("photoFirst", () => {
  it("only a photo task heading to review without a fresh photo", () => {
    expect(photoFirst({ requiresPhoto: true }, "IN_REVIEW", false)).toBe(true);
    expect(photoFirst({ requiresPhoto: true }, "IN_REVIEW", true)).toBe(false);
    expect(photoFirst({ requiresPhoto: true }, "DONE", false)).toBe(false);
    expect(photoFirst({ requiresPhoto: false }, "IN_REVIEW", false)).toBe(false);
  });
});

describe("the voice recorder", () => {
  it("prefers webm, then ogg, else none", () => {
    expect(pickVoiceMime(() => true)).toBe("audio/webm;codecs=opus");
    expect(pickVoiceMime((t) => t.startsWith("audio/ogg"))).toBe("audio/ogg;codecs=opus");
    expect(pickVoiceMime(() => false)).toBeNull();
    expect(voiceFileName("audio/webm;codecs=opus")).toBe("ovozli-xabar.webm");
    expect(voiceFileName("audio/ogg;codecs=opus")).toBe("ovozli-xabar.ogg");
  });
  it("idle → recording → ready → idle; the length is whole seconds, at least 1, at most the limit", () => {
    const blob = new Blob(["x"]);
    const rec = voiceReducer({ kind: "idle" }, { type: "start", at: 1_000 });
    expect(rec).toEqual({ kind: "recording", startedAt: 1_000 });
    expect(voiceReducer(rec, { type: "stop", at: 66_400, blob, url: "blob:1" })).toEqual({ kind: "ready", blob, url: "blob:1", durationSec: 65 });
    expect(voiceReducer(rec, { type: "stop", at: 1_100, blob, url: "blob:1" })).toMatchObject({ durationSec: 1 });
    expect(voiceReducer(rec, { type: "stop", at: 999_000, blob, url: "blob:1" })).toMatchObject({ durationSec: VOICE_LIMIT_SEC });
    expect(voiceReducer({ kind: "ready", blob, url: "blob:1", durationSec: 3 }, { type: "reset" })).toEqual({ kind: "idle" });
  });
  it("ignores a stop that is not ending a recording, and a start while recording", () => {
    const blob = new Blob(["x"]);
    expect(voiceReducer({ kind: "idle" }, { type: "stop", at: 5, blob, url: "u" })).toEqual({ kind: "idle" });
    const rec = { kind: "recording" as const, startedAt: 1 };
    expect(voiceReducer(rec, { type: "start", at: 9 })).toBe(rec);
  });
});
```

Run: `cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/client && npx vitest run src/components/tasks/task-file-rules.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** — `client/src/components/tasks/task-file-rules.ts`

```ts
import type { TaskEvent, TaskFileView } from "@/hooks/use-tasks";

/** The server's limits (task-file-rules.ts, ADR-0086), checked here first to save a 20 MB round trip. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const VOICE_LIMIT_SEC = 180;
/** Links live 10 minutes; the open drawer re-reads the list sooner. */
export const FILE_URL_REFRESH_MS = 8 * 60_000;
export const FILE_ACCEPT = "image/jpeg,image/png,image/webp,application/pdf,.docx,.xlsx,video/mp4,audio/ogg,audio/webm";
export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";
export const FILE_TOO_BIG = "Fayl hajmi 20 MB dan oshmasligi kerak";

const one = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ","));
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${one(Math.round((bytes / 1024) * 10) / 10)} KB`;
  return `${one(Math.round((bytes / 1024 / 1024) * 10) / 10)} MB`;
}

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** The live file a FILE / VOICE row points at; undefined once deleted (or not loaded yet). */
export function fileOfEvent(files: TaskFileView[], ev: Pick<TaskEvent, "fileId">): TaskFileView | undefined {
  return ev.fileId ? files.find((f) => f.id === ev.fileId) : undefined;
}

/** «Rasm qo'shib, tekshiruvga yuborish» instead of «Bajardim» (spec screen 8, server `changeStatusTx`). */
export function photoFirst(task: { requiresPhoto: boolean }, target: "DONE" | "IN_REVIEW", hasFreshPhoto: boolean): boolean {
  return task.requiresPhoto && target === "IN_REVIEW" && !hasFreshPhoto;
}

const VOICE_MIMES = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus"];
/** null = this browser cannot record a type the server takes (the mic button is hidden). */
export function pickVoiceMime(isSupported: (type: string) => boolean): string | null {
  return VOICE_MIMES.find((t) => isSupported(t)) ?? null;
}
export const voiceFileName = (mime: string) => (mime.startsWith("audio/ogg") ? "ovozli-xabar.ogg" : "ovozli-xabar.webm");

export type VoiceState =
  | { kind: "idle" }
  | { kind: "recording"; startedAt: number }
  | { kind: "ready"; blob: Blob; url: string; durationSec: number };
export type VoiceAction =
  | { type: "start"; at: number }
  | { type: "stop"; at: number; blob: Blob; url: string }
  | { type: "reset" };

/** Spec screen 15: oddiy → yozilmoqda → yuborishga tayyor. */
export function voiceReducer(s: VoiceState, a: VoiceAction): VoiceState {
  switch (a.type) {
    case "start":
      return s.kind === "recording" ? s : { kind: "recording", startedAt: a.at };
    case "stop": {
      if (s.kind !== "recording") return s;
      const durationSec = Math.min(VOICE_LIMIT_SEC, Math.max(1, Math.round((a.at - s.startedAt) / 1000)));
      return { kind: "ready", blob: a.blob, url: a.url, durationSec };
    }
    case "reset":
      return { kind: "idle" };
  }
}
```

(`formatSize(20 * 1024 * 1024)`: `one(20)` gives `"20"`, so the output is `"20 MB"`.)

- [ ] **Step 4: The store** — `client/src/components/tasks/use-task-files.ts`

```ts
import { create } from "zustand";
import axios from "axios";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useTasks, type TaskEvent, type TaskFileView } from "@/hooks/use-tasks";
import { FILE_TOO_BIG, MAX_FILE_BYTES } from "./task-file-rules";

interface TaskFilesState {
  /** `GET /tasks/config` → `filesEnabled`; null until known (every file control stays hidden). */
  enabled: boolean | null;
  /** Whose list `files` is: a list never shows under another task. */
  taskId: string | null;
  files: TaskFileView[];
  hasFreshPhoto: boolean;
  uploading: number;
  loadConfig: () => Promise<void>;
  load: (taskId: string) => Promise<void>;
  upload: (taskId: string, file: Blob, name: string, durationSec?: number) => Promise<boolean>;
  remove: (taskId: string, fileId: string) => Promise<boolean>;
}

// A newer load makes an older answer stale.
let lastLoad = 0;

/**
 * The open task's files (ADR-0086). URLs are presigned for 10 minutes, so the
 * drawer re-reads every 8 (`FILE_URL_REFRESH_MS`) and after every change. The
 * browser never fetches them: <img>, <audio> and links only (no CORS rule).
 */
export const useTaskFiles = create<TaskFilesState>((set, get) => ({
  enabled: null, taskId: null, files: [], hasFreshPhoto: false, uploading: 0,

  loadConfig: async () => {
    if (get().enabled !== null) return;
    try {
      const { data } = await api.get<{ filesEnabled: boolean }>("/tasks/config");
      set({ enabled: data.filesEnabled });
    } catch {
      // Stays null: no file controls; the next drawer asks again.
    }
  },

  load: async (taskId) => {
    const req = ++lastLoad;
    if (get().taskId !== taskId) set({ taskId, files: [], hasFreshPhoto: false });
    try {
      const { data } = await api.get<{ data: TaskFileView[]; hasFreshPhoto: boolean }>(`/tasks/${taskId}/files`);
      if (req !== lastLoad) return;
      set({ taskId, files: data.data, hasFreshPhoto: data.hasFreshPhoto });
    } catch {
      // The drawer keeps what it shows; the task's own load reports a lost task.
    }
  },

  upload: async (taskId, file, name, durationSec) => {
    if (file.size > MAX_FILE_BYTES) { toast.error(FILE_TOO_BIG); return false; }
    const form = new FormData();
    // Text parts first: the server reads them with the file.
    form.append("name", name);
    if (durationSec !== undefined) form.append("durationSec", String(durationSec));
    form.append("file", file, name);
    set((s) => ({ uploading: s.uploading + 1 }));
    try {
      const { data } = await api.post<{ event: TaskEvent }>(`/tasks/${taskId}/files`, form);
      useTasks.getState().appendEvent(taskId, data.event);
      await get().load(taskId);
      return true;
    } catch (error) {
      const tooBig = axios.isAxiosError(error) && error.response?.status === 413;
      toast.error(tooBig ? FILE_TOO_BIG : getErrorMessage(error, "Faylni yuklashda xatolik yuz berdi"));
      return false;
    } finally {
      set((s) => ({ uploading: s.uploading - 1 }));
    }
  },

  remove: async (taskId, fileId) => {
    try {
      const { data } = await api.delete<{ event: TaskEvent }>(`/tasks/${taskId}/files/${fileId}`);
      useTasks.getState().appendEvent(taskId, data.event);
      await get().load(taskId);
      return true;
    } catch (error) {
      toast.error(getErrorMessage(error, "Faylni o'chirishda xatolik yuz berdi"));
      return false;
    }
  },
}));
```

- [ ] **Step 5: Run and gate**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/client
npx vitest run src/components/tasks/task-file-rules.test.ts
npx tsc --noEmit
npx eslint src/hooks/use-tasks.ts src/components/tasks/task-file-rules.ts src/components/tasks/task-file-rules.test.ts src/components/tasks/use-task-files.ts --quiet
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add client/src/hooks/use-tasks.ts client/src/components/tasks/task-file-rules.ts client/src/components/tasks/task-file-rules.test.ts client/src/components/tasks/use-task-files.ts
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup commit -m "feat(tasks-ui): file types, rules and the files store" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Client — the «Fayllar» section, the viewer, attach in the composer, the card count

**Files:**
- Create: `client/src/components/tasks/task-drawer-files.tsx`
- Modify: `client/src/components/tasks/task-drawer.tsx`, `client/src/components/tasks/task-drawer-feed.tsx` (composer only), `client/src/components/tasks/task-card.tsx`

**Interfaces:**
- Consumes: `useTaskFiles`, `formatSize`, `FILE_ACCEPT`, `FILE_URL_REFRESH_MS` (Task 9); `tashkentDayAndTime` (`task-due.ts`); `personName` (`task-feed-text.ts`).
- Produces: `export function TaskDrawerFiles({ taskId }: { taskId: string })` (images as thumbnails + documents as rows; voices are left to the feed; renders nothing when the list is empty or files are off) and `export function TaskFileViewer({ images, index, onIndex, onClose })` (exported for the feed in Task 11).

- [ ] **Step 1: `task-drawer-files.tsx`** — what it must do (spec screen 16), with the non-obvious code:
  - Read `const files = useTaskFiles((s) => (s.taskId === taskId ? s.files : NONE))` (module-level `const NONE: TaskFileView[] = []`), `enabled`, `remove`. Return `null` if `enabled !== true` or there are no `IMAGE` / `DOCUMENT` files.
  - `<section className="space-y-2"><h4 className="text-sm font-semibold">Fayllar</h4>…`
  - Images: a `grid grid-cols-4 gap-2` of `<button type="button" aria-label={f.name}>` wrapping `<img src={f.url} alt={f.name} loading="lazy" className="aspect-square w-full rounded-md object-cover" />`. A click opens the viewer at that index.
  - Documents: one row each: a `FileText` icon (lucide), the name as `<a href={f.url} target="_blank" rel="noreferrer" className="truncate font-medium">` (PDF and mp4 open in the browser), then `{formatSize(f.size)} · {uploader name or "Tizim"} · {dd.MM, HH:mm Tashkent}` in muted text. Next to it, a «Yuklab olish» icon link (`href={f.downloadUrl}`, `aria-label="Yuklab olish"`, `Download` icon) and, when `f.canDelete`, an «O'chirish» icon button that opens an `AlertDialog`: title `{"Faylni o'chirasizmi?"}`, description `{"Muhokamada «faylni o'chirdi» degan yozuv qoladi."}`, «Bekor qilish» / «O'chirish». It calls `remove(taskId, f.id)`.
  - Time: `const when = (iso: string) => { const { day, time } = tashkentDayAndTime(iso); return \`${format(day, "dd.MM")}, ${time}\`; };` (the same as the feed).
  - `TaskFileViewer`: a `Dialog` (`@/components/ui/dialog`) with `DialogTitle` = the image name. The body is `<img src={images[index].url} className="max-h-[70dvh] w-full object-contain" />`. «Oldingi» / «Keyingi» buttons (`ChevronLeft` / `ChevronRight`, disabled at the ends), and `onKeyDown` on the content for `ArrowLeft` / `ArrowRight`. The footer has «Yuklab olish» (`<a href={downloadUrl}>`) and «O'chirish» when `canDelete` (the same confirm). Index state is held by the parent (`useState<number | null>(null)`); the viewer gets `index`, `onIndex`, `onClose`.
  - All Uzbek strings with an apostrophe go in JS strings.

- [ ] **Step 2: Drawer wiring** (`task-drawer.tsx`, `DrawerBody`):

```tsx
  const photoReview = task.requiresPhoto && task.status === "IN_REVIEW";
  // The file list follows the task: on open, after every new feed row (a file
  // from Telegram arrives as one over SSE), and before its links expire.
  useEffect(() => {
    const files = useTaskFiles.getState();
    void files.loadConfig();
    void files.load(task.id);
    const t = window.setInterval(() => void useTaskFiles.getState().load(task.id), FILE_URL_REFRESH_MS);
    return () => window.clearInterval(t);
  }, [task.id, task.eventsCount]);
```

Render `{photoReview && <TaskDrawerFiles taskId={task.id} />}` right after the system-task notice / source card block (before `TaskDrawerProperties`): the reviewer sees the photo on top (spec screen 9). Render `{!photoReview && <TaskDrawerFiles taskId={task.id} />}` between `TaskDrawerSteps` and `TaskDrawerFeed`. Import `useEffect` (already imported), `useTaskFiles`, `FILE_URL_REFRESH_MS`, `TaskDrawerFiles`.

- [ ] **Step 3: Attach in the composer** (`task-drawer-feed.tsx`, `Composer`): when `useTaskFiles((s) => s.enabled) === true`, show a paperclip button (`Paperclip` icon, `aria-label={"Fayl qo'shish"}`, `variant="ghost" size="icon-sm"`) to the left of «Ctrl+Enter — yuborish». It clicks a hidden `<input ref={fileRef} type="file" multiple accept={FILE_ACCEPT} className="hidden" onChange={onPick} />`:

```tsx
  const upload = useTaskFiles((s) => s.upload);
  const uploading = useTaskFiles((s) => s.uploading > 0);
  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = ""; // the same file can be picked again
    for (const f of picked) await upload(taskId, f, f.name);
  };
```

While `uploading`, the paperclip shows `Loader2 animate-spin` and is disabled. (Task 11 puts the mic button next to it.)

- [ ] **Step 4: Card count** (`task-card.tsx`): after the `MessageSquare` span, add `{(task.filesCount ?? 0) > 0 && <span className="inline-flex items-center gap-1"><Paperclip className="size-3" />{task.filesCount}</span>}` (import `Paperclip`).

- [ ] **Step 5: Gate and commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/client
npx tsc --noEmit
npx eslint src/components/tasks/task-drawer-files.tsx src/components/tasks/task-drawer.tsx src/components/tasks/task-drawer-feed.tsx src/components/tasks/task-card.tsx --quiet
npx vitest run src/components/tasks
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add client/src/components/tasks/task-drawer-files.tsx client/src/components/tasks/task-drawer.tsx client/src/components/tasks/task-drawer-feed.tsx client/src/components/tasks/task-card.tsx
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup commit -m "feat(tasks-ui): files section, image viewer, attach button, file count on the card" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Client — voice recorder, player, files in the feed

**Files:**
- Create: `client/src/components/tasks/task-voice-recorder.tsx`, `client/src/components/tasks/task-voice-player.tsx`
- Modify: `client/src/components/tasks/task-drawer-feed.tsx`, `client/src/components/tasks/task-feed-text.ts`, `client/src/components/tasks/task-feed-text.test.ts`

**Interfaces:**
- Consumes: `voiceReducer`, `pickVoiceMime`, `voiceFileName`, `VOICE_LIMIT_SEC`, `formatDuration`, `formatSize`, `fileOfEvent` (Task 9); `useTaskFiles`; `TaskFileViewer` (Task 10).
- Produces: `TaskVoiceRecorder({ taskId })`, `TaskVoicePlayer({ src, durationSec })`; `describeEvent` handles `FILE`, `VOICE` and `FILE_DELETED`.

- [ ] **Step 1: Feed text, test first.** Add to `task-feed-text.test.ts`:

```ts
  it("reads a file, a voice message and a deleted file", () => {
    expect(line({ type: "FILE", text: "chek.jpg" })).toBe("Aziz Karimov chek.jpg");
    expect(line({ type: "VOICE", text: "ovozli-xabar.webm" })).toBe("Aziz Karimov ovozli xabar");
    expect(line({ type: "FILE_DELETED", text: "chek.jpg" })).toBe("Aziz Karimov faylni o'chirdi: «chek.jpg»");
    expect(line({ type: "FILE_DELETED" })).toBe("Aziz Karimov faylni o'chirdi");
  });
```

In `describeEvent` add, before `default`:

```ts
    case "FILE": return { actor, text: ev.text ?? "fayl" };
    case "VOICE": return { actor, text: "ovozli xabar" };
    case "FILE_DELETED": return { actor, text: ev.text ? `faylni o'chirdi: «${ev.text}»` : "faylni o'chirdi" };
```

- [ ] **Step 2: Player** — `task-voice-player.tsx`

```tsx
"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatDuration } from "./task-file-rules";

/** Spec screen 15: the browser's player, the stored length (Chrome's webm has none), 1x / 1,5x. */
export function TaskVoicePlayer({ src, durationSec }: { src: string; durationSec: number | null }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [fast, setFast] = useState(false);
  const toggle = () => {
    const next = !fast;
    setFast(next);
    if (ref.current) ref.current.playbackRate = next ? 1.5 : 1;
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <audio ref={ref} src={src} controls preload="metadata" className="h-9 max-w-full" />
      {durationSec !== null && <span className="text-xs text-muted-foreground">{formatDuration(durationSec)}</span>}
      <Button type="button" size="xs" variant="outline" onClick={toggle} aria-label="Tezlik">{fast ? "1,5x" : "1x"}</Button>
    </div>
  );
}
```

- [ ] **Step 3: Recorder** — `task-voice-recorder.tsx`

```tsx
"use client";
import { useEffect, useReducer, useRef, useState, useSyncExternalStore } from "react";
import { Loader2, Mic, Send, Square, X } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { VOICE_LIMIT_SEC, formatDuration, pickVoiceMime, voiceFileName, voiceReducer } from "./task-file-rules";
import { useTaskFiles } from "./use-task-files";

const noop = () => () => {};
// The browser's answer, read without an effect; on the server there is no recorder.
const useVoiceMime = () =>
  useSyncExternalStore(
    noop,
    () => (typeof MediaRecorder === "undefined" ? null : pickVoiceMime((t) => MediaRecorder.isTypeSupported(t))),
    () => null,
  );

/** Spec screen 15: oddiy → yozilmoqda (stops itself at 3:00) → yuborishga tayyor. */
export function TaskVoiceRecorder({ taskId }: { taskId: string }) {
  const mime = useVoiceMime();
  const upload = useTaskFiles((s) => s.upload);
  const [state, dispatch] = useReducer(voiceReducer, { kind: "idle" });
  const [now, setNow] = useState(0);
  const [sending, setSending] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);

  // Leaving the drawer mid-recording frees the microphone.
  useEffect(() => () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    if (recRef.current?.state === "recording") recRef.current.stop();
  }, []);

  if (!mime) return null;

  const start = async () => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.error("Mikrofonga ruxsat berilmadi");
      return;
    }
    const rec = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 48_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      timerRef.current = null;
      const blob = new Blob(chunks, { type: mime.split(";")[0] });
      dispatch({ type: "stop", at: Date.now(), blob, url: URL.createObjectURL(blob) });
    };
    recRef.current = rec;
    rec.start();
    const at = Date.now();
    dispatch({ type: "start", at });
    setNow(at);
    timerRef.current = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t - at >= VOICE_LIMIT_SEC * 1000 && recRef.current?.state === "recording") recRef.current.stop();
    }, 250);
  };
  const discard = () => {
    if (state.kind === "ready") URL.revokeObjectURL(state.url);
    dispatch({ type: "reset" });
  };
  const send = async () => {
    if (state.kind !== "ready") return;
    setSending(true);
    const ok = await upload(taskId, state.blob, voiceFileName(mime), state.durationSec);
    setSending(false);
    if (ok) discard();
  };

  if (state.kind === "recording") {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="size-2 animate-pulse rounded-full bg-red-500" />
        <span>{formatDuration((now - state.startedAt) / 1000)} / {formatDuration(VOICE_LIMIT_SEC)}</span>
        <Button type="button" size="xs" variant="outline" onClick={() => recRef.current?.stop()}><Square className="size-3" />{"To'xtatish"}</Button>
      </div>
    );
  }
  if (state.kind === "ready") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <audio src={state.url} controls className="h-8 max-w-[14rem]" />
        <Button type="button" size="icon-xs" variant="ghost" aria-label={"Bekor qilish"} onClick={discard} disabled={sending}><X /></Button>
        <Button type="button" size="xs" onClick={() => void send()} disabled={sending}>
          {sending ? <Loader2 className="animate-spin" /> : <Send />}Yuborish
        </Button>
      </div>
    );
  }
  return (
    <Button type="button" size="icon-sm" variant="ghost" aria-label="Ovozli xabar yozish" onClick={() => void start()}>
      <Mic className="size-4" />
    </Button>
  );
}
```

(`setNow` is called from the interval callback and from `start`, never synchronously in an effect body. The cleanup only touches refs.)

- [ ] **Step 4: Feed** (`task-drawer-feed.tsx`):
  - read `const files = useTaskFiles((s) => (s.taskId === taskId ? s.files : NONE))` in `TaskDrawerFeed` and pass `files` to a new `Attachment` row;
  - the list: `ev.type === "COMMENT" ? <Comment …/> : ev.type === "FILE" || ev.type === "VOICE" ? <Attachment key={ev.id} ev={ev} file={fileOfEvent(files, ev)} onImage={…} /> : <Line …/>`;
  - `Attachment` uses the same header as `Comment` (avatar, name, via, time). Its body depends on the file:
    - `IMAGE` → a thumbnail button (`<img src={file.url} className="max-h-48 rounded-lg" />`) that opens `TaskFileViewer` over the feed's images (`files.filter((f) => f.kind === "IMAGE")`, index state in `TaskDrawerFeed`);
    - `DOCUMENT` → a chip `<a href={file.url} target="_blank" rel="noreferrer">` with `FileText`, the name and `formatSize`;
    - `VOICE` → `<TaskVoicePlayer src={file.url} durationSec={file.durationSec} />`;
    - no live file (deleted or not loaded yet) → the muted bubble `{ev.text ?? "fayl"} {"(o'chirilgan)"}` for a FILE row, and `{"Ovozli xabar (o'chirilgan)"}` for a VOICE row;
  - the composer row: put `<TaskVoiceRecorder taskId={taskId} />` next to the paperclip (only when `enabled === true`).

- [ ] **Step 5: Gate and commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/client
npx tsc --noEmit
npx eslint src/components/tasks/task-voice-recorder.tsx src/components/tasks/task-voice-player.tsx src/components/tasks/task-drawer-feed.tsx src/components/tasks/task-feed-text.ts src/components/tasks/task-feed-text.test.ts --quiet
npx vitest run src/components/tasks
wc -l src/components/tasks/task-drawer-feed.tsx
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add client/src/components/tasks/task-voice-recorder.tsx client/src/components/tasks/task-voice-player.tsx client/src/components/tasks/task-drawer-feed.tsx client/src/components/tasks/task-feed-text.ts client/src/components/tasks/task-feed-text.test.ts
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup commit -m "feat(tasks-ui): voice messages and files in the discussion" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: the feed file stays under 300 lines. If it does not, move `Attachment` into `task-feed-attachment.tsx`.

---

### Task 12: Client — the photo dialog, the footer, «Rasm bilan tasdiqlansin»

**Files:**
- Create: `client/src/components/tasks/task-photo-dialog.tsx`
- Modify: `client/src/components/tasks/task-drawer-footer.tsx`, `client/src/components/tasks/task-create-dialog.tsx`

**Interfaces:**
- Consumes: `photoFirst`, `PHOTO_ACCEPT` (Task 9); `useTaskFiles` (`hasFreshPhoto`, `files`, `upload`, `enabled`).
- Produces: `TaskPhotoDialog({ task, open, onOpenChange, onSend }: { task: TaskDetail; open: boolean; onOpenChange: (o: boolean) => void; onSend: () => void })`.

- [ ] **Step 1: The dialog** (spec screen 18) — `task-photo-dialog.tsx`:
  - `Dialog` with title «Rasm bilan yuborish» and description `{"Bajarilgan ishning rasmini qo'shing. Rasm qo'shilmaguncha topshiriq tekshiruvga yuborilmaydi."}`.
  - A «Rasm tanlash» button opening a hidden `<input type="file" accept={PHOTO_ACCEPT} multiple>`. On a phone the browser offers camera and gallery itself, so no `capture` attribute (spec: «kamera / galereya»). Each picked file goes through `upload(task.id, f, f.name)`.
  - Thumbnails of the images added since the last return. Filter with `const since = Date.parse(task.lastReturnedAt ?? task.createdAt)` and `files.filter((f) => f.kind === "IMAGE" && Date.parse(f.createdAt) > since)`. This is the same rule as the server; the button below trusts `hasFreshPhoto`, not this filter.
  - Footer: «Bekor qilish» and «Tekshiruvga yuborish», which is `disabled={!hasFreshPhoto || uploading}` and calls `onSend()` and then closes.

- [ ] **Step 2: The footer** (`task-drawer-footer.tsx`):

```tsx
  const hasFreshPhoto = useTaskFiles((s) => (s.taskId === task.id ? s.hasFreshPhoto : false));
  const filesOn = useTaskFiles((s) => s.enabled === true);
  const [photoOpen, setPhotoOpen] = useState(false);
  const needPhoto = finish !== undefined && filesOn && photoFirst(task, finish, hasFreshPhoto);
```

Where the «Bajardim» button is drawn: if `needPhoto`, draw `<Button disabled={busy} onClick={() => setPhotoOpen(true)}><Camera className="mr-1 size-4" />{"Rasm qo'shib, tekshiruvga yuborish"}</Button>`; otherwise draw today's button. Mount `<TaskPhotoDialog task={task} open={photoOpen} onOpenChange={setPhotoOpen} onSend={() => move("IN_REVIEW")} />`. `move` keeps the unchecked-steps question. With files off, the plain «Bajardim» stays and the server's 400 «Tekshiruvga yuborish uchun rasm qo'shing» explains itself. `footerActions` and its tests are untouched.

- [ ] **Step 3: Create dialog** (`task-create-dialog.tsx`):
  - state `const [requiresPhoto, setRequiresPhoto] = useState(false);`; add `setRequiresPhoto(false)` to `reset`;
  - `const filesOn = useTaskFiles((s) => s.enabled === true);`. When the dialog opens, ask for the config: in `TaskCreateDialog`, `useEffect(() => { if (isOpen) void useTaskFiles.getState().loadConfig(); }, [isOpen]);`;
  - in «Batafsil», after «Kuzatuvchi» and before «Takrorlash», when `filesOn && !recurring`:

```tsx
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={requiresPhoto} onCheckedChange={(v) => setRequiresPhoto(v === true)} className="mt-0.5" />
                <span>
                  Rasm bilan tasdiqlansin
                  <span className="block text-xs text-muted-foreground">{"Ijrochi tekshiruvga yuborishdan oldin ish rasmini qo'shadi"}</span>
                </span>
              </label>
```

  - payload: `requiresPhoto: requiresPhoto && !recurring ? true : undefined,`.

- [ ] **Step 4: Gate and commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/client
npx tsc --noEmit
npx eslint src/components/tasks/task-photo-dialog.tsx src/components/tasks/task-drawer-footer.tsx src/components/tasks/task-create-dialog.tsx --quiet
npx vitest run src/components/tasks
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add client/src/components/tasks/task-photo-dialog.tsx client/src/components/tasks/task-drawer-footer.tsx client/src/components/tasks/task-create-dialog.tsx
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup commit -m "feat(tasks-ui): photo confirmation — create option, footer and send dialog" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: ADR-0086, server and client notes, guide and news

**Files:**
- Create: `docs/adr/0086-topshiriq-fayllari.md`
- Modify: `docs/adr/README.md`, `server/CLAUDE.md` («Tasks (`src/tasks/`)» section + «Environment Variables»), `client/CLAUDE.md` («Tasks» section), `client/src/qollanma/kontent/boshlash/topshiriqlar.mdx`, `client/src/qollanma/sahifalar/boshlash.ts`, `client/src/qollanma/yangiliklar.ts`

**Interfaces:** none (docs).

- [ ] **Step 1: Recheck the ADR number**

```bash
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup fetch origin main
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup show origin/main:docs/adr/README.md | grep -o '^| \[0[0-9]*\]' | tail -2
```

If 0086 is taken, use the next free number everywhere below (and in the migration comment of Task 1).

- [ ] **Step 2: `docs/adr/0086-topshiriq-fayllari.md`** (Uzbek, the layout of ADR-0084)

```markdown
# ADR-0086 — Topshiriq fayllari: yopiq bucket, yuklash server orqali, rasm bilan tasdiqlash

**Holati:** Qabul qilindi
**Sana:** 2026-10-11
**Bog'liq:** ADR-0074 (topshiriq alohida bo'lim), ADR-0078 (Telegram), dizayn `docs/superpowers/specs/2026-10-07-topshiriqlar-design.md` §3.2, §3.5, §6.2, §9.4, §9.6; `server/src/tasks/task-file-rules.ts`, `task-files.service.ts`; migratsiya `20261011200000_task_files`

## Kontekst

Spec fayllarni yopiq R2 bucket'da saqlashni va brauzer ularni to'g'ridan-to'g'ri (presigned PUT) yuklashini belgilagan. Brauzerdan to'g'ridan-to'g'ri yuklash uchun bucket'da CORS qoidasi kerak — bizdagi kalit uni o'rnata olmaydi, CEO Cloudflare panelida qo'lda qo'yishi kerak bo'lardi. Bundan tashqari, presign → yuklash → tasdiqlash uch qadamli yo'li, tasdiqlanmagan qatorlar va ularni 1 soatda tozalash, fayl turini yuklangandan keyin alohida o'qish kerak bo'lardi. Telegram'dan kelgan fayl esa baribir server orqali o'tadi.

## Qaror

1. Fayllar yopiq `R2_TASKS_BUCKET_NAME` (`daf-tasks`) bucket'da. Hech biri ochiq emas: fayl faqat 10 daqiqalik havola bilan ochiladi, havola har so'rovda topshiriqni ko'ra olish tekshiruvidan keyin beriladi.
2. Yuklash server orqali (`POST /tasks/:id/files`, 20 MB gacha) — spec §9.4 dan farqli. Server faylning turini nomidan emas, ichidagi baytlardan aniqlaydi (JPG, PNG, WebP, PDF, DOCX, XLSX, MP4, ogg/webm ovoz); boshqa tur bucket'ga yetib bormaydi. Sayt va Telegram bitta yo'ldan yuklaydi. Brauzer R2 havolalarini faqat rasm, pleyer va havola sifatida ochadi, shuning uchun CORS qoidasi kerak emas.
3. Fayl muhokamada bitta qator (`FILE` / `VOICE`), xabari izohnikidek: qo'ng'iroqchada «Yangi fayl» / «Ovozli xabar», Telegram'da beruvchi va ijrochilarga. O'chirish — faylni qo'shgan odam yoki beruvchi (CEO, filial direktori); yumshoq, muhokamada «faylni o'chirdi» qatori qoladi, fayl 30 kundan keyin 03:00 da bucket'dan o'chadi.
4. Ovozli xabar 3 daqiqagacha va 2 MB gacha (saytda yozish 48 kbit/s). Bu yerda hajm asosiy cheklov, chunki brauzer aytgan uzunlikka ishonib bo'lmaydi.
5. «Rasm bilan tasdiqlansin» topshiriq berishda qo'yiladi (keyin o'zgartirilmaydi; takrorlanuvchi topshiriqda yo'q). Bunday topshiriq tekshiruvga faqat oxirgi qaytarishdan (yoki berilgandan) keyin kamida bitta rasm qo'shilgan bo'lsa o'tadi; o'ziga yozilgan topshiriq rasmsiz yopiladi.
6. Telegram'da topshiriq xabariga javob qilib yuborilgan rasm, hujjat, video va ovoz topshiriqqa qo'shiladi (izoh — izoh bo'lib). Rasm bilan tasdiqlanadigan topshiriqda «Bajardim» bot «Rasmni shu xabarga javob qilib yuboring» deydi; rasm kelgach topshiriq tekshiruvga o'tadi.
7. `R2_TASKS_BUCKET_NAME` bo'lmasa fayl funksiyalari o'chiq: tugmalar ko'rinmaydi, server 503 qaytaradi.

## Ko'rib chiqilgan muqobillar

- Presigned PUT (spec): CORS uchun CEO'ning qo'lda qadami, uch qadamli yuklash, tasdiqlanmagan qatorlarni tozalash va turni keyin tekshirish kerak bo'lardi. Serverdan o'tishning narxi — har yuklashda bir so'rov davomida 20 MB gacha xotira — bizning hajmda sezilmaydi.
- `TaskFile.eventId` (spec): hodisa faylga ishora qiladi (`TaskEvent.fileId`), bitta yo'nalish yetadi.

## Oqibatlari

- Kartada fayl soni, varaqda «Fayllar» bo'limi (rasmlar katta ko'rinishda, hujjatlar qator bo'lib), muhokamada rasm, hujjat va ovoz pleyeri (1x / 1,5x).
- Server xotirasi va trafigi fayl hajmicha oshadi; ko'paysa — presigned PUT ga qaytish shu ADR'ni almashtiradi.
- Saqlanmay qolgan (qatori yozilmagan va o'chirib bo'lmagan) obyekt jurnalga yoziladi, avtomatik tozalanmaydi.
```

Add the row to `docs/adr/README.md` after 0085:

```markdown
| [0086](0086-topshiriq-fayllari.md) | Topshiriq fayllari yopiq bucket'da, 10 daqiqalik havola; yuklash server orqali (tur baytlardan), CORS'siz; ovoz 3 daqiqa; «Rasm bilan tasdiqlansin» — tekshiruvga faqat yangi rasm bilan; Telegram javobidagi fayl va rasm | Qabul qilindi | 2026-10-11 |
```

- [ ] **Step 3: `server/CLAUDE.md`**, «Tasks (`src/tasks/`)»:
  - «One door» bullet: add `task-files.service.ts` to the writer list and `TaskFile` to the table list in the section's first paragraph.
  - «Transitions» bullet: replace `A task with \`requiresPhoto\` cannot go to review yet (no upload before phase 3).` with `A task with \`requiresPhoto\` goes to review only with an IMAGE added after its last return or its creation (\`hasFreshPhoto\` in \`changeStatusTx\`; 400 «Tekshiruvga yuborish uchun rasm qo'shing»); a self-task closes without one.`
  - «Message» bullet: replace `«Bajardim» (never on a \`requiresPhoto\` task until phase 3)` with `«Bajardim» (on a \`requiresPhoto\` task without a fresh photo the press sends the «Rasmni shu xabarga javob qilib yuboring» force-reply prompt, recorded as \`PHOTO_PROMPT\`)`, and `purpose \`NOTICE\` | \`RETURN_PROMPT\`` with `purpose \`NOTICE\` | \`RETURN_PROMPT\` | \`PHOTO_PROMPT\``.
  - «Replies» bullet: replace the sentence about photos with: `A photo (largest size), document, video or voice replying to a NOTICE or PHOTO_PROMPT is downloaded (\`getFileLink\` + \`downloadFile\`; over 20 MB or a voice over 180 s refused before downloading, stickers/audio/round videos refused) and stored through \`TaskFilesService.upload\` (via TELEGRAM); a caption becomes a comment; an IMAGE answering PHOTO_PROMPT then sends the task to review. A text reply to PHOTO_PROMPT repeats the prompt; a file replying to RETURN_PROMPT is refused. The reply side lives in \`task-telegram-replies.ts\` (\`TaskTelegramReplies\`), identity in \`task-telegram-actor.ts\`.`
  - add a bullet after «Recurring tasks»:

```markdown
- **Files** (ADR-0086; spec §3.5, §9.4). `TaskFile` rows (`key`, `name`, `size`, `mime`, `kind` IMAGE/DOCUMENT/VOICE, `durationSec`, `uploadedById`, `via`, `deletedAt`, `deletedById`, `purgedAt`) in the PRIVATE bucket `R2_TASKS_BUCKET_NAME` (`TaskFileStorage`; absent → `GET /tasks/config` `filesEnabled: false`, upload/delete 503). Upload goes THROUGH the server (`POST /tasks/:id/files`, multipart `file` + `name` + `durationSec`, multer 20 MB) — not a presigned PUT, so no CORS rule: the type is sniffed from the bytes (`task-file-rules.ts`: jpg/png/webp/pdf/docx/xlsx/mp4, ogg/webm → VOICE ≤ 180 s and ≤ 2 MB), the object is `PutObject`ed, then the row and its `FILE`/`VOICE` event commit together (a failed commit deletes the object). `GET /tasks/:id/files` re-checks access and mints 10-minute presigned GETs (`url` inline, `downloadUrl` attachment) plus `hasFreshPhoto`. Upload/see: anyone who can view the task; delete: the uploader or `canManage` → soft (`deletedAt`, `FILE_DELETED` row «faylni o'chirdi»); 03:00 Tashkent `TaskFilesService.purge` deletes objects 30 days later and stamps `purgedAt` (rows stay). A new file is announced as `task.commented` with `attachment: 'FILE' | 'VOICE'` (bell «Yangi fayl» / «Ovozli xabar», Telegram headline the same). Never log a presigned URL or a Telegram file link.
```

  - «Environment Variables»: add a row/line for `R2_TASKS_BUCKET_NAME` (optional; `daf-tasks`; uses the R2 group's endpoint and keys; rejected when set without them), in the same format as the R2 lines there.

- [ ] **Step 4: `client/CLAUDE.md`** («Tasks»), add:

```markdown
- **Files** (ADR-0086): `use-task-files.ts` (zustand) holds the open task's files from `GET /tasks/:id/files` (10-minute presigned URLs — the drawer reloads every 8 minutes, after each upload/delete and when `eventsCount` changes) and `GET /tasks/config` (`enabled`; null/false hides every file control). Uploads are multipart `POST /tasks/:id/files` (`name` and `durationSec` as text parts, then `file`). The browser NEVER fetches an R2 URL (only `<img>`, `<audio>`, `<a>`): the bucket has no CORS rule. `task-drawer-files.tsx` (thumbnails + viewer, documents with size/uploader/time, download, delete), `task-voice-recorder.tsx` (`MediaRecorder` webm/ogg opus at 48 kbit/s, stops at 3:00; hidden where unsupported), `task-voice-player.tsx` (1x/1,5x, stored length), `task-photo-dialog.tsx` («Rasm qo'shib, tekshiruvga yuborish» when `photoFirst`), «Rasm bilan tasdiqlansin» in «Batafsil» (not with «Takrorlash»). Pure helpers in `task-file-rules.ts` (vitest).
```

- [ ] **Step 5: Guide** — `client/src/qollanma/kontent/boshlash/topshiriqlar.mdx`:
  - in «Topshiriq berish», change the «Batafsil» sentence to: `«Batafsil» tugmasi qo'shimcha maydonlarni ochadi: «Tavsif», «Kichik qadamlar» («Qadam qo'shish»), «Kuzatuvchi» va «Rasm bilan tasdiqlansin». Rasm bilan tasdiqlanadigan topshiriqni ijrochi tekshiruvga faqat ish rasmini qo'shib yuboradi (takrorlanuvchi topshiriqda bu belgi yo'q).`
  - in «Holatlar va tugmalar», add the bullet `- **Rasm bilan tasdiqlash.** Bunday topshiriqda ijrochi «Rasm qo'shib, tekshiruvga yuborish» ni bosadi, rasm tanlaydi (telefonda — kamera yoki galereya) va «Tekshiruvga yuborish» ni bosadi. Topshiriq qaytarilsa, qayta yuborish uchun yangi rasm kerak. Beruvchi varaqni ochganda rasm eng tepada turadi.`
  - after the «Varaq: qadamlar va muhokama» section, add:

```markdown
## Fayllar va ovozli xabar

- Izoh maydonidagi 📎 tugmasi bilan fayl qo'shasiz: rasm (JPG, PNG, WebP), PDF, Word (DOCX), Excel (XLSX) yoki qisqa video (MP4), har biri 20 MB gacha. Fayl muhokamada kim va qachon qo'shgani bilan chiqadi, varaqdagi «Fayllar» bo'limida esa hammasi bir joyda: rasmlar kichik ko'rinishda (bosilsa — katta, chap/o'ng bilan), hujjatlar nomi, hajmi, kim va qachon qo'shgani bilan.
- 🎤 tugmasi ovozli xabar yozadi (3 daqiqagacha): bosing — yozish boshlanadi, «To'xtatish» — tinglab ko'rasiz, «Yuborish» — muhokamaga tushadi. Tinglashda 1x / 1,5x tezlik bor. Eski iPhone brauzerlarida bu tugma ko'rinmaydi.
- Faylni topshiriqni ko'ra oladigan har kim ko'radi va yuklab oladi. O'chirishni faylni qo'shgan odam yoki beruvchi (CEO, filial direktori) qiladi; muhokamada «faylni o'chirdi» yozuvi qoladi.
- Yangi fayl yoki ovozli xabar haqida ishtirokchilarga xabar keladi (qo'shgan odamdan tashqari), xuddi izohdagidek.
```

  - in «Telegram'da»: in «Tugmalar» replace `Rasm bilan tasdiqlanadigan topshiriqda «Bajardim» tugmasi yo'q: rasm yuborish keyinroq qo'shiladi.` with `Rasm bilan tasdiqlanadigan topshiriqda «Bajardim» ni bossangiz, bot «Rasmni shu xabarga javob qilib yuboring» deydi; rasmni o'sha xabarga javob qilib yuborsangiz, topshiriq tekshiruvga o'tadi.`; in «Javob yozish» replace `Rasm, fayl va ovozli xabar hozircha qabul qilinmaydi.` with `Javob qilib yuborilgan rasm, hujjat, video va ovozli xabar (20 MB gacha, ovoz 3 daqiqagacha) topshiriqqa qo'shiladi; rasm ostidagi yozuv izoh bo'ladi.`; and in «Kimga nima keladi» change `Yangi izoh` to `Yangi izoh, fayl yoki ovozli xabar`.
- `client/src/qollanma/sahifalar/boshlash.ts` («topshiriqlar» entry): append to `qisqacha`: ` Topshiriqqa rasm, hujjat va ovozli xabar qo'shasiz (Telegram'dan javob qilib ham); «Rasm bilan tasdiqlansin» belgilangan topshiriq faqat rasm bilan tekshiruvga yuboriladi.`; add `"0086"` to `adr`; add `"fayl"`, `"rasm"`, `"ovozli xabar"`, `"ovoz"`, `"rasm bilan tasdiqlansin"`, `"hujjat"`, `"yuklab olish"` to `kalitSozlar`; set `yangilangan: "2026-10-11"`.

- [ ] **Step 6: News** — at the top of `yangiliklar` in `client/src/qollanma/yangiliklar.ts`:

```ts
  {
    sana: "2026-10-11",
    sarlavha: "Topshiriqlarda fayl, rasm va ovozli xabar",
    matn: "Topshiriq varag'ida endi fayl qo'shish mumkin: izoh maydonidagi 📎 tugmasi bilan rasm, PDF, Word, Excel yoki qisqa video (20 MB gacha), 🎤 tugmasi bilan 3 daqiqagacha ovozli xabar. Fayllar varaqdagi «Fayllar» bo'limida turadi: rasmni katta ko'rish, hujjatni yuklab olish, o'zingiz qo'shganini o'chirish mumkin. Topshiriq berishda «Batafsil» → «Rasm bilan tasdiqlansin» ni belgilasangiz, ijrochi tekshiruvga faqat ish rasmini qo'shib yuboradi. Telegram'da topshiriq xabariga javob qilib rasm, hujjat yoki ovozli xabar yuborsangiz, u topshiriqqa qo'shiladi; rasm talab qilinadigan topshiriqda «Bajardim» bot rasm so'raydi va rasm kelgach topshiriq tekshiruvga o'tadi.",
    rollar: [1, 2, 3, 4, 5],
    sahifa: { bolim: "boshlash", sahifa: "topshiriqlar" },
  },
```

- [ ] **Step 7: Checks and commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/client
npx tsc --noEmit
npx vitest run src/qollanma
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add docs/adr/0086-topshiriq-fayllari.md docs/adr/README.md server/CLAUDE.md client/CLAUDE.md client/src/qollanma/kontent/boshlash/topshiriqlar.mdx client/src/qollanma/sahifalar/boshlash.ts client/src/qollanma/yangiliklar.ts
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup commit -m "docs: ADR-0086 task files, server and client notes, guide and news" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Full verification

**Files:** none new. A fix lands in its own commit naming the failing gate. The throwaway database and the probes live outside git (probes are deleted before any commit).

- [ ] **Step 1: Server gate — sequential, never two at once**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup diff --name-only origin/main -- server | grep '\.ts$'
```

Run `npx prettier --check` on exactly the listed files (paths relative to `server/`). Then, one after another:

```bash
npx eslint src --quiet
npm test
npm run typecheck
npm run build
```

Expected: no prettier diffs, 0 eslint errors, and every suite green. That includes `task-write.single-source.spec.ts` (`taskFile` writes only in `src/tasks/`), `event-wiring.spec.ts` (no new event name), `branch-route-policy.spec.ts`, `permission-routes.spec.ts` (4 new snapshot rows), `tasks.controller.spec.ts` (24 routes) and `tasks.module.di.spec.ts` (`TaskFileStorage`, `TaskFilesService`, `TaskTelegramReplies`). Typecheck and build clean.

- [ ] **Step 2: Client gate (no Prettier)**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/client
npx tsc --noEmit
npm run lint 2>&1 | tail -5
npx vitest run
npx next build
```

Expected: all clean (0 lint errors).

- [ ] **Step 3: Throwaway PostgreSQL — the migration, the FK and the photo rule end to end**

Recipe: `.superpowers/sdd/2026-10-10-topshiriqlar-4a-avtomatika/task-11-report.md` (the same steps the 4b plan's Task 10 used). PostgreSQL binaries are in `/Library/PostgreSQL/18/bin` (not on PATH); TCP only, on 127.0.0.1:5599; the data directory goes under the session scratchpad. `server/.env` is never read for this: every connecting command gets `DATABASE_URL=postgresql://postgres@127.0.0.1:5599/task_files_test` in its own environment.

1. Pre-change DDL, offline: `git show origin/main:server/prisma/schema.prisma > <scratchpad>/pre-schema.prisma`, then `DATABASE_URL=postgresql://u:p@127.0.0.1:1/none npx prisma migrate diff --from-empty --to-schema <scratchpad>/pre-schema.prisma --script --output <scratchpad>/pre-ddl.sql`.
2. `initdb -D <scratchpad>/pgdata -U postgres -A trust -E UTF8`, then `pg_ctl -D <scratchpad>/pgdata -o "-p 5599 -c unix_socket_directories= -c listen_addresses=127.0.0.1" -w start`, `createdb -h 127.0.0.1 -p 5599 -U postgres task_files_test`, `ALTER DATABASE task_files_test SET timezone='UTC'`, and `psql -f pre-ddl.sql`. Then apply the hand-written indexes: `task_open_source_unique` (end of `server/prisma/migrations/20261007120000_tasks_module/migration.sql`) and `TaskOutbox_time_row_key` (grep under `server/prisma/migrations`).
3. `psql -1 -f server/prisma/migrations/20261011200000_task_files/migration.sql` — the real file, unchanged, in one transaction (`ADD VALUE` inside a transaction is allowed as long as the value is not used there). Check with `\d "TaskFile"` (columns, `TaskFile_key_key`, both indexes, `ON DELETE CASCADE` to Task, `SET NULL` to User), `\d "TaskEvent"` (`fileId`, `ON DELETE SET NULL`) and `\dT+ "TaskEventType"` (`FILE_DELETED` listed).
4. Seed with plain `INSERT`s. Read every NOT NULL column without a default from `\d "Company"`, `\d "Branch"`, `\d "User"`, `\d "Role"`, `\d "UserRole"`, `\d "UserBranch"` and fill it. Company 1; Branch 7 (company 1); Roles 1 «CEO», 4 «Teacher»; User 10 (CEO, `status ACTIVE`, `isActive true`); User 40 (Teacher of branch 7, `mainBranch 7`, a `UserBranch` row).
5. Probe `server/scripts/_probe-task-files.ts`. It imports `run`/`dbHost` from `./lib/check-cli`, must print the DB host, and must stop unless the host is `127.0.0.1:5599`. Storage is a stub, so nothing touches R2:

   ```ts
   import { EventEmitter2 } from '@nestjs/event-emitter';
   import { dbHost, run } from './lib/check-cli';
   import { TasksService } from '../src/tasks/tasks.service';
   import { TaskFilesService } from '../src/tasks/task-files.service';

   const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(64)]);
   const stub = { enabled: true, put: async () => undefined, remove: async () => true, signedGet: async () => 'https://stub' };

   void run(async (prisma) => {
     if (dbHost() !== '127.0.0.1:5599') throw new Error(`refusing ${dbHost()}`);
     const db = prisma as never;
     const emitter = new EventEmitter2();
     const tasks = new TasksService(db, emitter, {} as never, {} as never);
     const files = new TaskFilesService(db, emitter, tasks, stub as never);
     const ceo = await tasks.loadActor(10, 1, 7);
     const teacher = await tasks.loadActor(40, 1, null);
     const [t] = await tasks.create({ title: 'Probe', assigneeIds: [40], requiresPhoto: true }, ceo);
     const tryReview = () => tasks.changeStatus(t.id, 'IN_REVIEW', teacher).then(() => 'moved', (e: Error) => e.message);
     console.log('no photo', await tryReview()); // Tekshiruvga yuborish uchun rasm qo'shing
     const { file } = await files.upload(t.id, { buffer: PNG, name: 'chek.png' }, teacher);
     console.log('after photo', await tryReview()); // moved
     await tasks.review(t.id, 'RETURN', 'Aniqroq rasm', ceo);
     console.log('after return', await tryReview()); // the refusal again: the old photo is before the return
     await files.upload(t.id, { buffer: PNG, name: 'chek2.png' }, teacher);
     console.log('new photo', await tryReview()); // moved
     await files.remove(t.id, file.id, teacher);
     console.log('events', JSON.stringify(await prisma.taskEvent.findMany({ where: { taskId: t.id, fileId: { not: null } }, select: { type: true, text: true }, orderBy: { createdAt: 'asc' } })));
     // FILE chek.png, FILE chek2.png, FILE_DELETED chek.png
     console.log('list', (await files.list(t.id, teacher)).data.map((f) => f.name)); // [ 'chek2.png' ]
     console.log('purge now', await files.purge(new Date())); // 0: deleted today
     console.log('purge +31d', await files.purge(new Date(Date.now() + 31 * 864e5))); // 1
     console.log('purged', await prisma.taskFile.count({ where: { taskId: t.id, purgedAt: { not: null } } })); // 1
   });
   ```

   Run from `server/`: `DATABASE_URL=postgresql://postgres@127.0.0.1:5599/task_files_test npx ts-node --transpile-only scripts/_probe-task-files.ts`. Expected, in order: refusal, `moved`, refusal, `moved`, the three event rows, `[ 'chek2.png' ]`, `0`, `1`, `1`. Anything else is a bug: fix it in its own commit (with a unit test that reproduces it), then rerun.
6. `pg_ctl -D <scratchpad>/pgdata stop`, delete the data directory, `rm server/scripts/_probe-task-files.ts`. Confirm `git status` shows nothing new.

- [ ] **Step 4: A REAL R2 smoke against `daf-tasks` (the controller runs it, with the CEO's go)**

No database is used. The probe `server/scripts/_probe-task-files-r2.ts` imports only `TaskFileStorage` and `ConfigService`, and prints statuses and booleans, never a key value, URL or header with a secret:

```ts
import { ConfigService } from '@nestjs/config';
import { TaskFileStorage } from '../src/tasks/task-file-storage';

async function main() {
  const storage = new TaskFileStorage(new ConfigService());
  console.log('enabled', storage.enabled);
  if (!storage.enabled) return;
  const key = `tasks/0/smoke/${Date.now()}.png`;
  const body = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(64)]);
  await storage.put(key, body, 'image/png');
  const view = await fetch(await storage.signedGet(key, 'image/png', 'smoke.png', false));
  const bytes = Buffer.from(await view.arrayBuffer());
  console.log('signed GET', view.status, view.headers.get('content-type'), bytes.equals(body));
  const dl = await fetch(await storage.signedGet(key, 'image/png', "o'quv rasm.png", true));
  console.log('download', dl.status, (dl.headers.get('content-disposition') ?? '').startsWith('attachment;'));
  const bare = await fetch(`${process.env.R2_ENDPOINT}/${process.env.R2_TASKS_BUCKET_NAME}/${key}`);
  console.log('unsigned GET refused', bare.status >= 400); // private bucket
  console.log('removed', await storage.remove(key));
  const after = await fetch(await storage.signedGet(key, 'image/png', 'smoke.png', false));
  console.log('after delete', after.status); // 404
}
void main();
```

Run from `server/`. If `railway run` says no project is linked, the controller first links the worktree to the production `caring-courage` service; the ids come from the deploy notes and never go into the repo.

```bash
R2_TASKS_BUCKET_NAME=daf-tasks railway run --service caring-courage --environment production npx ts-node --transpile-only scripts/_probe-task-files-r2.ts
```

Expected: `enabled true`; `signed GET 200 image/png true`; `download 200 true`; `unsigned GET refused true`; `removed true`; `after delete 404`. Then `rm server/scripts/_probe-task-files-r2.ts` and confirm `git status` is clean. A failure here (for example a checksum-header error on R2) is fixed in `TaskFileStorage` before the PR, with a unit test.

- [ ] **Step 5: Self-check against the spec.** Read the diff once and confirm:
  - no `prisma.task*.create|update|delete` (including `taskFile`) outside `src/tasks/`;
  - events are emitted after commits only;
  - no presigned URL, Telegram link or R2 key is logged;
  - no English word in a new Uzbek string and no `&apos;` in new JSX;
  - no client `fetch`/axios call to an R2 URL;
  - every new file is ≤ 500 lines and `tasks.service.ts` is at 532;
  - `LESSON_QUESTION` / automatic-task code is untouched.

- [ ] **Step 6: Browser check list for the PR description** (after the server deploy; roles CEO, Administrator, Ustoz; on a phone too):
  1. Administrator: «Batafsil» → «Rasm bilan tasdiqlansin», assign a teacher → the card shows «Rasm bilan».
  2. The teacher opens it: the footer says «Rasm qo'shib, tekshiruvga yuborish». The dialog keeps «Tekshiruvga yuborish» disabled until a photo is added (camera on the phone). After sending, the administrator sees the photo at the top of the sheet.
  3. «Qaytarish» → the teacher again needs a new photo.
  4. 📎 a PDF and an XLSX: a row with size, who and when; «Yuklab olish» saves the file under its own name; an `.html` renamed to `.pdf` is refused with the Uzbek message.
  5. 🎤 a 10-second message: the player shows 0:10, 1,5x works; recording stops by itself at 3:00.
  6. Delete by the uploader → «faylni o'chirdi» in the feed; another teacher gets no delete button.
  7. Telegram: reply to a notice with a photo, a PDF and a voice message → «Topshiriqqa qo'shildi.», visible on the site; on a photo task «Bajardim» → the prompt → a photo reply → «Rasm qo'shildi. Topshiriq tekshiruvga yuborildi.»; a sticker → the refusal line.
  8. Without `R2_TASKS_BUCKET_NAME` (local): no 📎, no 🎤, no «Rasm bilan tasdiqlansin».

---

## Deploy order

1. **Env** — `R2_TASKS_BUCKET_NAME=daf-tasks` on Railway `caring-courage` / production. With the CEO's go, the controller runs `railway variables --service caring-courage --environment production --set R2_TASKS_BUCKET_NAME=daf-tasks`. This is done BEFORE the server deploy, so the new build starts with files on. Setting the variable may itself trigger a redeploy of the current build, which is harmless: the old build does not read it. **No CORS step**: the bucket stays exactly as it is (private, public access off).
2. **Migration + server** — the server deploy applies `20261011200000_task_files` (one enum value, one enum, one table, one nullable column; no data step), then the build starts. The 03:00 purge has nothing to do for 30 days.
3. **Vercel** — the file controls, recorder, photo dialog, guide and news. Between the two deploys the old client ignores `filesCount` / `fileId`, and its feed shows FILE / VOICE / FILE_DELETED rows as «yangilanish kiritdi».
4. **Rollback:** the previous server build runs on the new schema (it ignores the table and the column; a `FILE_DELETED` row reads as a generic line). Files stay in the bucket and come back with the new build. A Telegram photo reply on the old build gets the old «Hozircha faqat matnli javob qabul qilinadi.».
