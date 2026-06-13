# Check Group — tezkor guruh diagnostikasi

Bitta guruh haqida real backenddan to'liq, **READ-ONLY** ma'lumot olib keladi: guruh ma'lumoti
(kurs, narx, jadval, status), o'qituvchi(lar) + ish haqi konfiguratsiyasi, aktiv o'quvchilar ro'yxati
(balans, prepaid), status bo'yicha sanoq va moliyaviy xulosa (jami qarz, qarzdorlar, prepaid).
`server/scripts/check-group.ts` ni ishga tushiradi.

Argument (`$ARGUMENTS`): `<groupNumber | nom> [--branch=<id>] [--dev] [--full]`
- Guruh `id` UUID — uni yozish shart emas. Argument **son** bo'lsa `groupNumber` bo'yicha, aks holda
  **nom** bo'yicha (case-insensitive) qidiradi. Bir nechta mos kelsa script ro'yxat chiqaradi —
  `--branch=<id>` bilan aniqlashtir.
- `--dev` — lokal dev DB. **Default: PROD** (`railway run`).
- `--full` — oxirgi dars davomatini ham ko'rsatadi.

## Usage

```
/check-group 45                → groupNumber=45 (PROD)
/check-group "A1-Dushanba"     → nom bo'yicha
/check-group 45 --branch=2     → ikki filialda bir xil bo'lsa aniqlashtirish
/check-group 45 --dev --full   → dev DB, oxirgi davomat bilan
```

## Instructions

`$ARGUMENTS` ni quyidagicha bajar:

### 1. Argumentlarni ajrat
- `--dev`, `--full`, `--branch=<id>` flaglarini ajratib ol; qolgani — guruh identifikatori
  (raqam yoki nom; nomda bo'sh joy bo'lsa qo'shtirnoq bilan o'rab uzat).
- Identifikator bo'lmasa: `Usage: /check-group <groupNumber | nom> [--branch=<id>] [--dev] [--full]`.

### 2. Buyruqni qur va ishga tushir (Bash)
- **`--dev` bor bo'lsa:**
  ```bash
  cd server && npx ts-node --transpile-only scripts/check-group.ts <ident> [--branch=<id>] [--full]
  ```
- **Aks holda (default, PROD):**
  ```bash
  cd server && railway run npx ts-node --transpile-only scripts/check-group.ts <ident> [--branch=<id>] [--full]
  ```
- `railway run` xizmat so'rasa: `cd server && railway status` bilan tekshir / `--service` qo'sh.

### 3. Natijani taqdim et
- Scriptning to'liq chiqishini ko'rsat.
- Script bir nechta guruh topib **ro'yxat** chiqargan bo'lsa — foydalanuvchiga `--branch=<id>` yoki
  aniqroq nom bilan qайta urinishni taklif qil.
- Bitta guruh bo'lsa: **tepada qisqa markdown xulosa** ber (guruh nomi, kurs, status, aktiv o'quvchilar
  soni, jami qarz).
