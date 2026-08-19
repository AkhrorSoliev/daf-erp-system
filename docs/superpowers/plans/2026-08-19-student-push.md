# Student Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Qurilgan va bekor turgan push infratuzilmasini ishga solish — o'quvchi to'lov va dars o'zgarishlari haqida brauzerda ham, ilovada ham xabar olsin.

**Architecture:** Bitta yangi xizmat — `StudentNotifier` — o'quvchi raqamidan foydalanuvchi hisobini topib mavjud `PushService.sendToUser` ga uzatadi; u esa web-push va native Expo push'ga birga yuboradi. To'rtta mavjud listener'ga bittadan chaqiruv qo'shiladi. Telegram kodiga tegilmaydi — push uning yoniga qo'shiladi, o'rniga emas.

**Tech Stack:** NestJS, jest, Prisma; web tomonda Next.js + service worker; ilovada expo-notifications + expo-router.

**Spec:** `docs/superpowers/specs/2026-08-19-student-app-uch-ish-design.md`

## Global Constraints

- **Telegram yuborish mantig'i o'zgarmaydi.** Matnlari, shartlari, `SmsMessage` yozuvlari — hammasi hozirgicha qoladi. Push faqat qo'shiladi.
- **Push Telegram tekshiruvidan OLDIN turishi shart.** Mavjud listener'lar `telegramChatId` yo'q o'quvchini `continue`/`return` bilan butunlay o'tkazib yuboradi. Push o'sha tekshiruvdan keyin qo'yilsa, ilovasi bor lekin Telegrami yo'q o'quvchi hech qachon xabar olmaydi — bu tuzatishning yarmini bekor qiladi.
- **Push xatosi hech qachon yuqoridagi amalni buzmasligi kerak.** To'lov yozuvi push yuborilmagani uchun orqaga qaytmasligi shart. Har chaqiruv o'ralgan va yutilgan bo'ladi.
- **Yangi route qo'shilmaydi.** `POST/DELETE /notifications/devices` va `push/subscribe` allaqachon mavjud va route manifestida ro'yxatdan o'tgan.
- **Davomat voqeasi qamralmaydi.** U Telegram uchun ataylab o'chirilgan (`STUDENT_ATTENDANCE_NOTIFICATIONS_ENABLED`) — xabar juda ko'p bo'lgani uchun. Push'da ham qo'shilmaydi.
- Test: `cd server && npx jest <path>`.

## File Structure

| Fayl | Mas'uliyati |
|---|---|
| `server/src/notifications/student-notifier.service.ts` (yangi) | O'quvchi → foydalanuvchi → push; yagona kirish nuqtasi |
| `server/src/notifications/student-notifier.service.spec.ts` (yangi) | Uning testi |
| `server/src/notifications/push.service.ts` (o'zgartiriladi) | Payload'ga `appRoute` qo'shiladi |
| `server/src/notifications/notifications.module.ts` (o'zgartiriladi) | Yangi xizmatni provide + export |
| `server/src/payments/payments.module.ts` (o'zgartiriladi) | `NotificationsModule` import qilinadi |
| `server/src/payments/payment-events.listener.ts` (o'zgartiriladi) | 2 ta voqea |
| `server/src/lesson-cancellations/lesson-cancellation-events.listener.ts` (o'zgartiriladi) | 1 ta voqea |
| `server/src/lesson-reschedules/lesson-reschedule-events.listener.ts` (o'zgartiriladi) | 1 ta voqea |
| `client/src/components/student-portal/student-portal-layout.tsx` (o'zgartiriladi) | Web push ro'yxatdan o'tishi |
| `client/public/icon-192.png` (yangi) | `sw.js` chaqiradigan, mavjud bo'lmagan ikonka |
| `student-app/src/lib/push.ts` (o'zgartiriladi) | Push bosilganda navigatsiya |

---

### Task 1: `StudentNotifier` xizmati

**Files:**
- Create: `server/src/notifications/student-notifier.service.ts`
- Create: `server/src/notifications/student-notifier.service.spec.ts`
- Modify: `server/src/notifications/push.service.ts`
- Modify: `server/src/notifications/notifications.module.ts`

**Interfaces:**
- Consumes: `PrismaService`, `PushService.sendToUser`
- Produces: `export class StudentNotifier` with
  `notify(studentId: number, payload: { title: string; body: string; url: string; appRoute: string }): Promise<void>`

- [ ] **Step 1: Yiqiladigan testni yozish**

`server/src/notifications/student-notifier.service.spec.ts`:

```ts
import { StudentNotifier } from './student-notifier.service';

describe('StudentNotifier', () => {
  let prisma: any;
  let push: any;
  let notifier: StudentNotifier;

  const payload = {
    title: "To'lov qabul qilindi",
    body: '250 000 so‘m',
    url: '/portal/payments',
    appRoute: '/payments',
  };

  beforeEach(() => {
    prisma = { student: { findFirst: jest.fn() } };
    push = { sendToUser: jest.fn().mockResolvedValue(undefined) };
    notifier = new StudentNotifier(prisma, push);
  });

  it('sends to the user account behind the student', async () => {
    prisma.student.findFirst.mockResolvedValue({ id: 10001, userId: 42 });

    await notifier.notify(10001, payload);

    expect(push.sendToUser).toHaveBeenCalledWith(42, payload);
  });

  it('does nothing when the student has no user account', async () => {
    prisma.student.findFirst.mockResolvedValue({ id: 10001, userId: null });

    await notifier.notify(10001, payload);

    expect(push.sendToUser).not.toHaveBeenCalled();
  });

  it('does nothing when the student does not exist', async () => {
    prisma.student.findFirst.mockResolvedValue(null);

    await notifier.notify(10001, payload);

    expect(push.sendToUser).not.toHaveBeenCalled();
  });

  it('swallows a push failure — the caller must never be affected', async () => {
    prisma.student.findFirst.mockResolvedValue({ id: 10001, userId: 42 });
    push.sendToUser.mockRejectedValue(new Error('exp.host down'));

    await expect(notifier.notify(10001, payload)).resolves.toBeUndefined();
  });

  it('swallows a database failure too', async () => {
    prisma.student.findFirst.mockRejectedValue(new Error('db down'));

    await expect(notifier.notify(10001, payload)).resolves.toBeUndefined();
  });
});
```

**Nega oxirgi ikkita test shunchalik muhim:** bu xizmat to'lov yozuvidan keyin chaqiriladi. U tashlagan xato yuqoriga ko'tarilsa, muvaffaqiyatli to'lov xatoga aylanardi — bildirishnoma yuborilmagani uchun.

- [ ] **Step 2: Test yiqilishini tasdiqlash**

```bash
cd /Users/a1111/Desktop/daf-erp-system/server
npx jest src/notifications/student-notifier.service.spec.ts
```

Kutilgan: `Cannot find module './student-notifier.service'`.

- [ ] **Step 3: Xizmatni yozish**

`server/src/notifications/student-notifier.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from './push.service';

export interface StudentPushPayload {
  title: string;
  body: string;
  /** Web portal path — opened by the service worker on click. */
  url: string;
  /** Native expo-router path — the two differ (`/portal/payments` vs `/payments`). */
  appRoute: string;
}

/**
 * O'quvchiga push yuborishning yagona kirish nuqtasi.
 *
 * NEGA ALOHIDA XIZMAT: chaqiruvchilar (to'lov, dars bekor qilish, dars
 * ko'chirish listener'lari) o'quvchi bilan ishlaydi, push esa foydalanuvchi
 * hisobiga yuboriladi. O'sha moslashtirish va "xato yutish" qoidasi bir joyda
 * turgani ma'qul — aks holda har listener uni o'zicha takrorlardi.
 *
 * `PushService.sendToUser` web-push va native Expo push'ga BIRGA yuboradi,
 * ya'ni brauzer va telefon bitta chaqiruvdan qamraladi.
 *
 * HECH QACHON TASHLAMAYDI: bu metod muvaffaqiyatli to'lovdan keyin chaqiriladi.
 * Bildirishnoma yuborilmagani hech qachon pul amalini buzmasligi kerak.
 */
@Injectable()
export class StudentNotifier {
  private readonly logger = new Logger(StudentNotifier.name);

  constructor(
    private prisma: PrismaService,
    private pushService: PushService,
  ) {}

  async notify(studentId: number, payload: StudentPushPayload): Promise<void> {
    try {
      const student = await this.prisma.student.findFirst({
        where: { id: studentId, deletedAt: null },
        select: { id: true, userId: true },
      });
      if (!student?.userId) return;

      await this.pushService.sendToUser(student.userId, payload);
    } catch (err) {
      this.logger.warn(
        `Student push failed for student ${studentId}: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }
}
```

- [ ] **Step 4: `PushService` payload'iga `appRoute` qo'shish**

`server/src/notifications/push.service.ts` da uchta joyda payload tipi bor. Har birida `url?: string` yoniga `appRoute?: string` qo'shing:

```ts
  async sendToUser(
    userId: number,
    payload: { title: string; body: string; url?: string; appRoute?: string },
  ) {
```

`sendWebPush` **o'zgarmaydi** — u `payload` ni butunlay JSON qilib yuboradi, `appRoute` shunchaki ortiqcha maydon bo'lib boradi va `sw.js` uni e'tiborsiz qoldiradi.

`sendNativePush` da `data` ni kengaytiring:

```ts
      const messages = devices.map((d) => ({
        to: d.token,
        title: payload.title,
        body: payload.body,
        sound: 'default',
        priority: 'high',
        channelId: 'alerts',
        ...(payload.url || payload.appRoute
          ? { data: { url: payload.url, appRoute: payload.appRoute } }
          : {}),
      }));
```

**Nega ixtiyoriy:** `sendToUser` ni allaqachon 12 ta joy chaqiradi (o'qituvchi, admin, CEO uchun). Maydon majburiy bo'lsa, hammasi singan bo'lardi.

- [ ] **Step 5: Modulga ulash**

`server/src/notifications/notifications.module.ts`:

```ts
  providers: [
    NotificationsService,
    NotificationsGateway,
    NotificationEventsListener,
    PushService,
    StudentNotifier,
  ],
  exports: [NotificationsService, NotificationsGateway, PushService, StudentNotifier],
```

Import qo'shing:

```ts
import { StudentNotifier } from './student-notifier.service';
```

- [ ] **Step 6: Testlar o'tishini tasdiqlash**

```bash
cd /Users/a1111/Desktop/daf-erp-system/server
npx jest src/notifications/
```

Kutilgan: yangi 5 ta test PASS, mavjud notifications testlari ham PASS.

- [ ] **Step 7: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system
git add server/src/notifications/
git commit -m "Add one entry point for pushing to a student across both clients"
```

---

### Task 2: To'lov voqealariga push

**Files:**
- Modify: `server/src/payments/payments.module.ts`
- Modify: `server/src/payments/payment-events.listener.ts`

**Interfaces:**
- Consumes: `StudentNotifier.notify` (Task 1), `PaymentReceivedPayload`, `PaymentReversedPayload`
- Produces: hech qanday yangi eksport

- [ ] **Step 1: Modulga `NotificationsModule` ni import qilish**

`server/src/payments/payments.module.ts` hozir:

```ts
  imports: [TransactionsModule, BillingModule, SmsModule, MockExamsModule],
```

Almashtiring:

```ts
  imports: [
    TransactionsModule,
    BillingModule,
    SmsModule,
    MockExamsModule,
    NotificationsModule,
  ],
```

Import qo'shing:

```ts
import { NotificationsModule } from '../notifications/notifications.module';
```

Aylanma bog'liqlik tekshiruvi:

```bash
cd /Users/a1111/Desktop/daf-erp-system/server
grep -n "PaymentsModule" src/notifications/notifications.module.ts
```

Kutilgan: **bo'sh**. `NotificationsModule` `PaymentsModule` ni import qilmasa, aylana yo'q.

- [ ] **Step 2: Listener'ga xizmatni in'ektsiya qilish**

`server/src/payments/payment-events.listener.ts`:

```ts
  constructor(
    private prisma: PrismaService,
    private smsService: SmsService,
    private studentNotifier: StudentNotifier,
  ) {}
```

Import:

```ts
import { StudentNotifier } from '../notifications/student-notifier.service';
```

- [ ] **Step 3: `payment.received` ga push qo'shish**

Hozirgi `handle()` boshida:

```ts
      const student = await this.prisma.student.findFirst({
        where: { id: payload.studentId, deletedAt: null },
        select: { id: true, firstName: true, telegramChatId: true },
      });
      if (!student?.telegramChatId) {
        return;
      }
```

Push chaqiruvini **`return` dan OLDIN** qo'ying:

```ts
      const student = await this.prisma.student.findFirst({
        where: { id: payload.studentId, deletedAt: null },
        select: { id: true, firstName: true, telegramChatId: true },
      });

      // Push first: it must reach students who use the app but never linked
      // Telegram. The early return below skips them for the Telegram receipt.
      await this.studentNotifier.notify(payload.studentId, {
        title: "To'lov qabul qilindi",
        body: `${formatSom(payload.amount)} hisobingizga o'tkazildi`,
        url: '/portal/payments',
        appRoute: '/payments',
      });

      if (!student?.telegramChatId) {
        return;
      }
```

`formatSom` allaqachon shu faylda import qilingan (`./shared/format-som`).

- [ ] **Step 4: `payment.reversed` ga push qo'shish**

`handleReversed()` da xuddi shu naqsh — `telegramChatId` tekshiruvidan oldin:

```ts
      await this.studentNotifier.notify(payload.studentId, {
        title: "To'lov bekor qilindi",
        body: `${formatSom(payload.amount)} to'lov bekor qilindi`,
        url: '/portal/payments',
        appRoute: '/payments',
      });
```

- [ ] **Step 5: Testlar va build**

```bash
cd /Users/a1111/Desktop/daf-erp-system/server
npx jest && npm run build
```

Kutilgan: barcha testlar PASS, build muvaffaqiyatli. Build muhim — u modul grafida aylanma bog'liqlik yo'qligini tasdiqlaydi.

- [ ] **Step 6: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system
git add server/src/payments/
git commit -m "Push to the student when a payment lands or is reversed"
```

---

### Task 3: Dars bekor qilish va ko'chirish voqealariga push

**Files:**
- Modify: `server/src/lesson-cancellations/lesson-cancellation-events.listener.ts`
- Modify: `server/src/lesson-reschedules/lesson-reschedule-events.listener.ts`

**Interfaces:**
- Consumes: `StudentNotifier.notify` (Task 1)
- Produces: hech qanday yangi eksport

Ikkala modul ham `NotificationsModule` ni allaqachon import qiladi — modulga tegilmaydi. Tasdiqlang:

```bash
cd /Users/a1111/Desktop/daf-erp-system/server
grep -n "NotificationsModule" src/lesson-cancellations/lesson-cancellations.module.ts src/lesson-reschedules/lesson-reschedules.module.ts
```

Kutilgan: ikkalasida ham topiladi.

- [ ] **Step 1: Bekor qilish listener'iga in'ektsiya**

`lesson-cancellation-events.listener.ts` konstruktoriga qo'shing:

```ts
    private studentNotifier: StudentNotifier,
```

Import:

```ts
import { StudentNotifier } from '../notifications/student-notifier.service';
```

- [ ] **Step 2: O'quvchi siklini tuzatish**

Hozirgi sikl `telegramChatId` yo'q o'quvchini butunlay o'tkazib yuboradi:

```ts
      for (const e of enrollments) {
        if (!e.student.telegramChatId) {
          studentsMissing++;
          continue;
        }
        try {
          await this.smsService.sendToStudent(/* ... */);
          studentsNotified++;
        } catch (err) { /* ... */ }
      }
```

Push'ni `continue` dan **oldin** qo'ying:

```ts
      for (const e of enrollments) {
        // Before the Telegram gate: a student may use the app and never have
        // linked Telegram. Skipping them here would silently exclude them.
        await this.studentNotifier.notify(e.student.id, {
          title: 'Dars bekor qilindi',
          body: `${group.name} · ${payload.date}`,
          url: '/portal/schedule',
          appRoute: '/schedule',
        });

        if (!e.student.telegramChatId) {
          studentsMissing++;
          continue;
        }
        try {
          await this.smsService.sendToStudent(/* ...o'zgarishsiz... */);
          studentsNotified++;
        } catch (err) { /* ...o'zgarishsiz... */ }
      }
```

**`studentsMissing` hisoblagichiga tegmang.** U `EntityHistory` yozuvida «telegramsiz_oquvchilar» sifatida ishlatiladi va aynan Telegram qamrovini o'lchaydi — push qo'shilgani bilan bu ma'no o'zgarmaydi.

- [ ] **Step 3: Ko'chirish listener'ida xuddi shu**

`lesson-reschedule-events.listener.ts` da sikl tuzilishi bir xil. Konstruktorga in'ektsiya qiling va push'ni `continue` dan oldin qo'ying:

```ts
        await this.studentNotifier.notify(e.student.id, {
          title: "Dars vaqti o'zgardi",
          body: group.name,
          url: '/portal/schedule',
          appRoute: '/schedule',
        });
```

**Diqqat:** bu listener ikki xil holatni (`created` / yangilangan) `kind` o'zgaruvchisi bilan ajratadi. Sarlavha ikkalasi uchun ham «Dars vaqti o'zgardi» — o'quvchi uchun farq yo'q, ikkala holatda ham jadvalni ko'rishi kerak.

- [ ] **Step 4: Testlar va build**

```bash
cd /Users/a1111/Desktop/daf-erp-system/server
npx jest && npm run build
```

Kutilgan: barcha testlar PASS. Bu ikkala listener uchun mavjud spec fayllari bor — ular konstruktor o'zgargani uchun yiqilishi mumkin. Yiqilsa, spec'dagi mock ro'yxatiga `{ notify: jest.fn() }` qo'shing:

```ts
    const studentNotifier = { notify: jest.fn() } as any;
    listener = new LessonCancellationEventsListener(
      prisma, smsService, notificationsService, gateway,
      pushService, telegramService, entityHistoryService, studentNotifier,
    );
```

Argumentlar tartibi konstruktordagi tartibga aynan mos bo'lishi shart.

- [ ] **Step 5: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system
git add server/src/lesson-cancellations/ server/src/lesson-reschedules/
git commit -m "Push to students when a lesson is cancelled or moved"
```

---

### Task 4: Web portalda push ro'yxatdan o'tishi

**Files:**
- Modify: `client/src/components/student-portal/student-portal-layout.tsx`
- Create: `client/public/icon-192.png`

**Interfaces:**
- Consumes: mavjud `usePushNotifications()` (`@/hooks/use-push-notifications`)
- Produces: hech qanday yangi eksport

- [ ] **Step 1: Hook'ni ulash**

`client/src/components/student-portal/student-portal-layout.tsx` — komponent tanasiga bitta qator:

```tsx
  usePushNotifications();
```

Import:

```tsx
import { usePushNotifications } from "@/hooks/use-push-notifications";
```

Fayl `"use client"` direktivasi bilan boshlanishini tasdiqlang — hook `useEffect` ishlatadi. Yo'q bo'lsa qo'shing.

**Nega layout'da:** hook ichida `registered` ref bor, ya'ni takroriy chaqiruvdan himoyalangan; layout esa o'quvchi qaysi sahifada bo'lishidan qat'i nazar bir marta o'rnatiladi.

- [ ] **Step 2: Yetishmayotgan ikonkani qo'shish**

`client/public/sw.js` bildirishnomada `/icon-192.png` ni chaqiradi, lekin `public/` da bunday fayl yo'q — brauzer bo'sh ikonka ko'rsatadi.

Mavjud logotipdan 192×192 PNG yasang:

```bash
cd /Users/a1111/Desktop/daf-erp-system/client/public
sips -z 192 192 daf-logo.png --out icon-192.png
ls -la icon-192.png
```

`sips` — macOS'da o'rnatilgan. Natija kvadrat 192×192 bo'lishini tasdiqlang:

```bash
sips -g pixelWidth -g pixelHeight icon-192.png
```

- [ ] **Step 3: Build**

```bash
cd /Users/a1111/Desktop/daf-erp-system/client
npm run build
```

Kutilgan: build muvaffaqiyatli.

- [ ] **Step 4: Brauzerda qo'lda tekshirish**

Lokal serverni va klientni ishga tushirib, o'quvchi hisobi bilan `/portal` ga kiring.

Kutilgan: brauzer bildirishnoma ruxsatini so'raydi. Ruxsat bergach, DevTools → Application → Service Workers da `sw.js` faol ko'rinadi.

Tasdiqlash uchun bazadan tekshiring:

```bash
cd /Users/a1111/Desktop/daf-erp-system/server
npx prisma studio
```

`PushSubscription` jadvalida o'quvchining `userId` si bilan yangi qator paydo bo'lgan bo'lishi kerak.

- [ ] **Step 5: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system
git add client/src/components/student-portal/student-portal-layout.tsx client/public/icon-192.png
git commit -m "Subscribe the student web portal to push and add the icon sw.js expects"
```

---

### Task 5: Ilovada push bosilganda navigatsiya

**Files:**
- Modify: `student-app/src/lib/push.ts`

**Interfaces:**
- Consumes: server yuboradigan `data.appRoute` (Task 1)
- Produces: `export function useNotificationTapHandler(): void`

- [ ] **Step 1: Tap ishlovchisini yozish**

`student-app/src/lib/push.ts` oxiriga:

```ts
import { useEffect } from 'react';
import { router } from 'expo-router';

/**
 * Push bosilganda tegishli ekranga o'tkazadi.
 *
 * NEGA `appRoute`, `url` EMAS: server ikkala maydonni ham yuboradi, chunki
 * yo'llar farq qiladi — web'da `/portal/payments`, ilovada `/payments`.
 * `url` ni ishlatsak, ilova mavjud bo'lmagan route'ga sakrardi.
 *
 * Ilova YOPIQ turganda bosilgan bildirishnoma uchun ham ishlaydi:
 * `getLastNotificationResponseAsync` o'sha holatni qaytaradi.
 */
export function useNotificationTapHandler(): void {
  useEffect(() => {
    let active = true;

    function go(response: Notifications.NotificationResponse | null) {
      if (!active || !response) return;
      const route = response.notification.request.content.data?.appRoute;
      if (typeof route === 'string' && route.startsWith('/')) {
        router.push(route as never);
      }
    }

    // App was closed and the student opened it BY tapping the notification.
    Notifications.getLastNotificationResponseAsync().then(go).catch(() => {});

    // App already running.
    const sub = Notifications.addNotificationResponseReceivedListener(go);
    return () => {
      active = false;
      sub.remove();
    };
  }, []);
}
```

`router.push(route as never)` — `typedRoutes` yoqilgani uchun `router.push` faqat ma'lum route'larni qabul qiladi; bu yerda yo'l ish vaqtida keladi, shuning uchun tip kengaytirilishi kerak. `startsWith('/')` tekshiruvi shu sababli ham muhim.

- [ ] **Step 2: Tab layout'ida chaqirish**

`student-app/src/app/(tabs)/_layout.tsx` — `registerForPush()` yonida:

```tsx
import { registerForPush, useNotificationTapHandler } from '@/lib/push';

export default function TabsLayout() {
  useEffect(() => {
    registerForPush();
  }, []);

  useNotificationTapHandler();
  // ...qolgani o'zgarishsiz
```

**Nega tab layout'da:** u faqat autentifikatsiyadan keyin o'rnatiladi. Login ekranida turgan odamni push bilan ichkariga sakratib bo'lmaydi.

- [ ] **Step 3: Tip tekshiruvi va lint**

```bash
cd /Users/a1111/Desktop/daf-erp-system/student-app
npx tsc --noEmit && npx expo lint
```

Kutilgan: 0 xato.

- [ ] **Step 4: Qurilmada qo'lda tekshirish**

Dev build kerak (Expo Go'da Android push ishlamaydi):

```bash
cd /Users/a1111/Desktop/daf-erp-system/student-app
npx expo start --tunnel --dev-client
```

Sinov: o'quvchiga admin paneldan to'lov kiriting.

Tekshiriladigan ro'yxat:
1. Ilova ochiq turganda — banner chiqadi
2. Ilova fonda / ekran qulflangan — bildirishnoma keladi
3. Bildirishnoma bosiladi → **To'lovlar ekrani ochiladi**
4. Ilova butunlay yopilgan holda bosiladi → ilova ochilib To'lovlar ekraniga tushadi
5. O'sha o'quvchi brauzerda `/portal` ochiq bo'lsa — u yerda ham bildirishnoma keladi

- [ ] **Step 5: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system
git add student-app/src
git commit -m "Open the right screen when a student taps a notification"
```

---

### Task 6: PR ochish

- [ ] **Step 1: VAPID kalitlarini tekshirish — deploydan oldingi shart**

Web push serverda VAPID kalitlarisiz **jimgina ishlamaydi**:

```bash
cd /Users/a1111/Desktop/daf-erp-system/server
railway variables 2>/dev/null | grep -i vapid
```

Kutilgan: `VAPID_PUBLIC_KEY` va `VAPID_PRIVATE_KEY` mavjud.

**Agar yo'q bo'lsa** — PR'ni to'xtatmang, lekin buni PR tavsifida va foydalanuvchiga aniq ayting: native push ishlaydi, web push kalitlar qo'yilmaguncha ishlamaydi. Kalit yaratish:

```bash
npx web-push generate-vapid-keys
```

- [ ] **Step 2: Yakuniy tekshiruv**

```bash
cd /Users/a1111/Desktop/daf-erp-system/server && npx jest && npm run build
cd /Users/a1111/Desktop/daf-erp-system/client && npm run build
cd /Users/a1111/Desktop/daf-erp-system/student-app && npx tsc --noEmit && npx expo lint
```

- [ ] **Step 3: PR**

```bash
cd /Users/a1111/Desktop/daf-erp-system
git push -u origin feat/student-push
gh pr create --title "O'quvchiga bildirishnoma: brauzer va ilova" --body "$(cat <<'EOF'
Push infratuzilmasi qurilgan edi, lekin bekor turardi: serverdagi 12 ta yuborish joyi ham o'qituvchi/admin uchun, web portalda ro'yxatdan o'tish umuman ulanmagan, ilovada esa bildirishnoma bosilganda hech narsa bo'lmasdi.

**Bitta yuborish nuqtasi.** `StudentNotifier` o'quvchi raqamidan foydalanuvchi hisobini topib mavjud `PushService.sendToUser` ga uzatadi; u web-push va native Expo push'ga birga yuboradi. Xizmat hech qachon xato tashlamaydi — u muvaffaqiyatli to'lovdan keyin chaqiriladi va bildirishnoma yuborilmagani pul amalini buzmasligi kerak.

**To'rtta voqea:** to'lov qabul qilindi, to'lov bekor qilindi, dars bekor qilindi, dars ko'chirildi.

**Diqqatga sazovor tafsilot:** push chaqiruvlari Telegram tekshiruvidan OLDIN turadi. Mavjud listener'lar `telegramChatId` yo'q o'quvchini butunlay o'tkazib yuboradi — push keyin qo'yilsa, ilovasi bor lekin Telegrami yo'q o'quvchi hech narsa olmasdi.

Telegram yuborish mantig'i o'zgarmadi. Matnlar ikki kanalda bir xil emas (Telegram uzun va chek havolasi bilan, push ikki qatorga sig'ishi kerak) — bir xil bo'lgani ularning qachon yuborilishi.

Web tomonda yana `sw.js` chaqiradigan, lekin mavjud bo'lmagan `/icon-192.png` qo'shildi.

Dizayn: `docs/superpowers/specs/2026-08-19-student-app-uch-ish-design.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

| Spec talabi | Task |
|---|---|
| `StudentNotifier` yagona kirish nuqtasi | 1 |
| `PushService` web + native birga | 1 (Step 4) — mavjud xatti-harakat saqlanadi |
| `appRoute` alohida maydon | 1 (Step 3, 4), 5 (Step 1) |
| To'lov qabul qilindi / bekor qilindi | 2 |
| Dars bekor qilindi / ko'chirildi | 3 |
| Push Telegram tekshiruvidan oldin | 2 (Step 3), 3 (Step 2) — global cheklov |
| Telegram kodiga tegilmaydi | 2, 3 — global cheklov |
| Push xatosi yuqoriga chiqmaydi | 1 (Step 1, 3) |
| Web portalda ro'yxatdan o'tish | 4 (Step 1) |
| `icon-192.png` | 4 (Step 2) |
| Ilovada tap → navigatsiya | 5 |
| Davomat qamralmaydi | Global cheklov |
| VAPID tekshiruvi | 6 (Step 1) |
