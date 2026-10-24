# ADR-0120 — Instagram va Facebook reklama formasidagi lidlar webhook orqali to'g'ridan-to'g'ri doskaga tushadi

**Holati:** Qabul qilindi
**Sana:** 2026-10-24
**Bog'liq:** ADR-0093; `server/src/meta-lead-ads/`, `server/src/leads/leads.service.ts`

## Kontekst

Markaz Meta Ads Manager orqali Instagram/Facebook reklamasi beradi. Odam reklamadagi tayyor formani (Lead Ads) to'ldirganda lid Meta ichida qolardi va uni qo'lda ko'chirish kerak edi. Ochiq forma (`/f/<slug>?source=Instagram`) tayyor, lekin odam saytga o'tishi kerak va konversiya pastroq.

## Qaror

1. `POST /webhooks/meta-leads` (`@Public()`). Meta forma to'ldirilganda faqat `leadgen_id` yuboradi. Server uni Graph API'dan oladi (`field_data`, `platform`) va `LeadsService.create` bilan lid yaratadi (`actor.kind = 'meta-lead-ads'`).
2. Imzo `X-Hub-Signature-256` bilan tekshiriladi: xom tana (`rawBody: true`, `main.ts`), HMAC-SHA256, kalit `META_APP_SECRET`, `timingSafeEqual`. Imzosiz yoki noto'g'ri imzoli so'rov 401. `GET /webhooks/meta-leads` Meta'ning ulanish tekshiruvi uchun (`hub.verify_token` = `META_VERIFY_TOKEN`).
3. **Takroriy yetkazish zararsiz.** Meta 200 olmaguncha qayta yuboradi. `Lead.metaLeadId` unique: mavjud bo'lsa o'tkazib yuboriladi, parallel yetkazishda `P2002` yutiladi. Graph API xato bersa 500 qaytadi, Meta qayta urinadi.
4. **Birinchi versiya: bitta bo'lim.** Hamma lid `META_LEAD_SECTION_ID` bo'limiga tushadi; filial va kompaniya shu bo'limdan olinadi. Forma → bo'lim xaritasi va sozlamalar sahifasi yo'q.
5. Manba nomi `platform` dan: `ig` → «Instagram», boshqasi → «Facebook». Topilmasa yaratiladi (ochiq forma qoidasi bilan bir xil, tarixga yoziladi).
6. Telefon `normalizeSharedPhone` bilan (9 xona). Telefonsiz yoki ismsiz lid yaratilmaydi, ogohlantirish yoziladi (qayta urinish bunga yordam bermaydi, shuning uchun 200).

## Oqibatlar

- Env: `META_APP_SECRET`, `META_VERIFY_TOKEN`, `META_PAGE_TOKEN` (uzoq muddatli sahifa tokeni, `leads_retrieval`), `META_LEAD_SECTION_ID`. Biri yo'q bo'lsa webhook 503 beradi.
- Tashqarida qo'lda: Meta ilovasi, Page'ga `leadgen` obunasi, webhook manzili `https://api.dafzentrum.uz/api/webhooks/meta-leads`.
- Bir nechta bo'lim yoki filial kerak bo'lsa, forma → bo'lim xaritasi alohida ADR bilan qo'shiladi.
- Graph API'dagi `platform` maydoni Meta'ning «Lead Ads Testing Tool» bilan tekshiriladi; yo'q bo'lsa hamma lid «Facebook» manbasiga tushadi.
