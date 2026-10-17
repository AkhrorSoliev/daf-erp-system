# «Auditoriya» hisoboti — dizayn

**Sana:** 2026-10-17 · **ADR:** 0108 · **Holati:** CEO dizaynni tasdiqladi (namuna prod raqamlari bilan ko'rsatilgan)

## Maqsad

Markaz o'z auditoriyasini bilsin: hozir o'qiyotganlar jinsi va yoshi bo'yicha,
kurs va filial kesimida. Yangi ma'lumot yig'ilmaydi — `Student.gender` va
`Student.dateOfBirth` (ADR-0039).

## Sahifa

`Hisobotlar → Auditoriya` (`/reports/audience`), ruxsat `reports.students`,
filial sarlavhadagi tanlovdan. Bloklar yuqoridan pastga:

1. **Ma'lumot qanchalik to'liq** — jinsi va yoshi bor o'quvchilar soni va ulushi;
   ogohlantirish: foizlar faqat to'ldirganlar ichida.
2. **Jins** (erkak/ayol ulushi, soni, «Noma'lum») va **o'rtacha yosh**.
3. **Yosh guruhlari** — `<12`, `12–15`, `16–18`, `19–22`, `23–29`, `30+`.
4. **Kurs bo'yicha** va 5. **Filial bo'yicha** jadvallar: o'quvchi, jinsi aniq,
   erkak %, ayol %, o'rtacha yosh.

## Qoidalar

- Kim: `activeStudentWhere()` + `studentBranchWhere(scope)`.
- Foiz va o'rtacha faqat ma'lumoti borlar ichidan; `MIN_KNOWN = 5` dan kam bo'lsa `null`.
- Yosh: `tashkentDateStr(dateOfBirth)` + `ageOn`; guruh chegaralari `AGE_BANDS`.
- Bo'sh doira → 403. Kesh yo'q. Excel yo'q.

## API

`GET /reports/audience/overview` → `{ summary, bands, branches, courses }`.
`summary` va har bir kesim qatori: `total, genderKnown, male, female, malePct,
femalePct, ageKnown, avgAge`. Yosh guruhi: `key, label, count, pct`.

## Testlar

Sof hisob (chegaralar, kichik tanlama, parity), yuklovchi (so'rov sharti,
Toshkent kuni, doiradagi filial), servis (bo'sh doira), kontroller (marker va
default rollar), ruxsat snapshoti; mijozda format funksiyalari.

## Hozircha qilinmagan

Excel, lidlar kesimi, manzil / o'qish joyi (ma'lumot yo'q), kesh.
