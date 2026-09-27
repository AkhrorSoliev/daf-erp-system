# ADR-0044 — Darajani tugatgan o'quvchi: shartnoma bajarilgan, oyning o'tilmagan darslari puli qaytadi

**Holati:** Qabul qilindi
**Sana:** 2026-09-27
**Bog'liq:** ADR-0043 ni almashtiradi (40% qoidasi shu yerda to'liq qayta yozilgan), shartnomaning 2.1, 3.4, 6.2 va 10.1 bandlari, ADR-0028, `server/src/billing/departure-policy.ts` (`policyRelease`), `server/src/students/shared/departure-policy-access.ts` (`OPEN_DEPARTURE_POLICIES`), `server/src/students/students-status.service.ts`, `client/src/components/students/departure-money.ts` (`offeredPolicies`)

## Kontekst

ADR-0043 shartnomaning 6.2 bandini kiritdi: o'quvchi o'z qarori bilan ketsa va
oy darslarining 40% idan ko'pi o'tgan bo'lsa, oy to'lovi qaytarilmaydi. Guruhdan
chiqarishda sukut bo'yicha tartib — «O'quvchi o'zi to'xtatdi».

CEO (27.09.2026) bir holatni ko'rsatdi: o'quvchi darajani (A1, A2…) to'liq
tugatib, sertifikat olib o'qishni to'xtatishi yoki keyingi daraja guruhi
ochilishini kutishi mumkin. Guruh keyingi darajada davom etsa, bunday o'quvchi
«Guruhdan chiqarish» bilan chiqariladi va sukut tartibi 40% qoidasini qo'llardi.
Masalan, A1 16-oktabrda tugasa (13 darsdan 7 tasi, 54%), o'quvchi o'qimagan 6
darsi uchun ham to'lagan bo'lib qolardi.

Shartnoma bitta daraja uchun tuziladi (2.1) va o'sha kurs yakunlanguncha amal
qiladi (10.1). Darajani tugatish — shartnomaning bajarilishi, 6.1–6.2 dagi
«bekor qilish» emas. Lekin 3.4-band oy o'rtasida kurs yakunlanganda o'sha oy
qanday to'lanishini aytmas edi.

## Qaror

1. **To'rtta tartib.**
   - `STUDENT_CANCELLED` — «O'quvchi o'zi to'xtatdi» (sukut bo'yicha): o'tilmagan
     darslar puli faqat oy darslarining chegaradan (`payment.noRefundAfterPercent`,
     40) ko'pi o'tmagan bo'lsa qaytadi; «ko'pi» qat'iy.
   - `LEVEL_COMPLETED` — «Darajani tugatdi» (yangi): o'quvchi darajani tugatdi,
     sertifikat olib to'xtaydi yoki keyingi darajani kutadi. O'tilmagan darslar
     puli qaytadi; 40% qoidasi qo'llanmaydi.
   - `CENTER_INITIATIVE` — «Markaz tashabbusi»: o'tilmagan darslar puli qaytadi.
   - `QUALITY_CLAIM` — «Sifat bo'yicha shikoyat»: oyning butun puli qaytadi;
     ustoz haqi kamaymaydi (CEO, 27.09.2026).
2. **Kim tanlaydi.** «O'quvchi o'zi to'xtatdi» va «Darajani tugatdi» ni
   o'quvchini guruhdan chiqara oladigan har kim tanlaydi (administrator ham);
   kim tanlagani tarixdagi «Pul» qatorida qoladi. «Markaz tashabbusi» va «Sifat
   bo'yicha shikoyat» ni faqat CEO yoki filial direktori tanlaydi — huquq
   bazadan o'qiladi (ADR-0028), aks holda 403.
3. **Qayerda.** Guruhdan chiqarish: to'rttala tartib. Chetlatish (`EXPELLED`):
   «Darajani tugatdi» rad etiladi (400) — darajani tugatgan o'quvchi
   chetlatilmaydi. Tartib boshqa holat bilan yuborilsa — 400.
4. **Qolgani ADR-0043 dagidek:** qoida 01.10.2026 dan chiqqanlarga; ulush —
   ketish kunigacha o'tgan hisoblangan darslar ÷ oyning hisoblangan darslari
   (muzlatib chiqarilganlar ikkala tomondan chiqariladi); qaytadigan pul
   bo'lmasa «ushlab qolindi» deyilmaydi; muzlatish, boshqa guruhga o'tkazish,
   guruh, filial yoki kurs yopilishi, guruhni o'chirish va kartani arxivlash
   eski qoidada (o'tilmagan darslar qaytadi). Butun guruh darajani tugatib
   «Tugallangan» bo'lsa — o'tilmagan darslar qaytadi, o'quvchilar avtomatik
   «Bitirgan». Bitta qoida — `policyRelease`, yozuv ham, oyna ham shundan.
5. **Shartnomaga qo'shimcha (3.4-band):** «Daraja oy o'rtasida yakunlansa, shu
   oy uchun faqat daraja yakunlanguniga qadar o'tilgan darslar haqi 1 dars
   qiymati bo'yicha to'lanadi; bu 6.2-band bo'yicha bekor qilish hisoblanmaydi.»
   Yurist nusxasida (`docs/tolov-savollari/shartnoma-2026-taklif.docx`)
   belgilangan qo'shimcha va sababi yozilgan izoh bilan, toza nusxada matn
   sifatida.

**Taqiqlanadi:**
- «Darajani tugatdi» ni chetlatishga qo'llash;
- darajani tugatgan o'quvchining oy pulini 40% qoidasi bilan ushlab qolish.

## Ko'rib chiqilgan muqobillar

- **«Keyingi darajaga o'tadi» varianti.** Sertifikat olib o'qishni to'xtatgan
  o'quvchini qamramasdi. Guruh ochiq bo'lsa, keyingi darajaga «Boshqa guruhga
  o'tkazish» bilan o'tiladi — u 2.2-band bo'yicha qayta hisoblaydi va 40%
  qoidasi unga tegmaydi.
- **Darajani tugatganini tizim o'zi aniqlasin** (guruh kursi o'zgargan kunga
  qarab). Guruh kursni oy o'rtasida o'zgartiradimi-yo'qmi, tizim buni ishonchli
  bilmaydi; tanlovni administrator qiladi va u tarixda qoladi.
- **Darajani tugatgan o'quvchini avtomatik «Bitirgan» qilish.** Keyingi
  darajani kutayotgan o'quvchini guruhga yozishga to'sqinlik qilardi
  («Bitirgan» o'quvchi guruhga yozilmaydi); holat o'zgarmaydi.
- **«Darajani tugatdi» faqat CEO yoki filial direktoriga.** Har kuni
  bo'ladigan ish; administrator uni bajara olmasa, o'quvchi noto'g'ri tartib
  bilan chiqarilardi.

## Oqibatlari

**Yutuq:** darajani tugatgan o'quvchi o'qimagan darslari uchun to'lamaydi;
shartnoma bu holatni aniq aytadi.

**Narx:** administrator «Darajani tugatdi» ni noto'g'ri tanlasa, 40% qoidasi
chetlab o'tiladi. Buni tarixdagi «Pul» qatori (kim, qachon, qancha) ko'rsatadi;
alohida cheklov qo'yilmadi.
