# Student App uz/de i18n Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ilovaga o'zbek/nemis tilini almashtirish imkoniyatini qo'shish, matnlarni bitta manbaga yig'ish.

**Architecture:** Kutubxonasiz, mavjud tema store'i naqshini takrorlaydi. `uz.ts` — matn shaklining yagona manbai (`export type Dict = typeof uz`); `de.ts` shu `Dict` ni qanoatlantirishi shart, ya'ni kalit tushib qolsa TypeScript build'ni yiqitadi. `index.ts` — zustand store, tanlov `expo-secure-store` da saqlanadi. Ekranlar `const t = useT()` orqali oladi va til almashganda qayta chiziladi.

**Tech Stack:** Expo SDK 54, TypeScript, zustand (mavjud), expo-secure-store (mavjud).

**Spec:** `docs/superpowers/specs/2026-08-19-student-app-uch-ish-design.md`

## Global Constraints

- **Birorta yangi npm paketi qo'shilmaydi.** `package.json` va `package-lock.json` bu PR'da o'zgarmaydi. Agar biror qadam yangi paket talab qilsa — to'xtang, bu reja xato.
- **O'zbek matnlari faqat lotin alifbosida.** Kirill yoki arab harfi ishlatilmaydi.
- **O'quv atamalari ikkala tilda ham nemischa qoladi:** Wortschatz, Hörübung, Lektion, Grundstufe, Mittelstufe, A1–B2, richtig/falsch. Faqat interfeys matni tilga qarab almashadi.
- **Dummy ma'lumot ko'chirilmaydi.** `origin/feat/student-app-learning-hub` dan faqat quyida aniq sanab o'tilgan narsalar olinadi. O'quv/o'yin ekranlari (`battle`, `battle-play`, `vocabulary`, `leaderboard`, `hoeren`), `hub-card`, `skill-bars`, `audio-player`, `assets/audio/*` — **olinmaydi**.
- **`origin/feat/student-app-learning-hub` branch'iga yozilmaydi.** U arxiv; undan faqat `git show` bilan o'qiladi.
- **Ilovada test infratuzilmasi yo'q** (0 ta test fayl) va bu PR'da qurilmaydi. Har qadamning tekshiruvi — `npx tsc --noEmit` va `npx expo lint`. `Dict` tipi tarjima to'liqligining kompilyatsiya-vaqti testi vazifasini bajaradi.
- Ish katalogi: barcha buyruqlar `student-app/` ichida bajariladi.

## File Structure

| Fayl | Mas'uliyati |
|---|---|
| `src/i18n/uz.ts` (o'zgartiriladi) | O'zbekcha lug'at + `Dict` tipi manbai |
| `src/i18n/de.ts` (yangi) | Nemischa lug'at, `Dict` ni qanoatlantiradi |
| `src/i18n/index.ts` (yangi) | Til store'i, `useT()`/`useLang()`/`useSetLang()`, `LANGUAGES` |
| `src/app/_layout.tsx` (o'zgartiriladi) | Til store'ini hydrate qilish, boot gate |
| `src/app/settings.tsx` (o'zgartiriladi) | Til almashtirgich (plag o'rniga) |
| 7 ta mavjud `t` iste'molchisi | `t` → `useT()` |
| 5 ta qattiq matnli ekran + tab-bar | Matnlar lug'atga ko'chiriladi |

---

### Task 1: i18n yadrosi — `uz.ts` qayta shakllantiriladi, `de.ts` va `index.ts` qo'shiladi

**Files:**
- Modify: `student-app/src/i18n/uz.ts`
- Create: `student-app/src/i18n/de.ts`
- Create: `student-app/src/i18n/index.ts`

**Interfaces:**
- Consumes: hech narsa (birinchi task)
- Produces:
  - `export const uz` va `export type Dict = typeof uz` (`uz.ts` dan)
  - `export const de: Dict` (`de.ts` dan)
  - `export const useLanguageStore`, `export const useT: () => Dict`, `export const useLang: () => Lang`, `export const useSetLang: () => (lang: Lang) => void`, `export const LANGUAGES: { code: Lang; label: string; flag: string }[]`, `export type Lang = 'uz' | 'de'`, `export type { Dict }` (`index.ts` dan)

**Nega bu task alohida:** bu qadam oxirida hech bir ekran o'zgarmagan bo'ladi — yangi fayllar hali iste'molchisiz turadi va `tsc` toza o'tadi. Ya'ni lug'at bazasi ekran konvertatsiyasidan ajratilgan holda tekshiriladi.

- [ ] **Step 1: Branch'dagi uchta faylni vaqtinchalik joyga chiqarib olish**

Bu fayllar arxiv branch'da turibdi; ularni `git show` bilan o'qiymiz, branch'ga o'tmaymiz.

```bash
cd /Users/a1111/Desktop/daf-erp-system
mkdir -p /tmp/i18n-src
B=origin/feat/student-app-learning-hub
git show $B:student-app/src/i18n/uz.ts    > /tmp/i18n-src/uz.ts
git show $B:student-app/src/i18n/de.ts    > /tmp/i18n-src/de.ts
git show $B:student-app/src/i18n/index.ts > /tmp/i18n-src/index.ts
wc -l /tmp/i18n-src/*.ts
```

Kutilgan natija: `uz.ts` ≈321, `de.ts` ≈338, `index.ts` ≈53 qator.

- [ ] **Step 2: `index.ts` ni o'zgarishsiz ko'chirish**

Bu fayl dummy ekranlarga umuman bog'liq emas — to'g'ridan-to'g'ri ko'chiriladi.

```bash
cp /tmp/i18n-src/index.ts /Users/a1111/Desktop/daf-erp-system/student-app/src/i18n/index.ts
```

Ko'chirilgach faylni o'qib chiqing va quyidagilar borligiga ishonch hosil qiling: `Lang` tipi, `LANGUAGES` massivi, `DICTS`, `useLanguageStore` (`STORAGE_KEY = 'app-lang'`, default `uz`), `useT`/`useLang`/`useSetLang`, `export type { Dict }`.

- [ ] **Step 3: `uz.ts` ni ko'chirib, dummy bo'limlarni olib tashlash**

```bash
cp /tmp/i18n-src/uz.ts /Users/a1111/Desktop/daf-erp-system/student-app/src/i18n/uz.ts
```

Endi fayldan quyidagi **butun bo'limlarni o'chiring** (ular faqat ko'chirilmaydigan ekranlarga xizmat qiladi):

`darslar`, `resurslar`, `vocabulary`, `battle`, `battlePlay`, `hoeren`, `leaderboard`

Ular fayl oxirida ketma-ket joylashgan, `faq` massividan keyin boshlanadi. `faq` dan keyingi izoh bloki («Learning screens (dummy content pending backends)…») ham o'chiriladi.

Keyin `home` bo'limi ichidan **quyidagi kalitlarni o'chiring** (ular gamifikatsiyalangan Home kartalariga tegishli, biz esa Home'ni o'zgartirmaymiz):

```
skillsTitle, skillsLang,
battleTitle, battleWins, battleGames, battleLosses,
vocabTitle, vocabWords,
zoomTitle, zoomSubtitle, zoomEvent,
leaderboardTitle, leaderboardSubtitle
```

`home` da qoladigan kalitlar: `greeting`, `balance`, `inDebt`, `current`, `todayLessons`, `fullSchedule`, `noLessonsToday`, `myGroups`, `noActiveGroups`, `qrCheckIn`.

Qoladigan butun bo'limlar: `common`, `nav`, `tabs`, `auth`, `forgotPassword`, `home`, `schedule`, `attendance`, `payments`, `profile`, `more`, `settings`, `scan`, `about`, `faq`.

- [ ] **Step 4: Main'dagi eski `uz.ts` da bo'lgan, branch'da yo'q kalitlarni qo'shish**

Main'dagi eski fayl branch ajralganidan keyin o'zgargan. Yo'qolmasligi kerak bo'lgan kalit — `auth.loginPhonePlaceholder`:

```ts
  auth: {
    phoneLabel: 'Telefon raqami',
    phonePlaceholder: '90 123 45 67',
    // Kirish ekrani istalgan formatdagi raqamni qabul qiladi, parolni
    // tiklash esa faqat O'zbekiston raqamiga SMS yuboradi — shu sababli
    // ikkalasi turli placeholder ishlatadi.
    loginPhonePlaceholder: '998 90 123 45 67',
    // ...branch'dagi qolgan auth kalitlari
  },
```

Tekshirish uchun eski faylni yonma-yon qo'ying:

```bash
cd /Users/a1111/Desktop/daf-erp-system
git show HEAD:student-app/src/i18n/uz.ts > /tmp/i18n-src/uz-main.ts
```

`/tmp/i18n-src/uz-main.ts` dagi har bir kalit yangi faylda borligini tasdiqlang. `placeholders` bo'limi bundan mustasno — undagi matnlar hech bir ekranda ishlatilmaydi (o'lik kod), ko'chirilmaydi.

- [ ] **Step 5: `de.ts` ni ko'chirib, `uz.ts` bilan bir xil bo'limlarni qoldirish**

```bash
cp /tmp/i18n-src/de.ts /Users/a1111/Desktop/daf-erp-system/student-app/src/i18n/de.ts
```

`uz.ts` da o'chirilgan **aynan o'sha** bo'limlar va `home` kalitlarini bu yerdan ham o'chiring. Fayl `import type { Dict } from './uz'` va `export const de: Dict = { ... }` shaklida bo'lishi kerak.

`auth.loginPhonePlaceholder` nemischa faylda ham bo'lishi shart — raqam formati bir xil:

```ts
    loginPhonePlaceholder: '998 90 123 45 67',
```

- [ ] **Step 6: Tip tekshiruvini yurgizish — bu bizning testimiz**

```bash
cd /Users/a1111/Desktop/daf-erp-system/student-app && npx tsc --noEmit
```

Kutilgan: **0 xato**.

Agar `de.ts` da kalit yetishmasa, xato aynan shunday ko'rinadi:

```
src/i18n/de.ts:NN:14 - error TS2741: Property 'loginPhonePlaceholder' is missing in type ... but required in type 'Dict'.
```

Bu — kutilgan va foydali xato. Yetishmagan kalitni nemischa tarjimasi bilan qo'shing va qayta yurgizing. `uz.ts` va `de.ts` bir xil shaklga kelmaguncha davom eting.

Agar `uz.ts` da qolib ketgan, lekin `de.ts` da o'chirilgan bo'lim bo'lsa — xato o'sha bo'lim nomini ko'rsatadi; ikkalasidan ham o'chirilganini tekshiring.

- [ ] **Step 7: Eski `t` iste'molchilari hali ishlayotganini tekshirish**

`uz.ts` endi `t` emas, `uz` nomi bilan eksport qiladi — ya'ni 7 ta ekran singan bo'lishi kerak. Step 6 dagi `tsc` buni ko'rsatadi:

```
src/app/(tabs)/index.tsx:14:10 - error TS2305: Module '"@/i18n/uz"' has no exported member 't'.
```

Bu **kutilgan**. Ularni Task 2 tuzatadi. Shu qadamda faqat xatolar ro'yxati aynan shu 7 ta fayl ekanini tasdiqlang, boshqa turdagi xato yo'qligiga ishonch hosil qiling:

```bash
npx tsc --noEmit 2>&1 | grep -c "has no exported member 't'"
```

Kutilgan: `7`.

```bash
npx tsc --noEmit 2>&1 | grep -v "has no exported member 't'" | grep "error TS"
```

Kutilgan: **bo'sh** (boshqa xato yo'q).

- [ ] **Step 8: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system
git add student-app/src/i18n/uz.ts student-app/src/i18n/de.ts student-app/src/i18n/index.ts
git commit -m "Add the uz/de dictionary layer, typed so a missing key fails the build"
```

---

### Task 2: Mavjud 7 ta `t` iste'molchisini `useT()` ga o'tkazish + root hydrate

**Files:**
- Modify: `student-app/src/app/_layout.tsx`
- Modify: `student-app/src/app/(auth)/login.tsx`
- Modify: `student-app/src/app/(auth)/forgot-password.tsx`
- Modify: `student-app/src/app/(tabs)/index.tsx`
- Modify: `student-app/src/app/schedule.tsx`
- Modify: `student-app/src/app/attendance.tsx`
- Modify: `student-app/src/app/payments.tsx`
- Modify: `student-app/src/app/profile.tsx`

**Interfaces:**
- Consumes: `useT` va `useLanguageStore` (Task 1, `@/i18n`)
- Produces: hech qanday yangi eksport; bu task faqat iste'mol usulini o'zgartiradi

- [ ] **Step 1: Root layout'da til store'ini hydrate qilish**

`_layout.tsx` da tema store'i qanday hydrate qilinsa, til ham xuddi shunday. Mavjud kod:

```tsx
  const hydrateTheme = useThemeStore((s) => s.hydrate);
  const [themeReady, setThemeReady] = useState(false);
```

Yoniga qo'shing:

```tsx
  const hydrateLang = useLanguageStore((s) => s.hydrate);
  const [langReady, setLangReady] = useState(false);
```

Import qo'shing:

```tsx
import { useLanguageStore } from '@/i18n';
```

Mavjud effektni kengaytiring:

```tsx
  useEffect(() => {
    hydrate();
    hydrateTheme().finally(() => setThemeReady(true));
    hydrateLang().finally(() => setLangReady(true));
  }, [hydrate, hydrateTheme, hydrateLang]);
```

Va boot gate'ga qo'shing:

```tsx
  const ready = fontsLoaded && status !== 'loading' && themeReady && langReady;
```

**Nega gate kerak:** til hydrate bo'lmasdan ekran chizilsa, o'quvchi bir zumga o'zbekcha matnni ko'rib, keyin nemischaga sakraydi.

- [ ] **Step 2: 7 ta ekranda importni va chaqiruvni almashtirish**

Har bir faylda:

```tsx
// eski
import { t } from '@/i18n/uz';
```

```tsx
// yangi
import { useT } from '@/i18n';
```

va komponent tanasining boshida (birinchi hook'lar qatorida):

```tsx
  const t = useT();
```

**Muhim:** `t` ni komponentdan tashqarida (modul darajasida) chaqirmang — u hook, va til almashganda qayta chizilishi aynan shu bilan ta'minlanadi.

Ehtiyot bo'ling: `payments.tsx` da `const t = useT()` allaqachon mavjud `const pay = usePayments()` bilan bir xil nomda emasligini tekshiring — nom to'qnashuvi yo'q, lekin `attendance.tsx` da mahalliy `t` o'zgaruvchisi bor-yo'qligini `grep -n "const t\b"` bilan tekshiring.

- [ ] **Step 3: Tip tekshiruvi**

```bash
cd /Users/a1111/Desktop/daf-erp-system/student-app && npx tsc --noEmit
```

Kutilgan: **0 xato**. Task 1 dan qolgan 7 ta `has no exported member 't'` xatosi yo'qolgan bo'lishi kerak.

- [ ] **Step 4: Lint**

```bash
npx expo lint
```

Kutilgan: yangi xato yo'q. Oldindan mavjud ogohlantirishlar qolishi normal — ularni tuzatmang, bu PR qamrovida emas.

- [ ] **Step 5: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system
git add student-app/src/app
git commit -m "Read copy through the language store so screens re-render on switch"
```

---

### Task 3: Qattiq yozilgan matnli ekranlarni lug'atga o'tkazish

**Files:**
- Modify: `student-app/src/app/(tabs)/more.tsx`
- Modify: `student-app/src/app/about.tsx`
- Modify: `student-app/src/app/faq.tsx`
- Modify: `student-app/src/app/scan.tsx`
- Modify: `student-app/src/app/settings.tsx`
- Modify: `student-app/src/design/components/tab-bar.tsx`

**Interfaces:**
- Consumes: `useT` (Task 1); `t.more`, `t.about`, `t.faq`, `t.scan`, `t.settings`, `t.nav` bo'limlari
- Produces: hech qanday yangi eksport

**Nega alohida task:** bu ekranlar hozir lug'atni umuman ishlatmaydi — matnlar JSX ichida. Task 2 dan farqli, bu yerda har bir satr lug'at kaliti bilan almashtiriladi, ya'ni xato qilish ehtimoli yuqoriroq va alohida ko'rib chiqilishi kerak.

- [ ] **Step 1: `more.tsx`**

`useT()` qo'shing, so'ng matnlarni almashtiring:

| Hozirgi matn | Kalit |
|---|---|
| `'Chiqish'` (Alert sarlavhasi) | `t.more.logoutConfirmTitle` |
| `'Hisobdan chiqishni tasdiqlaysizmi?'` | `t.more.logoutConfirmMessage` |
| `'Bekor qilish'` | `t.common.cancel` |
| `'Chiqish'` (menyu qatori va tugma) | `t.more.logout` |
| `"To'lovlar"` | `t.more.payments` |
| `'FAQ'` | `t.more.faq` |
| `'Biz haqimizda'` | `t.more.about` |
| `'Sozlamalar'` | `t.more.settings` |
| `"Ko'proq"` (sarlavha) | `t.tabs.more` |
| `'Profil'` (fallback) | `t.more.profileFallback` |
| `"Profilni ko'rish"` | `t.more.viewProfile` |

**Diqqat:** `menu` massivi komponent tanasi ichida yaratiladi, ya'ni `t` unga bemalol yetadi. Uni modul darajasiga ko'chirmang.

- [ ] **Step 2: `about.tsx`**

`t.about.centerName`, `t.about.tagline`, `t.about.aboutTitle`, `t.about.aboutBody`, `t.about.contact`, va versiya uchun funksiya-kalit:

```tsx
<Text variant="muted">{t.about.version(Constants.expoConfig?.version ?? '1.0.0')}</Text>
```

Sahifa sarlavhasi: `t.tabs.about`.

- [ ] **Step 3: `faq.tsx`**

`t.faq` — bu massiv (`{ q, a }` obyektlari). Qattiq yozilgan ro'yxatni almashtiring:

```tsx
{t.faq.map((item, i) => (
  <FaqRow key={i} question={item.q} answer={item.a} />
))}
```

Mavjud komponent nomlari va tuzilishini saqlang — faqat ma'lumot manbai o'zgaradi. Sahifa sarlavhasi: `t.tabs.faq`.

- [ ] **Step 4: `scan.tsx`**

| Hozirgi matn | Kalit |
|---|---|
| `'Kamera ruxsati kerak'` | `t.scan.permissionTitle` |
| `'QR kodni skanerlash uchun kameraga ruxsat bering.'` | `t.scan.permissionDesc` |
| `'Ruxsat berish'` | `t.scan.allow` |
| `'Orqaga'` | `t.common.back` |
| `'Dars QR kodiga qarating'` | `t.scan.guide` |
| `'Bekor qilish'` | `t.common.cancel` |
| `'Balans yetarli emas'` | `t.scan.insufficientTitle` |
| `'Dars uchun balansingiz yetmadi'` | `t.scan.insufficientMessage` |
| `'Belgilandi ✓'` | `t.scan.markedTitle` |
| `'Davomat muvaffaqiyatli belgilandi'` | `t.scan.markedMessage` |
| `'Xatolik'` | `t.common.errorTitle` |
| `'QR kod yaroqsiz yoki muddati tugagan'` | `t.scan.invalidQr` |

**Diqqat:** `onScanned` — komponent ichidagi funksiya, `t` unga yetadi.

- [ ] **Step 5: `settings.tsx` — matnlar (almashtirgichning o'zi Task 4 da)**

`t.settings.theme`, `t.settings.themeSystem`, `t.settings.themeLight`, `t.settings.themeDark`, `t.settings.other`, `t.settings.language`, `t.settings.translator`, `t.common.comingSoon`, sarlavha `t.tabs.settings`.

`THEME_OPTS` hozir modul darajasida va `label` matnini o'z ichiga oladi. Uni komponent ichiga ko'chiring yoki `label` o'rniga `labelKey` saqlab, JSX'da `t.settings[o.labelKey]` deb o'qing. Ikkinchisi afzal — massiv modul darajasida qoladi:

```tsx
const THEME_OPTS: { mode: ThemeMode; labelKey: 'themeSystem' | 'themeLight' | 'themeDark'; icon: keyof typeof Ionicons.glyphMap }[] = [
  { mode: 'system', labelKey: 'themeSystem', icon: 'phone-portrait-outline' },
  { mode: 'light', labelKey: 'themeLight', icon: 'sunny-outline' },
  { mode: 'dark', labelKey: 'themeDark', icon: 'moon-outline' },
];
```

va JSX'da:

```tsx
<Text className={cn('font-bodymd text-[12px]', active ? 'text-fg' : 'text-fg-muted')}>
  {t.settings[o.labelKey]}
</Text>
```

- [ ] **Step 6: `tab-bar.tsx` — tab nomlari lug'atdan**

`LumioTabBar` hozir nomlarni qayerdan olayotganini aniqlang:

```bash
cd /Users/a1111/Desktop/daf-erp-system/student-app && grep -n "label\|title\|name" src/design/components/tab-bar.tsx
```

Nomlarni `t.nav[route.name]` ga bog'lang. `t.nav` kalitlari route nomlari bilan aynan mos: `index`, `darslar`, `resurslar`, `more`.

```tsx
const t = useT();
// ...
const label = t.nav[route.name as keyof typeof t.nav] ?? route.name;
```

`?? route.name` fallback'i shuning uchunki, kelajakda yangi tab qo'shilib lug'atga kalit qo'shilmasa, ilova qulamaydi.

- [ ] **Step 7: Qolgan qattiq matn qolmaganini tekshirish**

```bash
cd /Users/a1111/Desktop/daf-erp-system/student-app
grep -rn "'[A-Z][a-z']* [a-z']" src/app src/design/components --include=*.tsx | grep -v "@/i18n" | grep -v "className" | grep -v "^\s*//"
```

Bu buyruq taxminiy — chiqqan har bir qatorni ko'zdan kechiring. Ba'zilari qonuniy (masalan `Ionicons` nomi, `keyboardType`), lekin foydalanuvchiga ko'rinadigan o'zbekcha matn qolmasligi kerak.

**Ataylab qoldiriladigan:** `darslar.tsx` va `resurslar.tsx` dagi «Tez orada» plaglari — ular `t.common.comingSoon` ga o'tkazilsin, lekin ekranlarning o'zi o'zgarmaydi.

- [ ] **Step 8: Tip tekshiruvi va lint**

```bash
npx tsc --noEmit && npx expo lint
```

Kutilgan: 0 xato, yangi ogohlantirish yo'q.

- [ ] **Step 9: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system
git add student-app/src
git commit -m "Move the remaining hardcoded screen copy into the dictionary"
```

---

### Task 4: Sozlamalarda til almashtirgich

**Files:**
- Modify: `student-app/src/app/settings.tsx`

**Interfaces:**
- Consumes: `useT`, `useLang`, `useSetLang`, `LANGUAGES` (Task 1); Task 3 dagi matn kalitlari
- Produces: foydalanuvchiga ko'rinadigan yakuniy imkoniyat — bu PR'ning maqsadi

- [ ] **Step 1: Plagni almashtirish**

Hozirgi kod «Til» qatorini o'chirilgan holda, «Tez orada» nishoni bilan ko'rsatadi:

```tsx
            <ListRow
              icon="language"
              tone="sky"
              label="Til"
              className="opacity-60"
              chevron={false}
              trailing={<Badge label="Tez orada" tone="neutral" />}
            />
```

Uni tema tanlagichi bilan bir xil ko'rinishdagi segment tanlagichga almashtiring:

```tsx
          {/* Til */}
          <View className="gap-2.5">
            <Text variant="caps" className="px-1">{t.settings.language}</Text>
            <View className="flex-row gap-2 rounded-[20px] bg-sunk p-1.5">
              {LANGUAGES.map((l) => {
                const active = lang === l.code;
                return (
                  <Pressable
                    key={l.code}
                    onPress={() => setLang(l.code)}
                    className={cn('flex-1 items-center gap-1 rounded-[14px] py-3', active && 'bg-surface')}
                    style={active ? { boxShadow: shadow.sm } : undefined}
                  >
                    <Text className="text-[20px]">{l.flag}</Text>
                    <Text className={cn('font-bodymd text-[12px]', active ? 'text-fg' : 'text-fg-muted')}>
                      {l.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
```

Komponent boshiga:

```tsx
  const lang = useLang();
  const setLang = useSetLang();
```

Import:

```tsx
import { useT, useLang, useSetLang, LANGUAGES } from '@/i18n';
```

**Nega tema uchun ishlatilgan `animateThemeChange` bu yerda chaqirilmaydi:** aylana-ochilish animatsiyasi fon rangi o'zgarishini yashirish uchun; til almashganda fon o'zgarmaydi, faqat matn. Animatsiyani chaqirish keraksiz miltillash beradi.

- [ ] **Step 2: «Tarjimon» qatorini joyida qoldirish**

`t.settings.translator` + `t.common.comingSoon` bilan, o'chirilgan holida qoladi. Bu haqiqiy plag — orqasida hech narsa yo'q va bu PR unga tegmaydi.

- [ ] **Step 3: `Badge` importi hali kerakmi tekshirish**

«Til» qatoridan `Badge` olib tashlandi, lekin «Tarjimon» hali ishlatadi — ya'ni import qoladi. `npx expo lint` ishlatilmayotgan importni topadi.

- [ ] **Step 4: Tip tekshiruvi va lint**

```bash
cd /Users/a1111/Desktop/daf-erp-system/student-app && npx tsc --noEmit && npx expo lint
```

Kutilgan: 0 xato.

- [ ] **Step 5: Qurilmada qo'lda tekshirish**

```bash
cd /Users/a1111/Desktop/daf-erp-system/student-app
npx expo start --tunnel --dev-client
```

Tekshiriladigan ro'yxat:

1. Sozlamalar → Til → **Deutsch** bosiladi → butun interfeys darhol nemischaga o'tadi (tab nomlari ham)
2. O'quv atamalari nemischaligicha qoladi (bu ikkala tilda ham to'g'ri)
3. Ilova to'liq yopilib qayta ochiladi → **nemischa saqlanib qoladi** (SecureStore ishlayapti)
4. Til → **O'zbekcha** → hammasi qaytadi, kirill harfi hech qayerda yo'q
5. Chiqib, qaytadan kirish → til tanlovi saqlanib qoladi (u foydalanuvchi sessiyasiga emas, qurilmaga bog'langan)

- [ ] **Step 6: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system
git add student-app/src/app/settings.tsx
git commit -m "Let students switch the interface between Uzbek and German"
```

---

### Task 5: PR ochish

- [ ] **Step 1: Yakuniy tekshiruv**

```bash
cd /Users/a1111/Desktop/daf-erp-system/student-app && npx tsc --noEmit && npx expo lint
cd /Users/a1111/Desktop/daf-erp-system && git status --short student-app/
```

`package.json` va `package-lock.json` **o'zgarmagan** bo'lishi shart. O'zgargan bo'lsa — global cheklov buzilgan, to'xtang.

- [ ] **Step 2: PR**

```bash
cd /Users/a1111/Desktop/daf-erp-system
git push -u origin feat/student-app-i18n-uz-de
gh pr create --title "Ilova interfeysini o'zbek va nemis tillarida berish" --body "$(cat <<'EOF'
`origin/feat/student-app-learning-hub` da qolib ketgan uz/de qatlami main'ga chiqarildi. O'sha branch arxiv sifatida tegilmasdan qoladi; undan faqat lug'at qatlami olindi, dummy ma'lumotli o'quv/o'yin ekranlari olinmadi.

- `uz.ts` matn shaklining yagona manbai; `de.ts` `Dict` ni qanoatlantirmasa build yiqiladi, ya'ni tarjima jimgina tushib qola olmaydi
- Til tanlovi qurilmada saqlanadi (`expo-secure-store`), boot shu o'qilguncha kutadi — aks holda matn bir zumga sakrardi
- Qattiq yozilgan matnlar lug'atga ko'chirildi; tab nomlari ham lug'atdan
- O'quv atamalari (Wortschatz, Hörübung, A1) ikkala tilda ham nemischa qoladi — ular fan sohasi, interfeys emas

Yangi paket qo'shilmadi: qatlam mavjud zustand + expo-secure-store ustida ishlaydi, lockfile tegilmadi.

Dizayn: `docs/superpowers/specs/2026-08-19-student-app-uch-ish-design.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

**Spec qamrovi:**

| Spec talabi | Task |
|---|---|
| `de.ts`, `index.ts` ko'chirish | 1 |
| `uz.ts` → `Dict` manbai + main'dagi 4 kalit | 1 (Step 3, 4) |
| Dummy bo'limlar tushiriladi | 1 (Step 3, 5) |
| 13 ekranni `useT()` ga o'tkazish | 2 (7 ta), 3 (6 ta) |
| Sozlamalarda til almashtirgich | 4 |
| Tab nomlari `t.nav[route.name]` dan | 3 (Step 6) |
| Root `_layout` hydrate + boot gate | 2 (Step 1) |
| Yangi paket yo'q | Global cheklov + Task 5 (Step 1) |
| O'quv atamalari nemischa qoladi | Global cheklov |
| Tekshiruv: `tsc` + `expo lint` | Har taskda |
