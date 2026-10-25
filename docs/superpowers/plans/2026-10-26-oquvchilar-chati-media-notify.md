# Student chat — media, reports, notifications (Plan B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add to the merged text chat (Plan A, PR #799) images and voice messages, the nightly media purge, student reports with the CEO's review and ban, and notifications: a bell row, web push and an instant Telegram notice with a button that opens the Mini App on the conversation.

**Architecture:** Same module `src/chat/`. Media goes THROUGH the server into a private R2 bucket (the task-files pattern); the type is read from the bytes by reusing `checkTaskFile`. Sending a message is split into `prepareSend` (all checks) and `commitMessage` (write + live push + notify) so text and media share one path. Notifications live in one new service, `ChatNotifyService`, called after commit and never allowed to fail a send. Reports keep a text snapshot of the last 50 messages; the CEO's routes are a separate `@CeoOnly()` controller.

**Tech Stack:** NestJS, Prisma (PostgreSQL), Jest, `@aws-sdk/client-s3` (R2), `@nestjs/schedule`, Telegraf via the existing `SmsService.sendToStudent`.

Spec: `docs/superpowers/specs/2026-10-25-oquvchilar-chati-design.md` (§2 files and purge, §3 reports/notifications). Plan A: `docs/superpowers/plans/2026-10-25-oquvchilar-chati-backend-core.md` (merged).

**Out of this plan (Plan C — clients):** web portal, Telegram Mini App page (including the whitelist that lets `/tg?next=/portal/chat/<id>` open), `student-app`, CEO pages, Lumio screens. Also deferred: batching `list()` queries and escaping `%`/`_` in the name search (both are "before enabling" items from Plan A's review).

## Global Constraints

- Uzbek (Latin) for every user-visible string; no English words on screen. Code, comments, commits, ADR file name in English/Uzbek per repo habit (ADRs are Uzbek).
- Files: private R2 bucket `R2_CHAT_BUCKET_NAME` (same endpoint/keys as the other R2 buckets); key `chat/<companyId>/<conversationId>/<uuid><ext>`; images jpg/png/webp ≤ 5 MB; voice ogg/webm/m4a ≤ 120 seconds and ≤ 2 MB; the type comes from the BYTES, never from name or declared type; presigned GET valid 10 minutes (`SIGNED_URL_SECONDS`).
- Purge: every night 03:00 Asia/Tashkent; a file is purged when its message was deleted by the sender, or when NEITHER student of the conversation had an app session (`StudentAppSession.lastSeenAt`) in the last 30 days. Text is never purged; a report snapshot is text and never purged.
- Send checks order stays: access → membership → block → recipient privacy → rate limit (30/min). Media messages go through the same checks. Reading and reporting are never closed by a lock or a ban.
- A report keeps the last 50 messages (text only, with `deleted` flags); one OPEN report per (reporter, reported). Only the CEO sees reports and may ban (`@CeoOnly()`); a ban sets `Student.chatBannedAt` and writes Student history.
- Notifications: bell type `CHAT_MESSAGE` (information, group `system`, folded per conversation by `groupKey`); at most one unread bell row per conversation; message CONTENT never leaves the chat (bell, push and Telegram say only who wrote). Telegram: instant, at most one notice per conversation until the recipient reads it, nothing 22:00–08:00 Tashkent (held until 08:00), button = `web_app` to `<TELEGRAM_MINI_APP_URL>?next=/portal/chat/<conversationId>`. A disconnected chat (`telegramDisconnectedAt`) is NOT skipped (ADR-0066).
- Every notification/live-push/Telegram step runs after the commit and swallows its own errors (logged with the peer id only, never message text or a signed URL).
- Run `npx prettier --write` on every touched server `.ts`; `npx jest <path>` from `server/`; never run build/typecheck in parallel with jest. Commit messages end with the Co-Authored-By line from the session attribution.

## File Structure

| File | Responsibility |
| --- | --- |
| `prisma/schema.prisma`, `prisma/migrations/20261026100000_chat_media_notify/migration.sql` | `NotificationType.CHAT_MESSAGE`, `ChatNotifyState` |
| `src/notifications/notification-kind.ts`, `notifications.service.ts` | group + per-conversation `groupKey` for `CHAT_MESSAGE` |
| `src/chat/chat.constants.ts` | new messages/limits |
| `src/chat/media/chat-file-rules.ts` | pure: what a chat file may be (reuses `checkTaskFile`) |
| `src/chat/media/chat-file-storage.ts` | private bucket put/remove/signedGet |
| `src/chat/media/chat-file-upload.interceptor.ts` | multipart: one file + `durationSec` |
| `src/chat/media/chat-media.service.ts` | upload + signed URL |
| `src/chat/media/chat-media-purge.service.ts` | nightly purge |
| `src/chat/notify/chat-notify.rules.ts` | pure: quiet hours, who needs a notice, text, deep link |
| `src/chat/notify/chat-notify.service.ts` | bell + push + Telegram + 08:00 cron |
| `src/chat/conversations/chat-conversations.service.ts` | `prepareSend`, `commitMessage`, `MessageView.file`, hooks |
| `src/chat/reports/chat-reports.service.ts`, `chat-ban.service.ts` | reports, CEO review, ban |
| `src/chat/chat-admin.controller.ts` | CEO routes |
| `src/chat/chat.controller.ts`, `chat.module.ts`, `dto/chat.dto.ts` | new student routes, wiring |
| manifests, snapshot, `docs/adr/`, `server/CLAUDE.md` | rules and docs |

---

### Task 1: Schema, enum, env, bell grouping

**Files:**
- Modify: `server/prisma/schema.prisma` (enum `NotificationType`; new model `ChatNotifyState`)
- Create: `server/prisma/migrations/20261026100000_chat_media_notify/migration.sql`
- Modify: `server/src/notifications/notification-kind.ts`, `server/src/notifications/notifications.service.ts`, `server/src/notifications/notification-kind.spec.ts`
- Modify: `server/src/chat/chat.constants.ts`
- Modify: every place that mentions `R2_TASKS_BUCKET_NAME` besides `src/tasks/` (find with `grep -rn "R2_TASKS_BUCKET_NAME" src ../docs ../.env* 2>/dev/null`; at least `src/config/env.validation.ts` and the env table in `server/CLAUDE.md`)

**Interfaces:**
- Produces: Prisma `NotificationType.CHAT_MESSAGE`; model `ChatNotifyState { conversationId, studentId, notifiedAt, pendingSince }`; `notificationKind(type, now, actionRequired?, relatedEntityId?)`; constants below; env `R2_CHAT_BUCKET_NAME` (optional; set without the R2 group = boot error, exactly like the tasks bucket).

- [ ] **Step 1: Write the failing test**

Add to `server/src/notifications/notification-kind.spec.ts`:

```ts
describe('CHAT_MESSAGE', () => {
  it('is an information row in the system group, folded per conversation', () => {
    expect(NOTIFICATION_GROUP.CHAT_MESSAGE).toBe('system');
    expect(ACTION_TYPES.has('CHAT_MESSAGE')).toBe(false);
    expect(notificationKind('CHAT_MESSAGE', new Date(), undefined, 'conv-1')).toEqual({
      actionRequired: false,
      groupKey: 'CHAT_MESSAGE:conv-1',
    });
  });

  it('has no group key without a conversation', () => {
    expect(notificationKind('CHAT_MESSAGE', new Date()).groupKey).toBeNull();
  });
});
```

(import `NOTIFICATION_GROUP`, `ACTION_TYPES`, `notificationKind` from `./notification-kind` if the spec does not already.)

- [ ] **Step 2: Run, expect failure** — `npx jest src/notifications/notification-kind.spec.ts` → FAIL (`CHAT_MESSAGE` unknown).

- [ ] **Step 3: Schema + migration**

In `schema.prisma` add `CHAT_MESSAGE` as the last value of `enum NotificationType`, and append:

```prisma
/// One row per conversation and RECIPIENT: when the Telegram notice for unread
/// messages last went out, and since when one is waiting for 08:00.
model ChatNotifyState {
  conversationId String
  studentId      Int
  notifiedAt     DateTime?
  pendingSince   DateTime?

  @@id([conversationId, studentId])
  @@index([pendingSince])
}
```

`migration.sql` (idempotent, enum first):

```sql
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CHAT_MESSAGE';

CREATE TABLE IF NOT EXISTS "ChatNotifyState" (
  "conversationId" TEXT NOT NULL,
  "studentId" INTEGER NOT NULL,
  "notifiedAt" TIMESTAMP(3),
  "pendingSince" TIMESTAMP(3),
  CONSTRAINT "ChatNotifyState_pkey" PRIMARY KEY ("conversationId", "studentId")
);
CREATE INDEX IF NOT EXISTS "ChatNotifyState_pendingSince_idx" ON "ChatNotifyState"("pendingSince");
```

Apply to the dev DB with the manual flow (`migrate dev` is broken here), from `server/`:

```bash
npx prisma db execute --file prisma/migrations/20261026100000_chat_media_notify/migration.sql
npx prisma migrate resolve --applied 20261026100000_chat_media_notify
npx prisma generate
```

- [ ] **Step 4: Group and key**

`notification-kind.ts`: add `CHAT_MESSAGE: 'system',` to `NOTIFICATION_GROUP`, and change `notificationKind` to

```ts
export function notificationKind(
  type: NotificationType,
  now: Date,
  actionRequired?: boolean,
  relatedEntityId?: string,
): { actionRequired: boolean; groupKey: string | null } {
  let groupKey: string | null = null;
  if (LESSON_ALERT_TYPES.includes(type)) {
    groupKey = lessonGroupKey(type, tashkentDateStr(now));
  } else if (type === 'CHAT_MESSAGE' && relatedEntityId) {
    // One line per conversation, whatever the day.
    groupKey = `CHAT_MESSAGE:${relatedEntityId}`;
  }
  return { actionRequired: actionRequired ?? ACTION_TYPES.has(type), groupKey };
}
```

`notifications.service.ts` `create`: pass `params.relatedEntityId` as the fourth argument of `notificationKind`.

- [ ] **Step 5: Constants and env**

Append to `server/src/chat/chat.constants.ts`:

```ts
export const CHAT_FILES_OFF_MESSAGE = "Fayl yuborish hozircha o'chiq";
export const CHAT_FILE_GONE_MESSAGE = "Fayl o'chirilgan";
export const REPORT_DUPLICATE_MESSAGE = 'Shikoyat allaqachon yuborilgan';
/** Files of a conversation nobody has opened for this long are purged. */
export const PURGE_INACTIVE_DAYS = 30;
export const PURGE_BATCH = 200;
/** A report keeps this many of the latest messages. */
export const REPORT_SNAPSHOT_SIZE = 50;
```

Env: add `R2_CHAT_BUCKET_NAME` next to every `R2_TASKS_BUCKET_NAME` outside `src/tasks/` (validation rule identical: optional; present without the R2 group is a boot error) and a row in the env table of `server/CLAUDE.md` ("Name of the PRIVATE R2 bucket for chat images and voice (spec 2026-10-25). Optional: unset = media is off, upload answers 503, no bucket access").

- [ ] **Step 6: Run and commit**

Run: `npx jest src/notifications src/config && npm run typecheck` (sequentially).
Expected: PASS.

```bash
npx prettier --write src/notifications src/chat/chat.constants.ts
git add server/prisma server/src/notifications server/src/chat/chat.constants.ts server/src/config server/CLAUDE.md
git commit -m "feat(chat): CHAT_MESSAGE bell type, ChatNotifyState and the chat bucket env"
```

---

### Task 2: File rules, storage, upload interceptor

**Files:**
- Create: `server/src/chat/media/chat-file-rules.ts`, `chat-file-storage.ts`, `chat-file-upload.interceptor.ts`
- Test: `server/src/chat/media/chat-file-rules.spec.ts`, `chat-file-storage.spec.ts`, `chat-file-upload.interceptor.spec.ts`

**Interfaces:**
- Consumes: `checkTaskFile`, `FILE_TYPE_MESSAGE`, `SIGNED_URL_SECONDS`, `contentDisposition` from `src/tasks/task-file-rules`.
- Produces:
  - `checkChatFile(input: { buffer: Buffer; durationSec?: number }): { mime: string; ext: string; kind: 'IMAGE' | 'VOICE' }`
  - `chatFileKey(companyId: number, conversationId: string, ext: string): string`
  - `class ChatFileStorage { enabled: boolean; put(key, body, mime): Promise<void>; remove(key): Promise<boolean>; signedGet(key, mime, name, download): Promise<string> }` (same behaviour as `TaskFileStorage`)
  - `class ChatFileUploadInterceptor`

- [ ] **Step 1: Write the failing rules test**

`chat-file-rules.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { checkChatFile, chatFileKey } from './chat-file-rules';

const png = (extra = 0) =>
  Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    Buffer.alloc(32 + extra),
  ]);
const ogg = () => Buffer.concat([Buffer.from('OggS'), Buffer.alloc(64)]);

describe('checkChatFile', () => {
  it('takes a png as an image', () => {
    expect(checkChatFile({ buffer: png() })).toEqual({
      mime: 'image/png',
      ext: '.png',
      kind: 'IMAGE',
    });
  });

  it('takes an ogg as voice up to 120 seconds', () => {
    expect(checkChatFile({ buffer: ogg(), durationSec: 120 }).kind).toBe('VOICE');
    expect(() => checkChatFile({ buffer: ogg(), durationSec: 121 })).toThrow(
      'Ovozli xabar 2 daqiqadan oshmasligi kerak',
    );
  });

  it('refuses an image over 5 MB', () => {
    expect(() => checkChatFile({ buffer: png(5 * 1024 * 1024) })).toThrow(
      'Rasm hajmi 5 MB dan oshmasligi kerak',
    );
  });

  it('refuses a voice file over 2 MB', () => {
    const big = Buffer.concat([ogg(), Buffer.alloc(2 * 1024 * 1024)]);
    expect(() => checkChatFile({ buffer: big, durationSec: 30 })).toThrow(
      'Ovozli xabar 2 daqiqadan oshmasligi kerak',
    );
  });

  it.each([
    ['text', Buffer.from('salom dunyo')],
    ['pdf', Buffer.from('%PDF-1.4 ....')],
  ])('refuses %s with the chat wording', (_n, buffer) => {
    expect(() => checkChatFile({ buffer })).toThrow(BadRequestException);
    expect(() => checkChatFile({ buffer })).toThrow(
      'Faqat rasm (JPG, PNG, WebP) va ovozli xabar yuborish mumkin',
    );
  });

  it('keeps the uuid-based key under the conversation', () => {
    const key = chatFileKey(1, 'c1', '.png');
    expect(key).toMatch(/^chat\/1\/c1\/[0-9a-f-]{36}\.png$/);
  });
});
```

- [ ] **Step 2: Run, expect failure** — `npx jest src/chat/media/chat-file-rules.spec.ts` → FAIL.

- [ ] **Step 3: Write the rules**

`chat-file-rules.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { FILE_TYPE_MESSAGE, checkTaskFile } from '../../tasks/task-file-rules';

export const MAX_CHAT_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_CHAT_VOICE_BYTES = 2 * 1024 * 1024;
export const MAX_CHAT_VOICE_SECONDS = 120;

export const CHAT_FILE_TYPE_MESSAGE =
  'Faqat rasm (JPG, PNG, WebP) va ovozli xabar yuborish mumkin';
export const CHAT_IMAGE_SIZE_MESSAGE = 'Rasm hajmi 5 MB dan oshmasligi kerak';
export const CHAT_VOICE_LIMIT_MESSAGE =
  'Ovozli xabar 2 daqiqadan oshmasligi kerak';

export interface ChatFileCheck {
  mime: string;
  ext: string;
  kind: 'IMAGE' | 'VOICE';
}

/**
 * What a chat file may be. The bytes decide the type (`checkTaskFile` is the
 * one sniffer in the repo); chat then keeps only images and voice, with its
 * own, stricter limits.
 */
export function checkChatFile(input: {
  buffer: Buffer;
  durationSec?: number;
}): ChatFileCheck {
  let checked: ReturnType<typeof checkTaskFile>;
  try {
    checked = checkTaskFile({
      buffer: input.buffer,
      durationSec: input.durationSec,
    });
  } catch (err) {
    if (err instanceof BadRequestException && err.message === FILE_TYPE_MESSAGE) {
      throw new BadRequestException(CHAT_FILE_TYPE_MESSAGE);
    }
    throw err;
  }
  const { mime, ext, kind } = checked;
  if (kind === 'IMAGE') {
    if (input.buffer.length > MAX_CHAT_IMAGE_BYTES) {
      throw new BadRequestException(CHAT_IMAGE_SIZE_MESSAGE);
    }
    return { mime, ext, kind };
  }
  if (kind === 'VOICE') {
    if (
      input.buffer.length > MAX_CHAT_VOICE_BYTES ||
      (input.durationSec ?? 0) > MAX_CHAT_VOICE_SECONDS
    ) {
      throw new BadRequestException(CHAT_VOICE_LIMIT_MESSAGE);
    }
    return { mime, ext, kind };
  }
  throw new BadRequestException(CHAT_FILE_TYPE_MESSAGE);
}

export function chatFileKey(
  companyId: number,
  conversationId: string,
  ext: string,
): string {
  return `chat/${companyId}/${conversationId}/${randomUUID()}${ext}`;
}
```

If `checkTaskFile`'s real input/return shape differs (it is `checkTaskFile({ buffer, name?, durationSec? }) → { mime, ext, kind }` in `src/tasks/task-file-rules.ts`), adapt minimally and say so in your report. If a real test byte-string is not recognised as png/ogg by the sniffer, take the minimal valid header from `src/tasks/task-file-rules.spec.ts` instead.

- [ ] **Step 4: Run, expect pass** — `npx jest src/chat/media/chat-file-rules.spec.ts` → PASS.

- [ ] **Step 5: Storage and interceptor**

`chat-file-storage.ts` is `src/tasks/task-file-storage.ts` with the class renamed `ChatFileStorage`, the bucket read from `R2_CHAT_BUCKET_NAME`, the 503 message `CHAT_FILES_OFF_MESSAGE` (from `../chat.constants`), the logger text `chat file`, and `SIGNED_URL_SECONDS` / `contentDisposition` imported from `../../tasks/task-file-rules`. Add above the class: `// ponytail: a copy of TaskFileStorage with another bucket; extract a shared R2 bucket class when a third bucket appears.` Keep `put`, `remove` (never throws, `false` when off or on failure), `signedGet` and `enabled` exactly as in the task storage.

`chat-file-upload.interceptor.ts`:

```ts
import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  PayloadTooLargeException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { MAX_CHAT_IMAGE_BYTES, CHAT_IMAGE_SIZE_MESSAGE } from './chat-file-rules';

/** One file plus one short text field (`durationSec`); the bytes are read into memory. */
export const CHAT_UPLOAD_LIMITS = {
  fileSize: MAX_CHAT_IMAGE_BYTES,
  files: 1,
  fields: 1,
  fieldSize: 64,
  parts: 3, // the file, the field and the closing boundary
} as const;

export const CHAT_UPLOAD_REFUSED_MESSAGE = 'Fayl yuklanmadi';

export function chatUploadError(err: unknown): unknown {
  if (err instanceof PayloadTooLargeException) {
    return new BadRequestException(CHAT_IMAGE_SIZE_MESSAGE);
  }
  if (err instanceof BadRequestException) {
    return new BadRequestException(CHAT_UPLOAD_REFUSED_MESSAGE);
  }
  return err;
}

@Injectable()
export class ChatFileUploadInterceptor implements NestInterceptor {
  private readonly inner = new (FileInterceptor('file', {
    storage: memoryStorage(),
    limits: CHAT_UPLOAD_LIMITS,
  }))();

  async intercept(context: ExecutionContext, next: CallHandler) {
    try {
      return await this.inner.intercept(context, next);
    } catch (err) {
      throw chatUploadError(err);
    }
  }
}
```

Tests (write them with the code):

`chat-file-storage.spec.ts` — with a `ConfigService` stub returning no bucket: `enabled === false`, `put` rejects `ServiceUnavailableException` with `CHAT_FILES_OFF_MESSAGE`, `remove` resolves `false`; with all four values set: `enabled === true`.

`chat-file-upload.interceptor.spec.ts`:

```ts
import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { chatUploadError, CHAT_UPLOAD_LIMITS } from './chat-file-upload.interceptor';

describe('chat upload', () => {
  it('limits one small file', () => {
    expect(CHAT_UPLOAD_LIMITS).toMatchObject({ fileSize: 5 * 1024 * 1024, files: 1, fields: 1 });
  });
  it('turns multer errors into Uzbek 400s', () => {
    expect(chatUploadError(new PayloadTooLargeException())).toEqual(
      new BadRequestException('Rasm hajmi 5 MB dan oshmasligi kerak'),
    );
    expect(chatUploadError(new BadRequestException('Unexpected field'))).toEqual(
      new BadRequestException('Fayl yuklanmadi'),
    );
  });
});
```

- [ ] **Step 6: Run and commit**

Run: `npx jest src/chat/media && npm run typecheck` (sequentially). Expected: PASS.

```bash
npx prettier --write src/chat/media
git add server/src/chat/media
git commit -m "feat(chat): chat file rules, private bucket storage and upload interceptor"
```

---

### Task 3: `ChatNotifyService` (bell, push, Telegram, 08:00 run)

**Files:**
- Create: `server/src/chat/notify/chat-notify.rules.ts`, `chat-notify.service.ts`
- Test: `server/src/chat/notify/chat-notify.rules.spec.ts`, `chat-notify.service.spec.ts`

**Interfaces:**
- Consumes: `NotificationsService.create`, `NotificationsGateway.sendToUser`, `PushService.sendToUser(userId, { title, body, url })`, `SmsService.sendToStudent(studentId, content, SmsMessageType.AUTO, undefined, companyId, { replyMarkup })`, `ConfigService`.
- Produces:
  - `isQuietHour(now: Date): boolean` (22:00–08:00 Tashkent)
  - `needsTelegram(state: { notifiedAt: Date | null } | null, lastReadAt: Date | null): boolean`
  - `noticeText(senderName: string): string`
  - `chatDeepLink(miniAppUrl: string | undefined, conversationId: string): string | undefined`
  - `ChatNotifyService.onMessage(i: { conversationId: string; senderId: number; recipientId: number; companyId: number }, now?: Date): Promise<void>` (never throws), `onRead(studentId: number, conversationId: string): Promise<void>` (never throws), `sendMorning(now?: Date): Promise<void>` (also the 08:00 cron)

- [ ] **Step 1: Write the failing rules test**

`chat-notify.rules.spec.ts`:

```ts
import { chatDeepLink, isQuietHour, needsTelegram, noticeText } from './chat-notify.rules';

// Tashkent is UTC+5 all year: 17:00Z = 22:00, 03:00Z = 08:00.
describe('isQuietHour', () => {
  it.each([
    ['2026-10-25T16:59:00Z', false], // 21:59
    ['2026-10-25T17:00:00Z', true], //  22:00
    ['2026-10-25T22:00:00Z', true], //  03:00
    ['2026-10-26T02:59:00Z', true], //  07:59
    ['2026-10-26T03:00:00Z', false], // 08:00
  ])('%s -> %s', (iso, quiet) => {
    expect(isQuietHour(new Date(iso))).toBe(quiet);
  });
});

describe('needsTelegram', () => {
  const read = new Date('2026-10-25T10:00:00Z');
  it('is true when never notified', () => {
    expect(needsTelegram(null, null)).toBe(true);
    expect(needsTelegram({ notifiedAt: null }, read)).toBe(true);
  });
  it('is false while the last notice is still unread', () => {
    expect(needsTelegram({ notifiedAt: new Date('2026-10-25T11:00:00Z') }, read)).toBe(false);
    expect(needsTelegram({ notifiedAt: new Date('2026-10-25T11:00:00Z') }, null)).toBe(false);
  });
  it('is true again after the recipient read past the last notice', () => {
    expect(needsTelegram({ notifiedAt: new Date('2026-10-25T09:00:00Z') }, read)).toBe(true);
  });
});

describe('texts', () => {
  it('escapes the name and never carries message content', () => {
    expect(noticeText('A <b>li')).toBe('<b>A &lt;b&gt;li</b> sizga yangi xabar yubordi.');
  });
  it('builds the Mini App deep link', () => {
    expect(chatDeepLink('https://student.dafzentrum.uz/tg', 'c1')).toBe(
      'https://student.dafzentrum.uz/tg?next=%2Fportal%2Fchat%2Fc1',
    );
    expect(chatDeepLink(undefined, 'c1')).toBeUndefined();
    expect(chatDeepLink('not a url', 'c1')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run, expect failure**, then **Step 3: write the rules**

`chat-notify.rules.ts`:

```ts
const NIGHT_START = 22;
const DAY_START = 8;

/** Tashkent is UTC+5 with no daylight saving, so the hour is a fixed shift. */
export function isQuietHour(now: Date): boolean {
  const hour = (now.getUTCHours() + 5) % 24;
  return hour >= NIGHT_START || hour < DAY_START;
}

/** False while a notice already went out and the recipient has not read since. */
export function needsTelegram(
  state: { notifiedAt: Date | null } | null,
  lastReadAt: Date | null,
): boolean {
  if (!state?.notifiedAt) return true;
  return lastReadAt !== null && state.notifiedAt <= lastReadAt;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Who wrote, nothing else: the message itself stays in the chat. */
export function noticeText(senderName: string): string {
  return `<b>${escapeHtml(senderName)}</b> sizga yangi xabar yubordi.`;
}

export function chatDeepLink(
  miniAppUrl: string | undefined,
  conversationId: string,
): string | undefined {
  if (!miniAppUrl) return undefined;
  try {
    const url = new URL(miniAppUrl);
    url.searchParams.set('next', `/portal/chat/${conversationId}`);
    return url.toString();
  } catch {
    return undefined;
  }
}
```

Run `npx jest src/chat/notify/chat-notify.rules.spec.ts` → PASS.

- [ ] **Step 4: Write the failing service test**

`chat-notify.service.spec.ts`:

```ts
import { ChatNotifyService } from './chat-notify.service';

const DAY = new Date('2026-10-25T07:00:00Z'); // 12:00 Tashkent
const NIGHT = new Date('2026-10-25T18:00:00Z'); // 23:00 Tashkent
const input = { conversationId: 'c1', senderId: 1, recipientId: 2, companyId: 1 };

function make(o: { state?: object | null; read?: object | null; existingBell?: boolean; chat?: boolean; smsFails?: boolean } = {}) {
  const prisma = {
    student: {
      findFirst: jest.fn(async ({ where }: { where: { id: number } }) =>
        where.id === 2
          ? { userId: 22, telegramChatId: o.chat === false ? null : '555' }
          : { firstName: 'Ali', lastName: 'Valiyev' },
      ),
    },
    notification: {
      findFirst: jest.fn().mockResolvedValue(o.existingBell ? { id: 9 } : null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    chatReadState: { findUnique: jest.fn().mockResolvedValue(o.read ?? null) },
    chatNotifyState: {
      findUnique: jest.fn().mockResolvedValue(o.state ?? null),
      upsert: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    },
    chatMessage: { count: jest.fn().mockResolvedValue(1) },
    chatConversation: { findUnique: jest.fn().mockResolvedValue({ id: 'c1', companyId: 1, studentLowId: 1, studentHighId: 2 }) },
  };
  const notifications = { create: jest.fn().mockResolvedValue({ id: 5 }) };
  const gateway = { sendToUser: jest.fn() };
  const push = { sendToUser: jest.fn().mockResolvedValue(undefined) };
  const sms = {
    sendToStudent: o.smsFails
      ? jest.fn().mockRejectedValue(new Error('telegram down'))
      : jest.fn().mockResolvedValue({}),
  };
  const config = { get: jest.fn(() => 'https://student.dafzentrum.uz/tg') };
  const service = new ChatNotifyService(
    prisma as never,
    notifications as never,
    gateway as never,
    push as never,
    sms as never,
    config as never,
  );
  return { service, prisma, notifications, gateway, push, sms };
}

describe('ChatNotifyService.onMessage', () => {
  it('writes the bell row, pushes it and sends the Telegram notice with a Mini App button', async () => {
    const { service, notifications, gateway, push, sms, prisma } = make();
    await service.onMessage(input, DAY);
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 22,
        type: 'CHAT_MESSAGE',
        relatedEntityType: 'ChatConversation',
        relatedEntityId: 'c1',
        companyId: 1,
      }),
    );
    expect(gateway.sendToUser).toHaveBeenCalledWith(22, expect.objectContaining({ type: 'notification' }));
    expect(push.sendToUser).toHaveBeenCalledWith(22, expect.objectContaining({ url: '/portal/chat/c1' }));
    const [studentId, content, , , companyId, opts] = sms.sendToStudent.mock.calls[0];
    expect(studentId).toBe(2);
    expect(content).toBe('<b>Ali Valiyev</b> sizga yangi xabar yubordi.');
    expect(companyId).toBe(1);
    expect(JSON.stringify(opts.replyMarkup)).toContain('next=%2Fportal%2Fchat%2Fc1');
    expect(prisma.chatNotifyState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { conversationId_studentId: { conversationId: 'c1', studentId: 2 } },
        update: expect.objectContaining({ notifiedAt: DAY, pendingSince: null }),
      }),
    );
  });

  it('keeps one unread bell row per conversation', async () => {
    const { service, notifications } = make({ existingBell: true });
    await service.onMessage(input, DAY);
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('sends no second Telegram notice while the first is unread', async () => {
    const { service, sms } = make({ state: { notifiedAt: new Date('2026-10-25T06:00:00Z') } });
    await service.onMessage(input, DAY);
    expect(sms.sendToStudent).not.toHaveBeenCalled();
  });

  it('holds the Telegram notice at night', async () => {
    const { service, sms, prisma } = make();
    await service.onMessage(input, NIGHT);
    expect(sms.sendToStudent).not.toHaveBeenCalled();
    expect(prisma.chatNotifyState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { pendingSince: NIGHT } }),
    );
  });

  it('does nothing in Telegram for a student without a linked chat, but still writes the bell', async () => {
    const { service, sms, notifications } = make({ chat: false });
    await service.onMessage(input, DAY);
    expect(sms.sendToStudent).not.toHaveBeenCalled();
    expect(notifications.create).toHaveBeenCalled();
  });

  it('never throws, even when Telegram is down', async () => {
    const { service } = make({ smsFails: true });
    await expect(service.onMessage(input, DAY)).resolves.toBeUndefined();
  });
});

describe('ChatNotifyService.onRead', () => {
  it('marks the conversation bell rows read', async () => {
    const { service, prisma } = make();
    await service.onRead(2, 'c1');
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: 22, type: 'CHAT_MESSAGE', relatedEntityId: 'c1', isRead: false },
      data: { isRead: true },
    });
  });
});

describe('ChatNotifyService.sendMorning', () => {
  it('sends one notice for a still-unread pending conversation and clears the wait', async () => {
    const { service, prisma, sms } = make();
    prisma.chatNotifyState.findMany.mockResolvedValue([
      { conversationId: 'c1', studentId: 2, notifiedAt: null, pendingSince: new Date('2026-10-25T18:00:00Z') },
    ]);
    await service.sendMorning(new Date('2026-10-26T03:05:00Z'));
    expect(sms.sendToStudent).toHaveBeenCalledTimes(1);
    expect(prisma.chatNotifyState.update).toHaveBeenCalledWith({
      where: { conversationId_studentId: { conversationId: 'c1', studentId: 2 } },
      data: { notifiedAt: new Date('2026-10-26T03:05:00Z'), pendingSince: null },
    });
  });

  it('drops the wait without a message when the recipient read meanwhile', async () => {
    const { service, prisma, sms } = make();
    prisma.chatMessage.count.mockResolvedValue(0);
    prisma.chatNotifyState.findMany.mockResolvedValue([
      { conversationId: 'c1', studentId: 2, notifiedAt: null, pendingSince: new Date('2026-10-25T18:00:00Z') },
    ]);
    await service.sendMorning(new Date('2026-10-26T03:05:00Z'));
    expect(sms.sendToStudent).not.toHaveBeenCalled();
    expect(prisma.chatNotifyState.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { pendingSince: null } }),
    );
  });
});
```

- [ ] **Step 5: Run, expect failure** — module not found.

- [ ] **Step 6: Write the service**

`chat-notify.service.ts` (the `Markup` import is `import { Markup } from 'telegraf';`; look at `SmsService.sendToStudent` once to confirm the message is sent with HTML parse mode — if it is plain text, drop the `<b>` tags from `noticeText` and its test):

```ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { SmsMessageType } from '@prisma/client';
import { Markup } from 'telegraf';
import { NotificationsGateway } from '../../notifications/notifications.gateway';
import { NotificationsService } from '../../notifications/notifications.service';
import { PushService } from '../../notifications/push.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SmsService } from '../../sms/sms.service';
import {
  chatDeepLink,
  isQuietHour,
  needsTelegram,
  noticeText,
} from './chat-notify.rules';

export interface ChatNotifyInput {
  conversationId: string;
  senderId: number;
  recipientId: number;
  companyId: number;
}

const MORNING_BATCH = 500;
const BUTTON_TEXT = 'Chatni ochish';

/**
 * Tells the recipient there is a new message: a bell row, web push and one
 * Telegram notice per conversation until they read it. It runs AFTER the
 * message is saved and never throws — a failed notice must not fail (and invite
 * a retry of) a saved send. Message content never appears in any of it.
 */
@Injectable()
export class ChatNotifyService {
  private readonly logger = new Logger(ChatNotifyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly gateway: NotificationsGateway,
    private readonly push: PushService,
    private readonly sms: SmsService,
    private readonly config: ConfigService,
  ) {}

  async onMessage(i: ChatNotifyInput, now: Date = new Date()): Promise<void> {
    try {
      const [recipient, sender] = await Promise.all([
        this.prisma.student.findFirst({
          where: { id: i.recipientId, deletedAt: null },
          select: { userId: true, telegramChatId: true },
        }),
        this.prisma.student.findFirst({
          where: { id: i.senderId },
          select: { firstName: true, lastName: true },
        }),
      ]);
      if (!recipient || !sender) return;
      const name = `${sender.firstName} ${sender.lastName}`.trim();
      if (recipient.userId) await this.bell(recipient.userId, name, i);
      if (recipient.telegramChatId) await this.telegram(i, name, now);
    } catch (err) {
      this.warn('notice', i.recipientId, err);
    }
  }

  async onRead(studentId: number, conversationId: string): Promise<void> {
    try {
      const me = await this.prisma.student.findFirst({
        where: { id: studentId },
        select: { userId: true },
      });
      if (!me?.userId) return;
      await this.prisma.notification.updateMany({
        where: {
          userId: me.userId,
          type: 'CHAT_MESSAGE',
          relatedEntityId: conversationId,
          isRead: false,
        },
        data: { isRead: true },
      });
    } catch (err) {
      this.warn('bell read', studentId, err);
    }
  }

  /** At most one unread bell row per conversation; it folds by groupKey on the client. */
  private async bell(userId: number, name: string, i: ChatNotifyInput) {
    try {
      const unread = await this.prisma.notification.findFirst({
        where: {
          userId,
          type: 'CHAT_MESSAGE',
          relatedEntityId: i.conversationId,
          isRead: false,
        },
        select: { id: true },
      });
      if (unread) return;
      const title = 'Yangi xabar';
      const message = `${name} sizga xabar yubordi`;
      const notification = await this.notifications.create({
        userId,
        type: 'CHAT_MESSAGE',
        title,
        message,
        relatedEntityType: 'ChatConversation',
        relatedEntityId: i.conversationId,
        companyId: i.companyId,
      });
      this.gateway.sendToUser(userId, { type: 'notification', notification });
      await this.push.sendToUser(userId, {
        title,
        body: message,
        url: `/portal/chat/${i.conversationId}`,
      });
    } catch (err) {
      this.warn('bell', i.recipientId, err);
    }
  }

  private async telegram(i: ChatNotifyInput, name: string, now: Date) {
    const key = {
      conversationId_studentId: {
        conversationId: i.conversationId,
        studentId: i.recipientId,
      },
    };
    try {
      const [state, read] = await Promise.all([
        this.prisma.chatNotifyState.findUnique({ where: key }),
        this.prisma.chatReadState.findUnique({
          where: {
            conversationId_studentId: {
              conversationId: i.conversationId,
              studentId: i.recipientId,
            },
          },
        }),
      ]);
      if (!needsTelegram(state, read?.lastReadAt ?? null)) return;
      if (isQuietHour(now)) {
        await this.prisma.chatNotifyState.upsert({
          where: key,
          create: {
            conversationId: i.conversationId,
            studentId: i.recipientId,
            pendingSince: now,
          },
          update: { pendingSince: now },
        });
        return;
      }
      await this.sendNotice(i, name, now);
      await this.prisma.chatNotifyState.upsert({
        where: key,
        create: {
          conversationId: i.conversationId,
          studentId: i.recipientId,
          notifiedAt: now,
        },
        update: { notifiedAt: now, pendingSince: null },
      });
    } catch (err) {
      this.warn('telegram', i.recipientId, err);
    }
  }

  private async sendNotice(i: ChatNotifyInput, name: string, now: Date) {
    void now;
    const link = chatDeepLink(
      this.config.get<string>('TELEGRAM_MINI_APP_URL'),
      i.conversationId,
    );
    await this.sms.sendToStudent(
      i.recipientId,
      noticeText(name),
      SmsMessageType.AUTO,
      undefined,
      i.companyId,
      link
        ? {
            replyMarkup: Markup.inlineKeyboard([
              [Markup.button.webApp(BUTTON_TEXT, link)],
            ]).reply_markup,
          }
        : undefined,
    );
  }

  /**
   * 08:00 Tashkent: send the notices held over the night — once, and only to
   * a recipient who still has something unread.
   */
  @Cron('0 0 8 * * *', { timeZone: 'Asia/Tashkent' })
  async sendMorning(now: Date = new Date()): Promise<void> {
    try {
      const pending = await this.prisma.chatNotifyState.findMany({
        where: { pendingSince: { not: null } },
        orderBy: { pendingSince: 'asc' },
        take: MORNING_BATCH,
      });
      for (const p of pending) {
        const key = {
          conversationId_studentId: {
            conversationId: p.conversationId,
            studentId: p.studentId,
          },
        };
        try {
          const [conversation, read] = await Promise.all([
            this.prisma.chatConversation.findUnique({
              where: { id: p.conversationId },
            }),
            this.prisma.chatReadState.findUnique({ where: key }),
          ]);
          if (!conversation) {
            await this.prisma.chatNotifyState.update({
              where: key,
              data: { pendingSince: null },
            });
            continue;
          }
          const senderId =
            conversation.studentLowId === p.studentId
              ? conversation.studentHighId
              : conversation.studentLowId;
          const unread = await this.prisma.chatMessage.count({
            where: {
              conversationId: p.conversationId,
              senderId: { not: p.studentId },
              deletedAt: null,
              ...(read && { createdAt: { gt: read.lastReadAt } }),
            },
          });
          if (unread > 0 && needsTelegram(p, read?.lastReadAt ?? null)) {
            const sender = await this.prisma.student.findFirst({
              where: { id: senderId },
              select: { firstName: true, lastName: true },
            });
            if (sender) {
              await this.sendNotice(
                {
                  conversationId: p.conversationId,
                  senderId,
                  recipientId: p.studentId,
                  companyId: conversation.companyId,
                },
                `${sender.firstName} ${sender.lastName}`.trim(),
                now,
              );
              await this.prisma.chatNotifyState.update({
                where: key,
                data: { notifiedAt: now, pendingSince: null },
              });
              continue;
            }
          }
          await this.prisma.chatNotifyState.update({
            where: key,
            data: { pendingSince: null },
          });
        } catch (err) {
          this.warn('morning notice', p.studentId, err);
        }
      }
    } catch (err) {
      this.logger.warn(
        `Chat morning run failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    }
  }

  private warn(what: string, studentId: number, err: unknown) {
    this.logger.warn(
      `Chat ${what} for student ${studentId} failed: ${
        err instanceof Error ? err.message : 'unknown error'
      }`,
    );
  }
}
```

Remove the unused `now` parameter from `sendNotice` and the `void now;` line if lint complains (the `now` is only there for symmetry; the test does not need it). If `Markup.inlineKeyboard(...).reply_markup` does not typecheck against `InlineKeyboardMarkup`, build the plain object `{ inline_keyboard: [[{ text: BUTTON_TEXT, web_app: { url: link } }]] }` instead — the test only checks that the JSON contains the deep link.

- [ ] **Step 7: Run and commit**

Run: `npx jest src/chat/notify && npm run typecheck` (sequentially). Expected: PASS.

```bash
npx prettier --write src/chat/notify
git add server/src/chat/notify
git commit -m "feat(chat): ChatNotifyService (bell, push, one Telegram notice per unread conversation)"
```

---

### Task 4: `prepareSend` / `commitMessage`, media upload, file URL, hooks

**Files:**
- Modify: `server/src/chat/conversations/chat-conversations.service.ts`, `server/src/chat/conversations/chat-conversations.service.spec.ts`
- Create: `server/src/chat/media/chat-media.service.ts`
- Modify: `server/src/chat/dto/chat.dto.ts`, `server/src/chat/chat.controller.ts`, `server/src/chat/chat.module.ts`, `server/src/chat/chat.controller.spec.ts`
- Test: `server/src/chat/media/chat-media.service.spec.ts`

**Interfaces:**
- Consumes: Task 2 (`checkChatFile`, `chatFileKey`, `ChatFileStorage`, `ChatFileUploadInterceptor`), Task 3 (`ChatNotifyService`).
- Produces:
  - `MessageView.file: { mime: string; sizeBytes: number | null; durationSec: number | null; purged: boolean } | null`
  - `ChatConversationsService.mine(me, conversationId)` becomes public; new public `prepareSend(me, companyId, conversationId): Promise<{ peerId: number }>` and `commitMessage(me, companyId, conversationId, peerId, data): Promise<MessageView>` where `data = { kind: 'TEXT'|'IMAGE'|'VOICE'; text?: string; fileKey?: string; mime?: string; sizeBytes?: number; durationSec?: number | null }`
  - `ChatMediaService.upload(me, companyId, conversationId, input: { buffer: Buffer; durationSec?: number }): Promise<MessageView>`, `ChatMediaService.signedUrl(me, messageId): Promise<{ url: string; expiresInSec: number }>`
  - routes `POST /chat/conversations/:id/files`, `GET /chat/messages/:id/file`
  - constructor of `ChatConversationsService` is now `(prisma, access, people, gateway, notify, limiter)`.

- [ ] **Step 1: Update the conversations spec first (failing)**

In `chat-conversations.service.spec.ts` change `make()` to build the service with the new constructor `(prisma, access, people, gateway, notify, limiter)`, where `notify = { onMessage: jest.fn().mockResolvedValue(undefined), onRead: jest.fn().mockResolvedValue(undefined) }` (return it from `make`). Add:

```ts
describe('prepareSend / commitMessage', () => {
  it('send() = prepareSend + commitMessage and tells the notifier after the commit', async () => {
    const { service, notify } = make();
    const out = await service.send(1, 1, 'c1', 'salom');
    expect(out).toMatchObject({ id: 'm1', mine: true, text: 'salom', file: null });
    expect(notify.onMessage).toHaveBeenCalledWith({
      conversationId: 'c1',
      senderId: 1,
      recipientId: 2,
      companyId: 1,
    });
  });

  it('commitMessage writes a media row with its file fields and exposes file without the key', async () => {
    const { service, tx } = make();
    tx.chatMessage.create.mockResolvedValue({
      id: 'm2', conversationId: 'c1', senderId: 1, kind: 'IMAGE', text: null,
      fileKey: 'chat/1/c1/x.png', mime: 'image/png', sizeBytes: 1234, durationSec: null,
      mediaPurgedAt: null, createdAt: new Date('2026-10-25T07:00:00Z'),
    });
    const out = await service.commitMessage(1, 1, 'c1', 2, {
      kind: 'IMAGE', fileKey: 'chat/1/c1/x.png', mime: 'image/png', sizeBytes: 1234, durationSec: null,
    });
    expect(tx.chatMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ conversationId: 'c1', senderId: 1, kind: 'IMAGE', fileKey: 'chat/1/c1/x.png', mime: 'image/png', sizeBytes: 1234 }),
    });
    expect(out.file).toEqual({ mime: 'image/png', sizeBytes: 1234, durationSec: null, purged: false });
    expect(JSON.stringify(out)).not.toContain('chat/1/c1/x.png');
  });

  it('a purged file is reported as purged', async () => {
    const { service, prisma } = make();
    prisma.chatMessage.findMany = jest.fn().mockResolvedValue([
      { id: 'm3', senderId: 2, kind: 'VOICE', text: null, mime: 'audio/ogg', sizeBytes: 10, durationSec: 5, mediaPurgedAt: new Date(), createdAt: new Date() },
    ]);
    const out = await service.messages(1, 'c1');
    expect(out.data[0].file).toEqual({ mime: 'audio/ogg', sizeBytes: 10, durationSec: 5, purged: true });
  });

  it('markRead tells the notifier so the bell row closes', async () => {
    const { service, notify } = make();
    await service.markRead(1, 'c1');
    expect(notify.onRead).toHaveBeenCalledWith(1, 'c1');
  });
});
```

(Adapt the mock shapes of `make()` that already exist; the point is the four assertions above.)

- [ ] **Step 2: Run, expect failure** — `npx jest src/chat/conversations` → FAIL.

- [ ] **Step 3: Refactor the service**

In `chat-conversations.service.ts`:

1. Inject `ChatNotifyService` as the fifth constructor parameter (`private readonly notify: ChatNotifyService`, before `limiter`).
2. Extend `MessageView` with `file` and `view()` with the media fields:

```ts
export interface MessageView {
  id: string;
  senderId: number;
  mine: boolean;
  kind: 'TEXT' | 'IMAGE' | 'VOICE';
  text: string | null;
  file: {
    mime: string;
    sizeBytes: number | null;
    durationSec: number | null;
    purged: boolean;
  } | null;
  createdAt: string;
}

private view(
  m: {
    id: string;
    senderId: number;
    kind: string;
    text: string | null;
    mime?: string | null;
    sizeBytes?: number | null;
    durationSec?: number | null;
    mediaPurgedAt?: Date | null;
    createdAt: Date;
  },
  me: number,
): MessageView {
  return {
    id: m.id,
    senderId: m.senderId,
    mine: m.senderId === me,
    kind: m.kind as MessageView['kind'],
    text: m.text,
    // The storage key never leaves the server: the client asks for a signed link.
    file:
      m.kind === 'TEXT'
        ? null
        : {
            mime: m.mime ?? '',
            sizeBytes: m.sizeBytes ?? null,
            durationSec: m.durationSec ?? null,
            purged: m.mediaPurgedAt != null,
          },
    createdAt: m.createdAt.toISOString(),
  };
}
```

3. Make `mine` public (`async mine(...)`).
4. Replace `send` with:

```ts
/** Every check a message needs, in the agreed order; returns the other side. */
async prepareSend(
  me: number,
  companyId: number,
  conversationId: string,
): Promise<{ peerId: number }> {
  await this.access.assertCanWrite(me, companyId);
  const { peerId } = await this.mine(me, conversationId);
  await this.assertMayReach(me, peerId);
  await this.countAgainstLimit(`chat:rate:${me}`, RATE_PER_MINUTE);
  return { peerId };
}

async commitMessage(
  me: number,
  companyId: number,
  conversationId: string,
  peerId: number,
  data: {
    kind: 'TEXT' | 'IMAGE' | 'VOICE';
    text?: string;
    fileKey?: string;
    mime?: string;
    sizeBytes?: number;
    durationSec?: number | null;
  },
): Promise<MessageView> {
  const row = await this.prisma.$transaction(async (tx) => {
    const m = await tx.chatMessage.create({
      data: { conversationId, senderId: me, ...data },
    });
    await tx.chatConversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: m.createdAt },
    });
    // Writing means having read everything so far.
    await tx.chatReadState.upsert({
      where: { conversationId_studentId: { conversationId, studentId: me } },
      create: { conversationId, studentId: me, lastReadAt: m.createdAt },
      update: { lastReadAt: m.createdAt },
    });
    return m;
  });

  await this.pushToPeer(peerId, {
    type: 'chat.message',
    conversationId,
    message: this.view(row, peerId),
  });
  // After the commit, not awaited: the notifier never throws and Telegram is slow.
  void this.notify.onMessage({
    conversationId,
    senderId: me,
    recipientId: peerId,
    companyId,
  });
  return this.view(row, me);
}

async send(
  me: number,
  companyId: number,
  conversationId: string,
  text: string,
): Promise<MessageView> {
  const { peerId } = await this.prepareSend(me, companyId, conversationId);
  return this.commitMessage(me, companyId, conversationId, peerId, {
    kind: 'TEXT',
    text,
  });
}
```

5. In `markRead`, after the upsert and before the live push: `await this.notify.onRead(me, conversationId);` (it never throws).

- [ ] **Step 4: Run the conversations spec, expect pass** — `npx jest src/chat/conversations` → PASS (fix the `make()` of the old tests for the new constructor/mocks).

- [ ] **Step 5: Write the failing media-service test**

`chat-media.service.spec.ts`:

```ts
import { GoneException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ChatMediaService } from './chat-media.service';

const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(32)]);
const OGG = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(64)]);

function make(o: { enabled?: boolean; commitFails?: boolean; message?: object | null } = {}) {
  const prisma = {
    chatMessage: {
      findFirst: jest.fn().mockResolvedValue(
        o.message === undefined
          ? { id: 'm1', fileKey: 'chat/1/c1/a.png', mime: 'image/png', mediaPurgedAt: null, conversation: { studentLowId: 1, studentHighId: 2 } }
          : o.message,
      ),
    },
  };
  const storage = {
    enabled: o.enabled ?? true,
    put: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(true),
    signedGet: jest.fn().mockResolvedValue('https://signed.example/x'),
  };
  const conversations = {
    prepareSend: jest.fn().mockResolvedValue({ peerId: 2 }),
    commitMessage: o.commitFails
      ? jest.fn().mockRejectedValue(new Error('db down'))
      : jest.fn().mockResolvedValue({ id: 'm1' }),
  };
  return {
    service: new ChatMediaService(prisma as never, storage as never, conversations as never),
    prisma, storage, conversations,
  };
}

describe('ChatMediaService.upload', () => {
  it('is off without the bucket and checks nothing else', async () => {
    const { service, conversations } = make({ enabled: false });
    await expect(service.upload(1, 1, 'c1', { buffer: PNG })).rejects.toThrow(ServiceUnavailableException);
    expect(conversations.prepareSend).not.toHaveBeenCalled();
  });

  it('runs the send checks, stores the bytes, then commits the row', async () => {
    const { service, storage, conversations } = make();
    await service.upload(1, 1, 'c1', { buffer: PNG });
    expect(conversations.prepareSend).toHaveBeenCalledWith(1, 1, 'c1');
    expect(storage.put).toHaveBeenCalledWith(expect.stringMatching(/^chat\/1\/c1\/.+\.png$/), PNG, 'image/png');
    expect(conversations.commitMessage).toHaveBeenCalledWith(1, 1, 'c1', 2, {
      kind: 'IMAGE',
      fileKey: expect.stringMatching(/^chat\/1\/c1\//),
      mime: 'image/png',
      sizeBytes: PNG.length,
      durationSec: null,
    });
  });

  it('keeps the declared duration for voice', async () => {
    const { service, conversations } = make();
    await service.upload(1, 1, 'c1', { buffer: OGG, durationSec: 30 });
    expect(conversations.commitMessage).toHaveBeenCalledWith(
      1, 1, 'c1', 2, expect.objectContaining({ kind: 'VOICE', durationSec: 30 }),
    );
  });

  it('takes the object back when the row cannot be written', async () => {
    const { service, storage } = make({ commitFails: true });
    await expect(service.upload(1, 1, 'c1', { buffer: PNG })).rejects.toThrow('db down');
    expect(storage.remove).toHaveBeenCalledWith(storage.put.mock.calls[0][0]);
  });

  it('refuses a bad file after the checks and before touching storage', async () => {
    const { service, storage } = make();
    await expect(service.upload(1, 1, 'c1', { buffer: Buffer.from('salom') })).rejects.toThrow('Faqat rasm');
    expect(storage.put).not.toHaveBeenCalled();
  });
});

describe('ChatMediaService.signedUrl', () => {
  it('returns a link to a member', async () => {
    const { service, storage } = make();
    expect(await service.signedUrl(1, 'm1')).toEqual({ url: 'https://signed.example/x', expiresInSec: 600 });
    expect(storage.signedGet).toHaveBeenCalledWith('chat/1/c1/a.png', 'image/png', 'fayl.png', false);
  });

  it('404s for a non-member and for a message without a file', async () => {
    await expect(make().service.signedUrl(99, 'm1')).rejects.toThrow(NotFoundException);
    await expect(make({ message: null }).service.signedUrl(1, 'm1')).rejects.toThrow(NotFoundException);
  });

  it('answers 410 for a purged file', async () => {
    const { service } = make({
      message: { id: 'm1', fileKey: 'k.png', mime: 'image/png', mediaPurgedAt: new Date(), conversation: { studentLowId: 1, studentHighId: 2 } },
    });
    await expect(service.signedUrl(1, 'm1')).rejects.toThrow(GoneException);
  });
});
```

- [ ] **Step 6: Run, expect failure**, then **Step 7: write the media service**

`chat-media.service.ts`:

```ts
import {
  GoneException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SIGNED_URL_SECONDS } from '../../tasks/task-file-rules';
import { CHAT_FILES_OFF_MESSAGE, CHAT_FILE_GONE_MESSAGE } from '../chat.constants';
import {
  ChatConversationsService,
  type MessageView,
} from '../conversations/chat-conversations.service';
import { checkChatFile, chatFileKey } from './chat-file-rules';
import { ChatFileStorage } from './chat-file-storage';

@Injectable()
export class ChatMediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ChatFileStorage,
    private readonly conversations: ChatConversationsService,
  ) {}

  /**
   * Same checks as a text (access, membership, block, privacy, rate), then the
   * bytes decide the type. The object is stored first and taken back if the
   * row cannot be written, so there is never a row without an object.
   */
  async upload(
    me: number,
    companyId: number,
    conversationId: string,
    input: { buffer: Buffer; durationSec?: number },
  ): Promise<MessageView> {
    if (!this.storage.enabled) {
      throw new ServiceUnavailableException(CHAT_FILES_OFF_MESSAGE);
    }
    const { peerId } = await this.conversations.prepareSend(
      me,
      companyId,
      conversationId,
    );
    const { mime, ext, kind } = checkChatFile(input);
    const key = chatFileKey(companyId, conversationId, ext);
    await this.storage.put(key, input.buffer, mime);
    try {
      return await this.conversations.commitMessage(
        me,
        companyId,
        conversationId,
        peerId,
        {
          kind,
          fileKey: key,
          mime,
          sizeBytes: input.buffer.length,
          durationSec: kind === 'VOICE' ? (input.durationSec ?? null) : null,
        },
      );
    } catch (err) {
      await this.storage.remove(key);
      throw err;
    }
  }

  /** A 10-minute link for a member of the conversation; never the key itself. */
  async signedUrl(
    me: number,
    messageId: string,
  ): Promise<{ url: string; expiresInSec: number }> {
    if (!this.storage.enabled) {
      throw new ServiceUnavailableException(CHAT_FILES_OFF_MESSAGE);
    }
    const m = await this.prisma.chatMessage.findFirst({
      where: { id: messageId, deletedAt: null, fileKey: { not: null } },
      select: {
        id: true,
        fileKey: true,
        mime: true,
        mediaPurgedAt: true,
        conversation: { select: { studentLowId: true, studentHighId: true } },
      },
    });
    // The same 404 for "no such file" and "not your conversation".
    if (
      !m ||
      !m.fileKey ||
      (m.conversation.studentLowId !== me && m.conversation.studentHighId !== me)
    ) {
      throw new NotFoundException('Fayl topilmadi');
    }
    if (m.mediaPurgedAt) throw new GoneException(CHAT_FILE_GONE_MESSAGE);
    const ext = m.fileKey.slice(m.fileKey.lastIndexOf('.'));
    const url = await this.storage.signedGet(
      m.fileKey,
      m.mime ?? 'application/octet-stream',
      `fayl${ext}`,
      false,
    );
    return { url, expiresInSec: SIGNED_URL_SECONDS };
  }
}
```

- [ ] **Step 8: DTO, routes, module**

`dto/chat.dto.ts` add:

```ts
export class UploadChatFileDto {
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' ? undefined : Number(value)))
  @IsInt()
  @Min(0)
  @Max(3600)
  durationSec?: number;
}
```

`chat.controller.ts`: inject `ChatMediaService` and add (mirror how `TasksController` takes the file in `POST /tasks/:id/files` for the `@UploadedFile()` type; add `BadRequestException`, `UploadedFile`, `UseInterceptors` imports):

```ts
@Post('conversations/:id/files')
@UseInterceptors(ChatFileUploadInterceptor)
upload(
  @CurrentUser('studentId') studentId: number,
  @CurrentUser('companyId') companyId: number,
  @Param('id', ParseUUIDPipe) id: string,
  @UploadedFile() file: { buffer: Buffer } | undefined,
  @Body() dto: UploadChatFileDto,
) {
  if (!file) throw new BadRequestException('Fayl yuklanmadi');
  return this.media.upload(studentId, companyId, id, {
    buffer: file.buffer,
    durationSec: dto.durationSec,
  });
}

@Get('messages/:id/file')
fileUrl(
  @CurrentUser('studentId') studentId: number,
  @Param('id', ParseUUIDPipe) id: string,
) {
  return this.media.signedUrl(studentId, id);
}
```

`chat.module.ts`: `imports` add `SmsModule` (the module that exports `SmsService`; find it with `grep -rn "exports:.*SmsService" src/sms`); `providers` add `ChatFileStorage`, `ChatFileUploadInterceptor`, `ChatMediaService`, `ChatNotifyService`. `ConfigService` comes from the global `ConfigModule` (as in `TaskFileStorage`).

The controller spec iterates all methods, so the new routes are covered; add nothing else there.

- [ ] **Step 9: Run and commit**

Run: `npx jest src/chat && npm run typecheck && npx eslint src/chat --quiet` (sequentially). Expected: PASS.

```bash
npx prettier --write src/chat
git add server/src/chat
git commit -m "feat(chat): images and voice (upload, signed link), shared send path, bell/Telegram hooks"
```

---

### Task 5: Nightly media purge

**Files:**
- Create: `server/src/chat/media/chat-media-purge.service.ts`
- Test: `server/src/chat/media/chat-media-purge.service.spec.ts`
- Modify: `server/src/chat/chat.module.ts` (provider)

**Interfaces:**
- Consumes: `ChatFileStorage.enabled/remove`, `PURGE_INACTIVE_DAYS`, `PURGE_BATCH`.
- Produces: `ChatMediaPurgeService.purgeBatch(now?): Promise<{ purged: number; failed: number }>`, `run(now?)` (the 03:00 cron).

- [ ] **Step 1: Write the failing test**

```ts
import { ChatMediaPurgeService } from './chat-media-purge.service';

const NOW = new Date('2026-10-26T22:00:00Z');

function make(o: { rows?: { id: string; fileKey: string }[][]; removeOk?: boolean; enabled?: boolean } = {}) {
  const batches = [...(o.rows ?? [])];
  const prisma = {
    $queryRaw: jest.fn(async () => batches.shift() ?? []),
    chatMessage: { update: jest.fn().mockResolvedValue({}) },
  };
  const storage = {
    enabled: o.enabled ?? true,
    remove: jest.fn().mockResolvedValue(o.removeOk ?? true),
  };
  return { service: new ChatMediaPurgeService(prisma as never, storage as never), prisma, storage };
}

describe('ChatMediaPurgeService', () => {
  it('removes the object and stamps the row, keeping the text and the key', async () => {
    const { service, prisma, storage } = make({ rows: [[{ id: 'm1', fileKey: 'chat/1/c1/a.png' }]] });
    expect(await service.purgeBatch(NOW)).toEqual({ purged: 1, failed: 0 });
    expect(storage.remove).toHaveBeenCalledWith('chat/1/c1/a.png');
    expect(prisma.chatMessage.update).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: { mediaPurgedAt: NOW },
    });
  });

  it('leaves a row alone when the object could not be removed (tomorrow retries)', async () => {
    const { service, prisma } = make({ rows: [[{ id: 'm1', fileKey: 'k' }]], removeOk: false });
    expect(await service.purgeBatch(NOW)).toEqual({ purged: 0, failed: 1 });
    expect(prisma.chatMessage.update).not.toHaveBeenCalled();
  });

  it('does nothing while the bucket is off', async () => {
    const { service, prisma } = make({ enabled: false });
    await service.run(NOW);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('stops looping as soon as a batch purges nothing', async () => {
    const { service, prisma } = make({
      rows: [[{ id: 'a', fileKey: 'ka' }], [{ id: 'b', fileKey: 'kb' }], [{ id: 'c', fileKey: 'kc' }]],
      removeOk: false,
    });
    await service.run(NOW);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('keeps going while batches purge something, then stops on an empty one', async () => {
    const { service, prisma } = make({ rows: [[{ id: 'a', fileKey: 'ka' }], [{ id: 'b', fileKey: 'kb' }]] });
    await service.run(NOW);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **Step 2: Run, expect failure**, then **Step 3: write the service**

```ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { PURGE_BATCH, PURGE_INACTIVE_DAYS } from '../chat.constants';
import { ChatFileStorage } from './chat-file-storage';

const MAX_BATCHES = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Nightly: a file goes when its message was deleted by the sender, or when
 * NEITHER student of its conversation has opened the app for 30 days. The
 * message row and any report snapshot (text) stay; the client shows
 * «Fayl o'chirilgan». A removal that fails leaves the row for tomorrow.
 */
@Injectable()
export class ChatMediaPurgeService {
  private readonly logger = new Logger(ChatMediaPurgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ChatFileStorage,
  ) {}

  @Cron('0 0 3 * * *', { timeZone: 'Asia/Tashkent' })
  async run(now: Date = new Date()): Promise<void> {
    if (!this.storage.enabled) return;
    try {
      for (let i = 0; i < MAX_BATCHES; i++) {
        const { purged } = await this.purgeBatch(now);
        if (purged === 0) break;
      }
    } catch (err) {
      this.logger.warn(
        `Chat media purge failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    }
  }

  async purgeBatch(
    now: Date = new Date(),
  ): Promise<{ purged: number; failed: number }> {
    const cutoff = new Date(now.getTime() - PURGE_INACTIVE_DAYS * DAY_MS);
    const rows = await this.prisma.$queryRaw<{ id: string; fileKey: string }[]>`
      SELECT m."id", m."fileKey"
      FROM "ChatMessage" m
      JOIN "ChatConversation" c ON c."id" = m."conversationId"
      WHERE m."fileKey" IS NOT NULL
        AND m."mediaPurgedAt" IS NULL
        AND (
          m."deletedAt" IS NOT NULL
          OR NOT EXISTS (
            SELECT 1 FROM "StudentAppSession" s
            WHERE s."studentId" IN (c."studentLowId", c."studentHighId")
              AND s."lastSeenAt" >= ${cutoff}
          )
        )
      ORDER BY m."createdAt"
      LIMIT ${PURGE_BATCH}`;
    let purged = 0;
    let failed = 0;
    for (const row of rows) {
      if (await this.storage.remove(row.fileKey)) {
        await this.prisma.chatMessage.update({
          where: { id: row.id },
          data: { mediaPurgedAt: now },
        });
        purged += 1;
      } else {
        failed += 1;
      }
    }
    return { purged, failed };
  }
}
```

Add `ChatMediaPurgeService` to the `providers` of `chat.module.ts`.

- [ ] **Step 4: Run and commit**

Run: `npx jest src/chat/media && npm run typecheck` (sequentially). Expected: PASS.

```bash
npx prettier --write src/chat
git add server/src/chat
git commit -m "feat(chat): nightly purge of deleted and abandoned chat files"
```

---

### Task 6: Reports, CEO review, ban

**Files:**
- Create: `server/src/chat/reports/chat-reports.service.ts`, `chat-ban.service.ts`, `server/src/chat/chat-admin.controller.ts`
- Modify: `server/src/chat/dto/chat.dto.ts`, `server/src/chat/chat.controller.ts`, `server/src/chat/chat.module.ts`
- Test: `server/src/chat/reports/chat-reports.service.spec.ts`, `chat-ban.service.spec.ts`, `server/src/chat/chat-admin.controller.spec.ts`

**Interfaces:**
- Consumes: `ChatConversationsService.mine`, `NotificationsGateway.sendToUser`, `EntityHistoryService.recordUpdate` (global; params `entityType`, `entityId`, `changedById`, `companyId`, `tx`, `oldValues`, `newValues`).
- Produces:
  - `ChatReportsService.create(me, companyId, dto: { conversationId: string; reason: string }): Promise<{ id: string; status: 'OPEN' }>` (student)
  - `ChatReportsService.list(companyId, q: { status?; cursor?; limit? })`, `.get(companyId, id)`, `.resolve(companyId, actorId, id, dto: { outcome: 'RESOLVED' | 'DISMISSED'; note?: string; banReported?: boolean })` (CEO)
  - `ChatBanService.ban(studentId, companyId, actorId)`, `.unban(studentId, companyId, actorId)` — idempotent, return `{ chatBannedAt: string | null }`
  - Routes: `POST /chat/report` (student); CEO: `GET /chat/admin/reports`, `GET /chat/admin/reports/:id`, `PATCH /chat/admin/reports/:id`, `POST /chat/admin/students/:studentId/ban`, `POST /chat/admin/students/:studentId/unban`.

- [ ] **Step 1: DTOs**

Add to `dto/chat.dto.ts` (import `IsUUID`, `IsBoolean`, `IsIn` from class-validator, `ChatReportStatus` from `@prisma/client`):

```ts
export class CreateReportDto {
  @IsUUID()
  conversationId!: string;

  @Transform(trim)
  @IsString()
  @MinLength(3, { message: 'Shikoyat sababini yozing' })
  @MaxLength(500)
  reason!: string;
}

export class ListReportsQueryDto {
  @IsOptional()
  @IsEnum(ChatReportStatus)
  status?: ChatReportStatus;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class ResolveReportDto {
  @IsIn(['RESOLVED', 'DISMISSED'])
  outcome!: 'RESOLVED' | 'DISMISSED';

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsBoolean()
  banReported?: boolean;
}
```

- [ ] **Step 2: Write the failing reports test**

`chat-reports.service.spec.ts`:

```ts
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ChatReportsService } from './chat-reports.service';

const T = (s: string) => new Date(`2026-10-25T${s}Z`);

function make(o: { member?: boolean; openReport?: boolean; updated?: number } = {}) {
  const prisma = {
    chatReport: {
      findFirst: jest.fn().mockResolvedValue(o.openReport ? { id: 'r0' } : null),
      create: jest.fn().mockResolvedValue({ id: 'r1', status: 'OPEN' }),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: o.updated ?? 1 }),
    },
    chatMessage: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'm2', senderId: 2, kind: 'TEXT', text: 'ikkinchi', fileKey: null, deletedAt: null, createdAt: T('08:01:00') },
        { id: 'm1', senderId: 1, kind: 'IMAGE', text: null, fileKey: 'k', deletedAt: T('08:05:00'), createdAt: T('08:00:00') },
      ]),
    },
    student: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const conversations = {
    mine: o.member === false
      ? jest.fn().mockRejectedValue(new NotFoundException('Suhbat topilmadi'))
      : jest.fn().mockResolvedValue({ c: { id: 'c1' }, peerId: 2 }),
  };
  const ban = { ban: jest.fn().mockResolvedValue({ chatBannedAt: 'x' }) };
  return { service: new ChatReportsService(prisma as never, conversations as never, ban as never), prisma, ban };
}

describe('ChatReportsService.create', () => {
  it('keeps a text copy of the last 50 messages, oldest first, with deleted flags and no file keys', async () => {
    const { service, prisma } = make();
    await service.create(1, 7, { conversationId: 'c1', reason: 'Haqorat' });
    const findArgs = prisma.chatMessage.findMany.mock.calls[0][0];
    expect(findArgs.where).toEqual({ conversationId: 'c1' }); // deleted ones too: that is the evidence
    expect(findArgs.take).toBe(50);
    const data = prisma.chatReport.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ companyId: 7, reporterId: 1, reportedId: 2, conversationId: 'c1', reason: 'Haqorat' });
    expect(data.snapshot).toEqual([
      { id: 'm1', senderId: 1, kind: 'IMAGE', text: null, hasFile: true, deleted: true, createdAt: '2026-10-25T08:00:00.000Z' },
      { id: 'm2', senderId: 2, kind: 'TEXT', text: 'ikkinchi', hasFile: false, deleted: false, createdAt: '2026-10-25T08:01:00.000Z' },
    ]);
  });

  it('404s for a conversation that is not the reporter\'s', async () => {
    await expect(make({ member: false }).service.create(1, 7, { conversationId: 'c1', reason: 'xxx' })).rejects.toThrow(NotFoundException);
  });

  it('allows one open report per reporter and reported', async () => {
    await expect(make({ openReport: true }).service.create(1, 7, { conversationId: 'c1', reason: 'xxx' })).rejects.toThrow(
      new ConflictException('Shikoyat allaqachon yuborilgan'),
    );
  });
});

describe('ChatReportsService.resolve', () => {
  it('closes only an open report of this company and may ban the reported student', async () => {
    const { service, prisma, ban } = make();
    prisma.chatReport.findUnique.mockResolvedValue({ id: 'r1', reportedId: 2, companyId: 7 });
    await service.resolve(7, 99, 'r1', { outcome: 'RESOLVED', banReported: true, note: 'Ogohlantirildi' });
    expect(prisma.chatReport.updateMany).toHaveBeenCalledWith({
      where: { id: 'r1', companyId: 7, status: 'OPEN' },
      data: expect.objectContaining({ status: 'RESOLVED', resolvedById: 99, resolutionNote: 'Ogohlantirildi' }),
    });
    expect(ban.ban).toHaveBeenCalledWith(2, 7, 99);
  });

  it('is a 409 when the report is already closed, and bans nobody', async () => {
    const { service, prisma, ban } = make({ updated: 0 });
    prisma.chatReport.findUnique.mockResolvedValue({ id: 'r1', reportedId: 2, companyId: 7 });
    await expect(service.resolve(7, 99, 'r1', { outcome: 'DISMISSED', banReported: true })).rejects.toThrow(ConflictException);
    expect(ban.ban).not.toHaveBeenCalled();
  });

  it('is a 404 for a report of another company', async () => {
    const { service, prisma } = make();
    prisma.chatReport.findUnique.mockResolvedValue({ id: 'r1', reportedId: 2, companyId: 8 });
    await expect(service.resolve(7, 99, 'r1', { outcome: 'RESOLVED' })).rejects.toThrow(NotFoundException);
  });
});
```

- [ ] **Step 3: Run, expect failure**, then **Step 4: write the services**

`chat-reports.service.ts`:

```ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { REPORT_DUPLICATE_MESSAGE, REPORT_SNAPSHOT_SIZE } from '../chat.constants';
import { ChatConversationsService } from '../conversations/chat-conversations.service';
import { ChatBanService } from './chat-ban.service';

const LIST_DEFAULT = 20;

@Injectable()
export class ChatReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ChatConversationsService,
    private readonly ban: ChatBanService,
  ) {}

  /**
   * Any member may report, locked or banned too (reading and reporting are
   * never closed). The copy is TEXT: it survives the sender deleting the
   * message and the nightly file purge.
   */
  async create(
    me: number,
    companyId: number,
    dto: { conversationId: string; reason: string },
  ): Promise<{ id: string; status: 'OPEN' }> {
    const { peerId } = await this.conversations.mine(me, dto.conversationId);
    const open = await this.prisma.chatReport.findFirst({
      where: { reporterId: me, reportedId: peerId, status: 'OPEN' },
      select: { id: true },
    });
    if (open) throw new ConflictException(REPORT_DUPLICATE_MESSAGE);

    const latest = await this.prisma.chatMessage.findMany({
      where: { conversationId: dto.conversationId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: REPORT_SNAPSHOT_SIZE,
    });
    const snapshot = latest.reverse().map((m) => ({
      id: m.id,
      senderId: m.senderId,
      kind: m.kind,
      text: m.text,
      hasFile: m.fileKey != null,
      deleted: m.deletedAt != null,
      createdAt: m.createdAt.toISOString(),
    }));
    const row = await this.prisma.chatReport.create({
      data: {
        companyId,
        reporterId: me,
        reportedId: peerId,
        conversationId: dto.conversationId,
        reason: dto.reason,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
      },
    });
    return { id: row.id, status: 'OPEN' };
  }

  private async names(ids: number[]) {
    const rows = await this.prisma.student.findMany({
      where: { id: { in: ids } },
      select: { id: true, firstName: true, lastName: true, username: true, chatBannedAt: true },
    });
    return new Map(rows.map((s) => [s.id, s]));
  }

  private person(map: Map<number, { id: number; firstName: string; lastName: string; username: string | null; chatBannedAt: Date | null }>, id: number) {
    const s = map.get(id);
    return {
      id,
      name: s ? `${s.firstName} ${s.lastName}`.trim() : "O'chirilgan o'quvchi",
      username: s?.username ?? null,
      chatBannedAt: s?.chatBannedAt?.toISOString() ?? null,
    };
  }

  async list(
    companyId: number,
    q: { status?: 'OPEN' | 'RESOLVED' | 'DISMISSED'; cursor?: string; limit?: number },
  ) {
    const limit = q.limit ?? LIST_DEFAULT;
    const rows = await this.prisma.chatReport.findMany({
      where: { companyId, ...(q.status && { status: q.status }) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(q.cursor && { cursor: { id: q.cursor }, skip: 1 }),
      select: {
        id: true, status: true, reason: true, createdAt: true,
        reporterId: true, reportedId: true, conversationId: true,
      },
    });
    const page = rows.slice(0, limit);
    const names = await this.names(page.flatMap((r) => [r.reporterId, r.reportedId]));
    return {
      data: page.map((r) => ({
        id: r.id,
        status: r.status,
        reason: r.reason,
        createdAt: r.createdAt.toISOString(),
        conversationId: r.conversationId,
        reporter: this.person(names, r.reporterId),
        reported: this.person(names, r.reportedId),
      })),
      nextCursor: rows.length > limit ? page[page.length - 1].id : null,
    };
  }

  async get(companyId: number, id: string) {
    const r = await this.prisma.chatReport.findUnique({ where: { id } });
    if (!r || r.companyId !== companyId) {
      throw new NotFoundException('Shikoyat topilmadi');
    }
    const names = await this.names([r.reporterId, r.reportedId]);
    return {
      id: r.id,
      status: r.status,
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
      resolutionNote: r.resolutionNote,
      conversationId: r.conversationId,
      reporter: this.person(names, r.reporterId),
      reported: this.person(names, r.reportedId),
      snapshot: r.snapshot,
    };
  }

  async resolve(
    companyId: number,
    actorId: number,
    id: string,
    dto: { outcome: 'RESOLVED' | 'DISMISSED'; note?: string; banReported?: boolean },
  ) {
    const r = await this.prisma.chatReport.findUnique({ where: { id } });
    if (!r || r.companyId !== companyId) {
      throw new NotFoundException('Shikoyat topilmadi');
    }
    const { count } = await this.prisma.chatReport.updateMany({
      where: { id, companyId, status: 'OPEN' },
      data: {
        status: dto.outcome,
        resolvedAt: new Date(),
        resolvedById: actorId,
        resolutionNote: dto.note ?? null,
      },
    });
    if (count === 0) {
      throw new ConflictException('Shikoyat allaqachon ko\'rib chiqilgan');
    }
    if (dto.banReported) await this.ban.ban(r.reportedId, companyId, actorId);
    return this.get(companyId, id);
  }
}
```

(`get` after the ban reflects `chatBannedAt`. In the test the second `findUnique` returns the same mock row — also give the mock a `snapshot`/dates only if `get` needs them; the test's resolve case may mock `findUnique` with the fields `get` reads, or call `.resolves` loosely. Adjust the test mocks, not the service.)

`chat-ban.service.spec.ts`:

```ts
import { NotFoundException } from '@nestjs/common';
import { ChatBanService } from './chat-ban.service';

function make(student: object | null = { id: 5, userId: 55, chatBannedAt: null }) {
  const tx = { student: { update: jest.fn().mockResolvedValue({}) } };
  const prisma = {
    student: { findFirst: jest.fn().mockResolvedValue(student) },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const history = { recordUpdate: jest.fn().mockResolvedValue(undefined) };
  const gateway = { sendToUser: jest.fn() };
  return { service: new ChatBanService(prisma as never, history as never, gateway as never), prisma, tx, history, gateway };
}

describe('ChatBanService', () => {
  it('sets chatBannedAt, writes Student history in the same transaction and tells the student', async () => {
    const { service, tx, history, gateway } = make();
    const out = await service.ban(5, 7, 99);
    expect(tx.student.update).toHaveBeenCalledWith({ where: { id: 5 }, data: { chatBannedAt: expect.any(Date) } });
    expect(history.recordUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ tx, entityType: 'Student', oldValues: { chatBannedAt: null }, newValues: { chatBannedAt: expect.any(Date) } }),
    );
    expect(gateway.sendToUser).toHaveBeenCalledWith(55, { type: 'chat.access' });
    expect(out.chatBannedAt).toEqual(expect.any(String));
  });

  it('is idempotent', async () => {
    const at = new Date('2026-10-25T08:00:00Z');
    const { service, tx } = make({ id: 5, userId: 55, chatBannedAt: at });
    expect(await service.ban(5, 7, 99)).toEqual({ chatBannedAt: at.toISOString() });
    expect(tx.student.update).not.toHaveBeenCalled();
  });

  it('unban clears it', async () => {
    const { service, tx } = make({ id: 5, userId: 55, chatBannedAt: new Date() });
    expect(await service.unban(5, 7, 99)).toEqual({ chatBannedAt: null });
    expect(tx.student.update).toHaveBeenCalledWith({ where: { id: 5 }, data: { chatBannedAt: null } });
  });

  it('404s for a student outside the company', async () => {
    await expect(make(null).service.ban(5, 7, 99)).rejects.toThrow(NotFoundException);
  });
});
```

`chat-ban.service.ts` (`recordUpdate` takes `entityType`, `entityId`, `changedById`, `companyId`, `tx`, `oldValues`, `newValues` and no action label; the diff stores `chatBannedAt` from null to the time and back):

```ts
@Injectable()
export class ChatBanService {
  private readonly logger = new Logger(ChatBanService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly history: EntityHistoryService,
    private readonly gateway: NotificationsGateway,
  ) {}

  ban(studentId: number, companyId: number, actorId: number) {
    return this.set(studentId, companyId, actorId, true);
  }
  unban(studentId: number, companyId: number, actorId: number) {
    return this.set(studentId, companyId, actorId, false);
  }

  private async set(studentId: number, companyId: number, actorId: number, banned: boolean) {
    const s = await this.prisma.student.findFirst({
      where: { id: studentId, companyId, deletedAt: null },
      select: { id: true, userId: true, chatBannedAt: true },
    });
    if (!s) throw new NotFoundException("O'quvchi topilmadi");
    if (banned === (s.chatBannedAt != null)) {
      return { chatBannedAt: s.chatBannedAt?.toISOString() ?? null };
    }
    const at = banned ? new Date() : null;
    await this.prisma.$transaction(async (tx) => {
      await tx.student.update({ where: { id: studentId }, data: { chatBannedAt: at } });
      await this.history.recordUpdate({
        tx,
        entityType: 'Student',
        entityId: studentId,
        changedById: actorId,
        companyId,
        oldValues: { chatBannedAt: s.chatBannedAt },
        newValues: { chatBannedAt: at },
      });
    });
    try {
      if (s.userId) this.gateway.sendToUser(s.userId, { type: 'chat.access' });
    } catch (err) {
      this.logger.warn(`chat.access push to student ${studentId} failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
    return { chatBannedAt: at?.toISOString() ?? null };
  }
}
```

- [ ] **Step 5: Controllers**

Student side — in `chat.controller.ts` inject `ChatReportsService` and add:

```ts
@Post('report')
report(
  @CurrentUser('studentId') studentId: number,
  @CurrentUser('companyId') companyId: number,
  @Body() dto: CreateReportDto,
) {
  return this.reports.create(studentId, companyId, dto);
}
```

CEO side — `chat-admin.controller.ts`:

```ts
import { Body, Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators';
import { CeoOnly } from '../common/permissions/access.decorators';
import { ListReportsQueryDto, ResolveReportDto } from './dto/chat.dto';
import { ChatBanService } from './reports/chat-ban.service';
import { ChatReportsService } from './reports/chat-reports.service';

/**
 * The CEO's side of the student chat: reports and the ban. CEO identity, never
 * a capability (spec 2026-10-25). The student chat switch does not gate it —
 * the CEO can review after the chat was turned off.
 */
@Controller('chat/admin')
@CeoOnly()
export class ChatAdminController {
  constructor(
    private readonly reports: ChatReportsService,
    private readonly ban: ChatBanService,
  ) {}

  @Get('reports')
  list(@CurrentUser('companyId') companyId: number, @Query() q: ListReportsQueryDto) {
    return this.reports.list(companyId, q);
  }

  @Get('reports/:id')
  get(@CurrentUser('companyId') companyId: number, @Param('id', ParseUUIDPipe) id: string) {
    return this.reports.get(companyId, id);
  }

  @Patch('reports/:id')
  resolve(
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveReportDto,
  ) {
    return this.reports.resolve(companyId, userId, id, dto);
  }

  @Post('students/:studentId/ban')
  banStudent(
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @Param('studentId', ParseIntPipe) studentId: number,
  ) {
    return this.ban.ban(studentId, companyId, userId);
  }

  @Post('students/:studentId/unban')
  unbanStudent(
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @Param('studentId', ParseIntPipe) studentId: number,
  ) {
    return this.ban.unban(studentId, companyId, userId);
  }
}
```

`chat-admin.controller.spec.ts` (mirror an existing `@CeoOnly()` controller spec, e.g. `src/lesson-ratings/*controller.spec.ts`, for the helper that asserts a CEO-only marker): assert `routeAccess(ChatAdminController, m)` is the CEO kind for each of the five methods. If `@CeoOnly()` cannot decorate a class in this repo, put it on each method instead.

`chat.module.ts`: add `ChatAdminController` to `controllers`; `ChatReportsService`, `ChatBanService` to `providers`.

- [ ] **Step 6: Run and commit**

Run: `npx jest src/chat && npm run typecheck && npx eslint src/chat --quiet` (sequentially). Expected: PASS.

```bash
npx prettier --write src/chat
git add server/src/chat
git commit -m "feat(chat): student reports, the CEO's review and ban"
```

---

### Task 7: Manifests, snapshot, ADR, docs

**Files:**
- Modify: `server/src/common/auth/branch-route-policy.ts`, `server/src/common/permissions/route-access.snapshot.json`
- Create: `docs/adr/<next free number>-oquvchilar-chati-telegram-xabari-darhol.md`; modify `docs/adr/README.md`
- Modify: `server/CLAUDE.md`

- [ ] **Step 1: Run the manifest specs, expect failures naming the routes**

Run: `npx jest src/common/auth src/common/permissions`
Expected: FAIL listing the new routes: student — `POST /chat/conversations/:id/files`, `GET /chat/messages/:id/file`, `POST /chat/report`; CEO — `GET /chat/admin/reports`, `GET /chat/admin/reports/:id`, `PATCH /chat/admin/reports/:id`, `POST /chat/admin/students/:studentId/ban`, `POST /chat/admin/students/:studentId/unban`.

- [ ] **Step 2: Policy entries**

In `branch-route-policy.ts`:
- Add the three student routes to the existing `SELF` group written for the chat in Plan A (same reason text still true: the caller is the subject, conversation/message ids are membership-checked → 404).
- For the five CEO routes copy the policy kind and reason style of the existing CEO-only routes (`GET /lesson-ratings/summary` and `PATCH /lesson-ratings/settings` — find them with `grep -n "lesson-ratings" src/common/auth/branch-route-policy.ts`): reads and writes of company-wide data with no branch dimension, CEO identity only. Do not invent a new policy kind.

- [ ] **Step 3: Snapshot rows**

For each new route add a row to `route-access.snapshot.json` in sorted position: the three student routes `["Student"]`; the five CEO routes with the same value the existing `@CeoOnly()` routes have in that file (`grep -n '"GET /lesson-ratings/summary"' -A2 src/common/permissions/route-access.snapshot.json`). Verify with `git diff --stat src/common/permissions/route-access.snapshot.json` that only lines were ADDED. Do not use a sorting script (it reorders existing rows).

Run again: `npx jest src/common/auth src/common/permissions` → PASS.

- [ ] **Step 4: ADR**

`docs/adr/README.md` lists the next number (0126 when this plan was written; after pulling `main` re-check and renumber with `git mv` before pushing). Create `docs/adr/<n>-oquvchilar-chati-telegram-xabari-darhol.md` in Uzbek, in the format of ADR-0124 (Holati / Sana / Bog'liq / Kontekst / Qaror / Ko'rib chiqilgan muqobillar / Oqibatlari), with this content:

- **Bog'liq:** ADR-0025, ADR-0066, `docs/superpowers/specs/2026-10-25-oquvchilar-chati-design.md`, `server/src/chat/notify/`.
- **Kontekst:** ADR-0025 shaxsiy Telegram xabarlarini 20:00 dagi bitta xabarga jamlaydi. O'quvchilar chati uchun bu mantiqsiz: «yangi xabar» kechgacha kutsa, suhbat o'ladi. CEO talabi: xabar kelsa darhol, tugma bilan Mini App'da chatni ochsin.
- **Qaror:** 1) «Yangi xabar» Telegram xabari ADR-0025 ning «darhol yuboriladigan» ro'yxatiga qo'shiladi; `SmsService.sendToStudent` orqali ketadi (yangi `.sendMessage(` yo'q). 2) Mazmun Telegramga chiqmaydi — faqat kim yozgani. 3) Bir suhbatdan o'qilmaguncha bitta xabar (`ChatNotifyState.notifiedAt`; o'qilgach yana mumkin). 4) 22:00–08:00 oralig'ida yuborilmaydi, 08:00 da bir marta (`ChatNotifyService.sendMorning`) — faqat hali o'qilmagan bo'lsa. 5) Uzilgan chat (ADR-0066) o'tkazib yuborilmaydi. 6) Tugma `web_app`: `TELEGRAM_MINI_APP_URL?next=/portal/chat/<id>`.
- **Muqobillar:** 20:00 jamlanmasi (chat o'ladi, rad); har xabarga Telegram (spam, rad); mazmunni ko'rsatish (maxfiylik, rad).
- **Oqibatlari:** har bildirishnoma bitta `SmsMessage` va Student tarixi qatorini yozadi; bir lahzada kelgan ikki xabar ikkita Telegram xabar berishi mumkin (poyga qabul qilingan).

Add the ADR's line to the README index (same one-line format as the neighbours).

- [ ] **Step 5: `server/CLAUDE.md`**

(English, short.) In the «Student chat» section replace the last bullet («Media, reports, the CEO's ban, Telegram and the bell arrive with Plan B…») with:

```markdown
- **Media (Plan B).** Images (jpg/png/webp ≤ 5 MB) and voice (ogg/webm/m4a ≤ 120 s, ≤ 2 MB) go through `POST /chat/conversations/:id/files` into the private bucket `R2_CHAT_BUCKET_NAME` (off without it → 503); the type is read from the bytes (`chat/media/chat-file-rules.ts` reuses `checkTaskFile`). A message exposes `file { mime, sizeBytes, durationSec, purged }`, never the key; `GET /chat/messages/:id/file` returns a 10-minute signed link to a member (410 once purged). Text and media share `prepareSend` (every check) and `commitMessage`.
- **Purge.** `ChatMediaPurgeService` (03:00 Tashkent) removes the file of a message its sender deleted, or of a conversation in which neither student had an app session for 30 days, and stamps `mediaPurgedAt`. Text and report snapshots stay.
- **Reports and ban.** `POST /chat/report` (any member, locked or banned too) keeps a TEXT copy of the last 50 messages (deleted ones flagged); one OPEN report per reporter and reported. The CEO reviews on `/chat/admin/reports*` (`@CeoOnly()`), may ban (`Student.chatBannedAt`, Student history, live `chat.access` event) and unban; a banned student still reads and reports.
- **Notifications.** After the commit, `ChatNotifyService` writes one unread `CHAT_MESSAGE` bell row per conversation (group `system`, folded by `groupKey = CHAT_MESSAGE:<conversationId>`, closed by `markRead`), pushes it and sends ONE Telegram notice per conversation until the recipient reads it (ADR-0126: instant, `web_app` button to the Mini App chat, nothing 22:00–08:00, held notices go at 08:00). Content never appears in any notice. It never throws.
```

In the «Instant by design» list of «Telegram digest» append: `, the student chat «yangi xabar» notice (src/chat/notify/, ADR-0126 — through SmsService, one per unread conversation, night held until 08:00)`.

- [ ] **Step 6: Full verification and commit**

Run, one after the other: `npm run typecheck`, `npx jest` (the whole server suite — the active-student policy spec and the route manifest are repo-wide), `npx eslint src/chat --quiet`.
Expected: all green.

```bash
npx prettier --write src/common/auth/branch-route-policy.ts
git add server/src/common server/CLAUDE.md docs/adr
git commit -m "feat(chat): route manifests, access snapshot, ADR and docs for media, reports and notices"
```

---

## Self-review (spec coverage for this plan)

- §2 files: bucket, size/type/duration limits, key layout, signed link, nightly purge (both conditions), «Fayl o'chirilgan» (`purged`, 410): Tasks 1, 2, 4, 5. Report snapshot of 50 messages kept as text: Task 6.
- §3 routes: `POST …/files`, `POST /chat/report`, CEO `GET/PATCH reports`, ban/unban: Tasks 4, 6. Events `chat.message`/`chat.read` exist (Plan A); `chat.access` on ban: Task 6 (practice-driven `chat.access` stays for Plan C: clients refetch `/chat/access`).
- §3 notifications: bell `CHAT_MESSAGE` folded per conversation, push, Telegram instant with Mini App button, one per unread conversation, night held to 08:00, content never shown, ADR exception: Tasks 1, 3, 4, 7.
- Plan A review items: the «before enabling» list (batch `list()`, wildcard escape) is not in this plan on purpose; it is the first item of Plan C's pre-flight.
- Type names used across tasks: `MessageView.file`, `prepareSend`, `commitMessage`, `ChatFileStorage`, `ChatNotifyService.onMessage/onRead/sendMorning`, `ChatReportsService`, `ChatBanService` — each defined in the task that produces it and imported by name afterwards.
