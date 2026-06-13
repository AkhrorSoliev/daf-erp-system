# Check Student — tezkor o'quvchi diagnostikasi

Bitta o'quvchi haqida real backenddan to'liq, **READ-ONLY** ma'lumot olib keladi: profil, balans,
enrollmentlar, davomat, to'lovlar, ledger, adolatli balans tekshiruvi (ortiqcha/kam hisoblangan),
to'lov va'dalari, oxirgi qo'ng'iroqlar. `server/scripts/check-student.ts` ni ishga tushiradi.

Argument (`$ARGUMENTS`): `<studentId> [--dev] [--full]`
- `--dev` — lokal dev DB (`.env`). **Berilmasa default: PROD** (`railway run`, Railway `caring-courage`).
- `--full` — to'liq davomat va ledger jadvallarini ham ochadi.

## Usage

```
/check-student 10519           → PROD
/check-student 10519 --dev     → lokal dev DB
/check-student 10519 --full    → to'liq ledger + davomat (PROD)
```

## Instructions

`$ARGUMENTS` ni quyidagicha bajar:

### 1. Argumentlarni ajrat
- `--dev`, `--full` flaglarini ajratib ol; qolgan birinchi son — `studentId`.
- `studentId` bo'lmasa: `Usage: /check-student <studentId> [--dev] [--full]` chiqar va to'xta.

### 2. Buyruqni qur va ishga tushir (Bash)
- **`--dev` bor bo'lsa** (lokal dev):
  ```bash
  cd server && npx ts-node --transpile-only scripts/check-student.ts <studentId> [--full]
  ```
- **Aks holda (default, PROD):**
  ```bash
  cd server && railway run npx ts-node --transpile-only scripts/check-student.ts <studentId> [--full]
  ```
- Agar `railway run` xizmat tanlashni so'rasa: avval `cd server && railway status` bilan tekshir,
  kerak bo'lsa `--service <name>` qo'sh yoki bir marta `railway link`.

### 3. Natijani taqdim et
- Scriptning to'liq chiqishini ko'rsat.
- **Tepada 1-2 qatorli markdown xulosa** ber: o'quvchi #id, F.I.Sh, status, **balans**, va adolatli
  balans tekshiruvi natijasi (✓ to'g'ri / ⚠ ortiqcha / ⚠ qarz).
- "NOT FOUND" bo'lsa — shu DB da topilmaganini ayt (prod/dev qaysi ekanini eslat).
