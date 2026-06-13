# Check Employee — tezkor xodim diagnostikasi

Bitta xodim (User — o'qituvchi yoki boshqa rol) haqida real backenddan to'liq, **READ-ONLY**
ma'lumot olib keladi: profil + rollar + filiallar, o'qitadigan guruhlar (agar teacher), ish haqi
konfiguratsiyasi (versiyalar bilan), joriy to'lanmagan accruallar (guruh bo'yicha + carry-over),
ish haqi to'lovlari tarixi. `server/scripts/check-employee.ts` ni ishga tushiradi.

Argument (`$ARGUMENTS`): `<employeeId> [--dev] [--full]`
- `--dev` — lokal dev DB. **Default: PROD** (`railway run`).
- `--full` — salary versiya tarixi + teacher tranzaksiyalarini ham ochadi.

## Usage

```
/check-employee 10010          → PROD (o'qituvchi #10010)
/check-employee 10010 --dev    → lokal dev DB
/check-employee 10010 --full   → versiya tarixi + tranzaksiyalar bilan
```

## Instructions

`$ARGUMENTS` ni quyidagicha bajar:

### 1. Argumentlarni ajrat
- `--dev`, `--full` flaglarini ajratib ol; qolgan birinchi son — `employeeId`.
- `employeeId` bo'lmasa: `Usage: /check-employee <employeeId> [--dev] [--full]`.

### 2. Buyruqni qur va ishga tushir (Bash)
- **`--dev` bor bo'lsa:**
  ```bash
  cd server && npx ts-node --transpile-only scripts/check-employee.ts <employeeId> [--full]
  ```
- **Aks holda (default, PROD):**
  ```bash
  cd server && railway run npx ts-node --transpile-only scripts/check-employee.ts <employeeId> [--full]
  ```
- `railway run` xizmat so'rasa: `cd server && railway status` bilan tekshir / `--service` qo'sh.

### 3. Natijani taqdim et
- Scriptning to'liq chiqishini ko'rsat.
- **Tepada qisqa markdown xulosa** ber: xodim #id, F.I.Sh, rol(lar), status, guruhlar soni (teacher
  bo'lsa), joriy to'lanmagan accrual jami.
- "NOT FOUND" bo'lsa — shu DB da topilmaganini ayt.
