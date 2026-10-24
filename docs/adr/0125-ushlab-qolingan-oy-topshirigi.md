# ADR-0125 — Chiqarishda oy puli ushlab qolinsa, administratorga topshiriq tushadi

**Holati:** Qabul qilindi
**Sana:** 2026-10-19
**Bog'liq:** ADR-0043, ADR-0044, ADR-0083

## Kontekst

Shartnoma 6.2 bo'yicha o'quvchi oyning 40% idan ko'pi o'tgach «Guruhdan chiqarish» bilan ketsa, oy puli qaytmaydi (ADR-0043/0044). Boshqa guruhga o'tish uchun esa «Guruhni o'zgartirish» bor va u o'tmagan darslar pulini qaytaradi. Administratorlar ba'zan o'tishni ham «chiqarish» bilan qilgan: 19.10.2026 da oktabrda shunday 3 ta o'quvchining 692 300 so'm puli ushlab qolingani aniqlandi va qo'lda to'g'rilandi. Bunday holatni tizim o'zi bilmaydi: «chiqarish» va «o'tish» faqat administrator niyatida farqlanadi.

## Qaror

1. `removeFromGroup` shartnoma 6.2 pulni ushlab qolganda (`DepartureOutcome.withheld`) tranzaksiya commitidan keyin `departure.withheld` hodisasini yuboradi. Hodisada o'quvchi, yozilish, guruh, ushlangan summa va o'tgan ulush bor.
2. `TaskAutoService.onDepartureWithheld` shu yozilish uchun bitta **«Pul ushlab qolindi»** (`HELD_MONTH`) avtomatik topshirig'ini ochadi: filial administratorlariga (zanjir: administrator, direktor, CEO), ustuvorlik YUQORI, muddat bugun 18:00 (ish kuniga siljitiladi), `sourceKey` = `held:<enrollmentId>`.
3. Topshiriqni **ijrochi o'zi «Bajarildi» qilib yopa oladi**: haqiqatan ketgan o'quvchida administrator ko'rib chiqib yopadi. Boshqa tizim topshiriqlari (ADR-0083) shunday emas, ular faqat manbasi bilan yopiladi. Yagona istisno `checkTransition` da.
4. Topshiriq o'zi yopiladi, agar: o'quvchi qayta guruhga yozilsa (`student.enrolled`, sabab `STUDENT_ENROLLED`) yoki oy puli qaytarilsa, ya'ni shu yozilishning oylik hisobida `frozenOutDates` paydo bo'lsa (soatlik tozalash, sabab `MONTH_RELEASED`).
5. **Sabab «ko'chdi» deydigan chiqarish o'tkazish sifatida hisoblanadi (CEO, 19.10.2026):** `removeFromGroup` tanlangan ketish sababi nomi guruh almashtirishni bildirsa (`looksLikeGroupMove`: «ko'chdi», «almashdi») siyosat bermaydi, ya'ni `enrollToGroup` o'tkazishidagidek o'tmagan darslar puli balansga o'zi qaytadi, shartnoma 6.2 va sinov darsi (3.5) qo'llanmaydi. Administrator pulni qo'lda to'g'rilamaydi. Bunda topshiriq ochilmaydi (pul ushlanmaydi). Dialog buni yashil izoh bilan aytadi.
6. Boshqa sabab bilan pul ushlansa, matn administratorga «rahbarga ayting» deydi; qaytarishni hozircha rahbar bir martalik skript bilan qiladi.

## Taqiqlanadi

- Topshiriqdan pulni avtomatik qaytarish: chiqarish yoki o'tish administrator niyatiga bog'liq, tizim buni taxmin qilmaydi.
- Qoidani o'zgartirmasdan ogohlantirishni o'chirish: 40% qoidasi (ADR-0043/0044) shundayligicha qoladi.

## Oqibatlar

- Ehtiyot: «Filial almashdi» ham shu qoidaga tushadi (nomida «almash» bor). O'quvchi filialni almashtirib guruhdan chiqsa, pul qaytadi.
- `TaskKind` ga `HELD_MONTH` qo'shildi (migratsiya `20261019110000_task_kind_held_month`). `AutoKind`, `AUTO_RULES`, `task-auto-rules.ts` ga yangi yozuv.
- `DepartureOutcome.withheldAmount`: ushlangan o'tmagan darslar puli (faqat `withheld` bo'lsa 0 dan katta).
- Ochiq savol: pulni administrator o'zi qaytara oladigan ekran (CEO tasdig'i bilan) hali yo'q.
