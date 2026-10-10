# Joining a group through the bot needs an administrator's approval — design

**Date:** 2026-10-10
**Status:** decisions delegated by the CEO in chat («eng to'g'ri va muqobilini tanlab davom et», 10.10.2026); this document records the choices made on that authority.
**Builds on:** ADR-0017 (every student leaves a lead), ADR-0033 (a card is born with its account), ADR-0054 («Dars bo'ldimi?» — the system-task pattern this reuses), ADR-0066 (a chat can refuse the bot), ADR-0074 / ADR-0078 (tasks and their Telegram notices), ADR-0076 (bell rows close themselves), ADR-0079 (capabilities).
**Decision record:** ADR-0080 (number checked against `docs/adr/README.md` at merge time), written in the same PR.

## 1. Why

A student joins a group through one of two bot links: the group card's QR code and «Havola nusxalash» (`student_<branch>_group_<group>`), or the students page's «Havola olish» (`student_<branch>`, where the person picks a teacher and a group). Neither link carries a signature or an expiry. Whoever holds it can register, and registration is instant: `registerStudentFromTelegram` writes the card, the enrollment, the sign-in account (the password goes to the chat), the join month's charge (`STUDENT_SELF_ENROLLED`) and a CONVERTED lead. Nobody looks at it.

Production, read-only, 10.10.2026:

- ~200 bot registrations a month (September 212, the last 30 days 215); the busiest day 28 (29.08). Two branches, so an administrator would see about 3–4 requests a day, more at the start of a month.
- August–October: 35 bot-registered students never attended and never paid. 9 of them were already taken out of their group but still carry a debt of 670 433 so'm in total, and still sit in the debtor lists. 6 are a second card for a person already in the system (same first and last name).
- 1 enrollment was written into a group after it closed: the bot does not read the group's status.

## 2. Decisions

| # | Question | Decision | Rejected alternative and why |
|---|---|---|---|
| D1 | How to stop a shared link | Every bot sign-up becomes a **request**; an administrator approves or rejects it. Links and printed QR codes keep working. | Signed links with a 3-day expiry (ADR-0029 style): a link still works for anyone during its life. Personal one-time links: an administrator must create every card by hand first, which removes the point of self-registration. |
| D2 | What exists while a request waits | **Nothing but the request**: no card, no enrollment, no account, no charge, no lead change. | Writing the card as «pending»: every list, report and charge would need to learn a new state. |
| D3 | Who decides | The branch's administrators, falling back to its directors, then the CEOs (`lessonTaskAssigneeIds`). The first to act takes it (`claimSystemTask`); the CEO and a Branch Director may always decide. Capability: `students.enroll`. | Teachers: they do not create cards or charges today. |
| D4 | Where it shows | A system task (`TaskKind.JOIN_REQUEST`) on «Topshiriqlar», its bell notice and its Telegram notice with «Ochish». The decision is made in the task's panel on the website. | Deciding with Telegram buttons: the bot's task buttons act through `TasksService` only, and approving writes a card and a charge; later. |
| D5 | If nobody decides | Task due the next working day 10:00 (reminder an hour before, «Muddati o'tdi» at it). After 24 hours the 21:00 report's «Diqqat» shows it. **After 7 days the request closes itself** and the person is told. **Never approved automatically.** | Auto-approve: defeats D1. Waiting for ever: the person never hears back. 3 days: too short over a holiday weekend. |
| D6 | When billing starts | **The approval day** (the enrollment's `startDate`, exactly as today's flow writes it at the moment it runs). | The request day: the person was not on any roster in between, so lessons before approval have no attendance. |
| D7 | May the administrator change the group | Yes, to another enrollable group of the same branch, before approving. This covers the branch link, where the person picks the group. | Approve, then transfer: a transfer moves money twice. |
| D8 | Rejection reason | Required, kept for staff. **The person never sees it**: their message is neutral. | Sending the reason: an internal note («begona odam») would reach a stranger. |
| D9 | A second request from the same chat | One open request per chat. A new one replaces the old (`REPLACED`), and the bot says so before the person starts. | Refusing the second: a person who picked the wrong group would be stuck until someone decides. |
| D10 | Escalation | The 21:00 report's «Diqqat» line, the same pattern as «Javobsiz darslar» (ADR-0054). | A separate director task after 2 working days: more moving parts for what the evening report already shows to the CEO and the directors. |

## 3. The bot side

The scene (`student-registration.scene.ts`) keeps every step: teacher → group (branch link only), first name, last name, own contact, photo, confirmation card. Only the «✅ Tasdiqlash» button changes.

1. **On entry**, as today: a chat that already has a live card is told «Siz allaqachon ro'yxatdan o'tgansiz!». New: a chat with a PENDING request is told «Sizda ko'rib chiqilayotgan so'rov bor: <guruh>. Yangisini yuborsangiz, avvalgisi bekor bo'ladi.» and the flow goes on.
2. **On «✅ Tasdiqlash»** the bot calls `StudentJoinRequestsService.create`. That method re-checks the phone (a live card holds it → the existing «Bu telefon raqam allaqachon tizimda…» reply, nothing written), the group (`ENROLLABLE_GROUP_STATUSES`, branch ACTIVE) and the chat (a live card → «Siz allaqachon…»). Then, in one Serializable transaction, it marks the chat's previous PENDING request `REPLACED` and closes its task, writes the new request and creates its task (§5.1). After the commit it emits the task's `task.assigned` (§5.2) and sends §9.1. The confirmation card's caption becomes «⏳ So'rov yuborildi». The photo now belongs to the request, so `/start`, `/cancel` and «Qayta kiritish» no longer delete it.
3. **Bundled fixes** (the same scene, the same PR):
   - Groups offered to the person, and the group in a group link, must have a status in `ENROLLABLE_GROUP_STATUSES` = `ACTIVE`, `FORMING`, `PAUSED`. This is the one rule the admin door (`student-enrollment.service.ts`) and lead conversion (`leads.service.ts`) already use, each with its own copy. The three move to one exported constant. A closed group's link answers «Bu guruhga hozir yozilib bo'lmaydi. Administrator bilan bog'laning.».
   - The teacher list (`loadTeachersForBranch`) filters `isActive: true, status: ACTIVE` besides `deletedAt: null`. A suspended or terminated teacher, and their groups, are no longer offered.

`registerStudentFromTelegram` is no longer called by the scene. It moves behind the approval (§6.1). Two changes only: its history rows carry the approving administrator as `changedById`, and its first transaction also takes the request (§6.1).

## 4. Data model

```prisma
enum StudentJoinRequestStatus {
  PENDING
  APPROVED
  REJECTED
  EXPIRED
  REPLACED
}

model StudentJoinRequest {
  id               String                   @id @default(uuid())
  companyId        Int
  branchId         Int
  groupId          String                   // the group the person asked for
  chatId           String                   // the Telegram chat that asked
  telegramUsername String?                  // ctx.from.username, for the panel
  firstName        String
  lastName         String
  phone            String                   // 9 digits, the sender's own contact
  photo            String?                  // R2 URL; null once deleted (§6.2)
  status           StudentJoinRequestStatus @default(PENDING)
  taskId           String?                  @unique
  decidedById      Int?
  decidedAt        DateTime?
  rejectReason     String?
  approvedGroupId  String?                  // differs from groupId when changed (D7)
  studentId        Int?                     // the card the approval wrote
  createdAt        DateTime                 @default(now())

  @@index([status, createdAt])
  @@index([branchId, status])
}
```

Hand-written in the migration: a partial unique index `(chatId) WHERE status = 'PENDING'` (D9). `TaskKind` gets `JOIN_REQUEST`. The task's `sourceKey` is `join:<requestId>`.

## 5. The administrator's side

### 5.1 The task

`createJoinRequestTask` lives in `src/tasks/` (ADR-0074's single door) and is shaped like `createLessonTask`:

- `kind: JOIN_REQUEST`, `authorId: null` («Tizim»), `priority: HIGH` (not `URGENT`: a request at 23:00 waits for 08:00, ADR-0078);
- title «Yangi o'quvchi so'rovi: <Ism Familiya> → <guruh>»;
- `entityType: 'Group'`, `entityId: groupId`, so «Bog'liq» links to the group;
- assignees from `lessonTaskAssigneeIds(branchId)`;
- `dueAt` = next working day 10:00 (`nextWorkingDay`, `taskDueAt`, the branch's holidays skipped);
- `scheduleTaskOutbox` writes the reminder and the overdue notice (bell and Telegram).

`checkTransition` already treats every non-`MANUAL` kind as closed only by its source: assignees can start it, nobody can move it to DONE or edit it by hand.

### 5.2 Notices

After the commit the service emits `task.assigned` (`created: true`, actor `null`). The existing plan then gives every assignee:

- a bell row «Yangi topshiriq — Tizim sizga topshiriq berdi: «…»», which counts as waiting (ADR-0076);
- a Telegram notice with «Ochish» only — `stateButtons` gives a non-`MANUAL` task no state buttons.

`LESSON_QUESTION` stays the one kind kept off Telegram. Closing the task (§6) emits `task.status.changed` to DONE, so `NotificationResolverService` closes the bell rows.

### 5.3 The panel

In the task sheet (`/tasks?task=<id>`) a `JOIN_REQUEST` task shows a «So'rov» block instead of the generic status buttons, the way `LESSON_QUESTION` shows «Bo'ldi / Bo'lmadi»:

- the photo; first and last name; phone `+998 XX XXX XX XX`; Telegram `@username` (a `t.me` link) when known; the time of the request;
- «Guruh» — a select of the branch's enrollable groups, the requested one preselected (D7);
- notes the server computes:
  - **Lid** (information): the latest lead with this phone (`phone` or `extraPhone`): its date, source and stage («03.10 · Instagram forma · Aloqaga chiqilgan»);
  - **Arxivdagi o'quvchi** (warning): an archived card with this phone, with its id. Restoring that card is usually right; approving makes a second one;
  - **Guruhda shu ismli o'quvchi bor** (warning): an ACTIVE enrollment of the chosen group whose student has the same first and last name (case-insensitive);
  - **Guruhga yozilib bo'lmaydi** (error): the chosen group is no longer enrollable. «Tasdiqlash» stays off until another group is chosen;
- «Tasdiqlash» and «Rad etish». «Rad etish» opens a required reason (1–500 characters).

A decided request shows one line instead: «Tasdiqlandi — #11345 (Dilnoza A., 10.10 14:05)» with a link to the card, or «Rad etildi: <sabab>», «Muddati o'tdi», «Yangi so'rov bilan almashtirildi».

### 5.4 Endpoints

`StudentJoinRequestsController`, every route `@Can('students.enroll')`, branch-checked against `request.branchId` (`assertCallerInBranch`):

- `GET /student-join-requests/by-task/:taskId` → the request, its notes and the enrollable groups;
- `POST /student-join-requests/:id/approve` `{ groupId? }` → `{ status, studentId, delivered }`;
- `POST /student-join-requests/:id/reject` `{ reason }` → `{ status }`.

A decision on a request that is no longer PENDING → 409 «Bu so'rov allaqachon ko'rib chiqilgan». An assignee who lost the claim → 409 «Bu so'rovni <ism> oldi» (`assertMayAnswer`'s rule: the CEO and a Branch Director always pass).

## 6. What each outcome does

### 6.1 Approve

Re-checked first: the request is PENDING; the branch is ACTIVE; the chosen group is the branch's and enrollable; no live card holds the phone; no live card holds the chat. A failed check → 400 with its reason; nothing is written.

Then `registerStudentFromTelegram` runs with the request's data, the chosen group and the chat id. Its first transaction (card + lead) also flips the request to `APPROVED` (`updateMany … where status = PENDING`, count 0 → 409) and records `decidedById`, `decidedAt`, `approvedGroupId`, `studentId`. A double click therefore writes one card. Everything after that is today's flow: enrollment with `startDate` = today (D6), state log, the join month's charge, history, the account. Then:

- the task closes (`AUTO_CLOSED`, `reason: JOIN_APPROVED`, the approver claims it), and `task.status.changed` is emitted;
- the bot sends §9.2 to `chatId`. A failed send does not undo anything: `delivered: false`, and the toast says «Xabar Telegram'ga yetmadi — o'quvchi parolni botdagi «Parolni tiklash» orqali oladi». ADR-0066 marks the chat.

The lead turns CONVERTED here and no earlier (`recordSelfSignupOrigin`, unchanged).

### 6.2 Reject

The request becomes `REJECTED` with its reason, the task closes (`reason: JOIN_REJECTED`), the photo is deleted from R2 (`photo = null`) and the bot sends §9.3. Nothing else is written: no card, no lead.

### 6.3 Expire

`JoinRequestExpiryCron` runs daily at 09:00 Asia/Tashkent, Sundays included, and closes PENDING requests older than 7 days in the same way: `EXPIRED`, task closed (`reason: JOIN_EXPIRED`, system actor), photo deleted, §9.4 sent. One request failing is logged and the run continues.

### 6.4 Replace

As §6.2, but with status `REPLACED`, `reason: JOIN_REPLACED`, and no bot message: the bot already told the person on entry.

Until a card exists there is no Student or Group history row: the request row and its task's events are the trail.

## 7. A request nobody answers

- The task's due date and its two notices (§5.1).
- The 21:00 group report adds «Javobsiz o'quvchi so'rovlari (1 kundan ortiq): N ta — «Topshiriqlar»da javob bering» to «Diqqat» (PENDING, `createdAt` older than 24 hours, the report's branch scope), which turns the day's light 🟡. This is D10's escalation.
- Day 7: §6.3. The person is never left without an answer and is never let in by silence.

## 8. Out of scope (later)

- Approving or rejecting from the Telegram notice.
- Showing «Tasdiq kutilmoqda: N» in the teacher's attendance form.
- A parent registering a second child from the same Telegram account: blocked today both by the chat check and by the one-card-per-phone rule; a typed child phone would need its own design.
- A lead for a person whose request expired.
- The 9 cards with leftover debt from §1: a money decision for the CEO, not part of this change.
- A switch to turn approval off: rolling back is reverting the deploy.

## 9. Bot texts

Tone per the approved style: bold emoji headline, «Hurmatli <Ism>!», key values bold, one thought per line, thanks at the end. `<Ism>` is the first name the person typed. The 📞 line is the branch's phone, else the company's (`loadContactPhone`), and is left out when neither has one.

### 9.1 Request received

```
✅ <b>So'rovingiz qabul qilindi</b>

Hurmatli <b>Dilnoza</b>!
Siz <b>A1 Standart 15:00</b> guruhiga yozilish uchun so'rov yubordingiz.

👨‍🏫 O'qituvchi: Madina Karimova
🕐 Dars vaqti: Toq kunlar | 15:00 – 16:30

Administrator so'rovingizni ko'rib chiqib, shu yerga xabar beradi. Odatda bu bir ish kuni ichida bo'ladi.
Rahmat!
```

### 9.2 Approved (with the photo, like today's success message; as text if the photo fails)

```
🎉 <b>Siz guruhga qabul qilindingiz!</b>

Hurmatli <b>Dilnoza</b>!
So'rovingiz tasdiqlandi.

📚 Guruh: <b>A1 Standart 15:00</b>
👨‍🏫 O'qituvchi: Madina Karimova
🕐 Dars vaqti: Toq kunlar | 15:00 – 16:30

🔐 <b>Shaxsiy kabinetingiz</b>
🌐 student.dafzentrum.uz
📱 Login: <b>90 123 45 67</b>
🔑 Parol: <b>k7Pq2xZa</b>

Darslarda ko'rishguncha!
```

### 9.3 Rejected

```
ℹ️ <b>So'rovingiz tasdiqlanmadi</b>

Hurmatli <b>Dilnoza</b>!
<b>A1 Standart 15:00</b> guruhiga yozilish bo'yicha so'rovingiz tasdiqlanmadi.

Savolingiz bo'lsa yoki bu xato deb o'ylasangiz, administrator bilan bog'laning:
📞 +998 90 000 00 00

Rahmat!
```

### 9.4 Expired

```
⏳ <b>So'rovingiz ko'rib chiqilmadi</b>

Hurmatli <b>Dilnoza</b>!
<b>A1 Standart 15:00</b> guruhiga yozilish bo'yicha so'rovingizni 7 kun ichida ko'rib chiqa olmadik. Uzr so'raymiz.

Iltimos, administrator bilan bog'laning — birga hal qilamiz:
📞 +998 90 000 00 00

Rahmat!
```

All four go from the main bot at once — an addition to ADR-0025's instant list (bot flows), recorded in ADR-0080; `direct-send.guard.spec.ts` gets the sender's file.

## 10. Testing

- `StudentJoinRequestsService`:
  - create re-checks phone, chat, group and branch, and writes nothing on a failure;
  - a second request replaces the first, its task closed in the same transaction;
  - approve writes exactly one card under a double click (count-0 → 409);
  - approve refuses a closed group, a taken phone and a taken chat with nothing written;
  - reject and expire delete the photo and write no card and no lead;
  - the claim rule matches «Dars bo'ldimi?».
- Notes: the lead, the archived card and the same name in the group, each found and each absent.
- Expiry cron: picks only PENDING rows past 7 days; one failure does not stop the run.
- The scene: «Tasdiqlash» creates a request and sends §9.1; it does not call `registerStudentFromTelegram`; a closed group's link is refused; an inactive teacher is not listed.
- Tasks: `JOIN_REQUEST` goes to Telegram with «Ochish» only and cannot be moved to DONE by hand.
- The 21:00 flag counts only requests older than 24 hours, in the report's scope.
- Controller: every route is `@Can('students.enroll')`; snapshot rows in `permission-routes.spec.ts`.
- The texts of §9 pinned by tests, like the balance notice's.
- Client:
  - the panel renders each note and each decided line;
  - «Tasdiqlash» is off while the chosen group is not enrollable;
  - «Rad etish» needs a reason.
- Browser check on the local backend: request from the bot → task → approve → card and the bot message.

## 11. Rollout

- One PR: migration, server, client, ADR-0080, the guide (`client/src/qollanma/kontent/` — the new-student and tasks pages) and a `yangiliklar.ts` entry. `server/CLAUDE.md` — the «Registration deep links» and «Tasks» sections; `client/CLAUDE.md` — the task panel.
- Server and client go out together: a server alone would create tasks that the old client cannot answer.
- From the deploy on, every bot sign-up waits for an administrator. Administrators should be told the same day; the yangiliklar entry does it in the product.
