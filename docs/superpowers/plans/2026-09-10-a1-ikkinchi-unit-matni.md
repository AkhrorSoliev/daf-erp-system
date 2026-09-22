# A1 — 2-unitning matni

**Goal:** A1 ning 2-uniti («Menschen um mich» — oila, kasb, sifat, 20–100)
to'liq matn bilan to'ladi: 50 asosiy so'z, 5 grammatika qoidasi, iboralar,
6 dialog va ~60 gap — va bazaga tushadi. 1-unit bilan bir xil qoidalar,
lekin qo'riqchilar endi BITTA unitga emas, har unitga ishlaydi.

**Architecture:** Kontent tuzilishi 1-unitdagidek
(`content/daf/a1/u02/` dagi beshta fayl). Yangi narsa — qo'riqchilarni
umumlashtirish: progressiya tekshiruvi endi unitlar bo'ylab KUMULYATIV
(u02 gapida u01 so'zi tanish) va yordamchi so'zlar ro'yxati koddan
kontentga ko'chadi, har biri sababi bilan.

## Global Constraints

- Dizayn: `docs/superpowers/specs/2026-09-03-a1-kurs-design.md`. Ziddiyat
  chiqsa dizayn ustun. Xarita (`kurs.json`) O'ZGARMAYDI — CEO tasdiqlagan.
- Bu reja **faqat 2-unit** matnini beradi. Ovoz va rasm bu rejada YO'Q —
  ular uchun ruxsat alohida so'raladi (bir unitlik ruxsat qoidasi).
- **Netzwerk yoki Goethe ning MATNI ko'chirilmaydi.** Goethe ro'yxatidan
  faqat «bu so'z A1 ga kiradimi» degan fakt olinadi.
- Progressiya majburiy: gap, dialog va misoldagi har so'z shu bo'limda
  yoki undan OLDIN (shu unit yoki oldingi unitlarda) o'rgatilgan bo'ladi.
- **Unit ichida takroriy `de` va `funktionUz` bo'lmaydi** — jonli
  juftlash materialni matn bo'yicha qidiradi (`daf:inhalt-check`).
- Kumulyativ qamrov qoidalari: har bo'limning kumulyativ qamrovida
  kamida **2 dialog**, va `ZUORDNEN` uchun **6 xil `funktionUz`**.
- Barcha o'zbekcha yozuv lotin alifbosida.
- Har commit oldidan `npm test` va `npm run typecheck` o'tishi shart.

---

## Task 1: Qo'riqchini unit-generic qilish

`unit-inhalt.file.spec.ts` 1-unitga qotirilgan (14 joyda `u01`), va
yordamchi so'zlar ro'yxati (`hilfs`) kodda yozilgan: atoqli otlar,
tuslangan fe'l shakllari. 2-unit uchun bu ro'yxat o'sadi, ya'ni u
kontentga tegishli.

- Tanish so'zlar to'plami **unitlar bo'ylab kumulyativ** hisoblanadi:
  bo'limlar `kurs.json` tartibida yagona ketma-ketlikka yig'iladi va
  u02-s1 uchun u01 ning hamma so'zi tanish bo'ladi.
- `content/daf/a1/hilfswoerter.json` — yordamchi so'zlar, har biri
  `grund` bilan. Sababsiz kirita olmaslik qo'riqchining ma'nosi: aks
  holda «notanish so'z» xatosini ro'yxatga qo'shib jimlatib bo'lardi.
- Mavjud qoida saqlanadi: hilfs ichida biror unitning ASOSIY so'zi
  turmasligi kerak (aks holda so'z o'z bo'limidan oldin ishlatilsa
  tekshiruv ko'rmaydi) — endi hamma unit uchun.
- Testlar matni bor har unit uchun ishlaydi (`describe.each`), ya'ni
  u02 fayllari qo'shilishi bilan avtomatik qo'riqlanadi.

## Task 2: Gap yasovchi skriptni unit-generic qilish

`daf-gen-u01-saetze.ts` da u01 ga qotirilgan namunalar va s4/s5 uchun
maxsus filtr bor. Namunalar unit bo'yicha jadvalga ko'chiriladi; u02
uchun o'z namunalari yoziladi. Skript nomi ham unitga bog'liq
bo'lmaydi.

## Task 3: `wortliste.json` — 2-unitning 50 so'zi

Goethe A1 ro'yxatidan, bo'limiga 10 tadan. Validator qo'riqlaydi:
so'z ikki joyda bo'lmasin, bo'limda 8–12 so'z, unitda 50 dan oshmasin,
Goethe da yo'q so'zning sababi yozilsin.

Mavzular: oila (s1), `haben` + 20–100 sonlari (s2), kasblar (s3),
sifatlar (s4), do'st/hamkasb va er/sie/wir (s5).

## Task 4: `u02/woerter.json`

50 asosiy so'z + passivlar. Otlarda `artikel` va `plural`; sonlarda
`de` — nemischa so'z, `anzeige` — raqam; har so'zda bitta aniq `uz`.

## Task 5: `u02/grammatik.json`

Har bo'limga bitta qoida (`kurs.json` dagi `grammar` maydoniga mos),
har qoidada kamida 4 misol, izoh o'zbekcha.

## Task 6: `u02/redemittel.json`

Har bo'limda kamida 3 ibora; unit ichida takroriy `funktionUz` YO'Q;
2-bo'limdan boshlab kumulyativ 6 xil vaziyat yig'iladi (`ZUORDNEN`).

## Task 7: `u02/dialoge.json`

6 dialog, har birida 4–8 satr va kamida ikki gapiruvchi. Gapiruvchi
ism bilan yoziladi (ovoz yasashda obraz biriktiriladi).

## Task 8: `u02/saetze.json` — ~60 gap

Skript bilan yasaladi (**pullik**: bo'limiga bitta `gpt-4o-mini`
chaqiruvi, jami ≈ $0.02). Har bo'limda kamida 6 gap, gaplar 3–7 so'z,
notanish so'z yo'q.

## Task 9: Tekshiruv va seed

`npm run daf:inhalt-check -- --unit 2` → `npm test` → `npm run typecheck`
→ lokal `daf:inhalt-seed -- --unit 2`. Prod seed alohida qadam, CEO
aytganda.

---

## Bu rejada QILINMAYDI

Ovoz · rasm · 3–12 unitlar · yangi mashq formati · ekran o'zgarishi ·
native ilova.
