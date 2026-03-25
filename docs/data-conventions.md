# Data Conventions

Standard formats used across the entire application.

---

## Phone Numbers

- **Storage format:** 9-digit string without prefix — `901234567`
- **Display format:** `+998 90 123 45 67`
- **Input component:** `<PhoneInput>` auto-adds `+998` prefix and formats as user types
- **Validation:** Must be exactly 9 digits

Example:
```
Stored:    "901234567"
Displayed: "+998 90 123 45 67"
```

## Prices & Currency

- **Storage format:** Integer in so'm (no decimals) — `1500000`
- **Display format:** Comma-separated thousands — `1,500,000 so'm`
- **Input component:** `<PriceInput>` auto-formats with commas
- **Formatting:** `price.toLocaleString("en-US")`

Example:
```
Stored:    1500000
Displayed: "1,500,000 so'm"
```

## Dates

- **Storage format:** ISO 8601 DateTime
- **Display format:** `dd.MM.yyyy` — `25.03.2026`
- **With time:** `dd.MM.yyyy, HH:mm:ss` — `25.03.2026, 14:30:00`
- **Library:** `date-fns`

## IDs

Different models use different ID types:

| Model | ID Type | Example |
|-------|---------|---------|
| Company | Int (4-digit) | `1001` |
| Branch | Int (4-digit) | `1001` |
| User | Int (4-digit) | `1001` |
| Role | Int (sequential) | `1` — `5` |
| Course, Group, Room, Student, Lead, Holiday, Enrollment | UUID | `a1b2c3d4-...` |

## Pagination

- **Default page size:** 10
- **Query parameters:** `page=1&per_page=10` (users/branches) or `page=1&pageSize=10` (others)
- **Response format:**

```json
{
  "data": [],
  "total": 100,
  "page": 1,
  "per_page": 10
}
```

- **Available page sizes (client):** 10, 20, 30, 40, 50

## Gender

Stored as enum:
- `MALE`
- `FEMALE`

## Boolean Flags

- `isActive` — Soft delete flag. `true` = active, `false` = archived/deleted.
- Used on: User, Branch, Course, Group, Student.
