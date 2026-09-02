# Arxitektura qarorlari (ADR)

Bu papka loyihaning **qaytarish qiyin bo'lgan qarorlari** jurnali. Har bir fayl bitta qarorni yozib qo'yadi: qaror paytida nima haqiqat edi, nima qaror qilindi, va buning evaziga nima yutildi-yo'qotildi.

Maqsad bitta savolga javob berish: **«nega shunday qilingan, boshqacha emas?»**

---

## Asosiy qoida: ADR o'zgarmaydi

ADR — jurnal, wiki emas. Qabul qilingan ADR **hech qachon tahrirlanmaydi** (imlo xatosidan tashqari).

Qaror eskirsa:

1. Yangi ADR yoziladi, unda eskisiga havola bo'ladi
2. Eski ADR'ning `Holati` maydoni `Almashtirildi — ADR-00NN` ga o'zgartiriladi
3. Eski matn **o'sha joyda qoladi**

Shuning uchun bu jurnalga ishonish mumkin. Agar eski qarorlarni tahrirlab yursak, u shunchaki yana bitta eskirgan hujjatga aylanadi.

---

## Qachon ADR yoziladi

ADR **quyidagilar uchun** yoziladi:

- Ma'lumot modeli qarori — jadval, bog'lanish, majburiy maydon (`User.position` roldan ajratilgani)
- Pul semantikasi — balans, qarz, oylik, qaytarish nimani anglatishi
- Filial/ijara qoidalari — nima ajratiladi, nima ajratilmaydi
- Fail-open vs fail-closed tanlovi
- Tashqi xizmat tanlovi va undan qaytish narxi
- «Ataylab qilmadik» qarorlari — masalan «o'quvchini filialdan filialga ko'chirish qurilmaydi»

ADR **quyidagilar uchun yozilmaydi:**

| Nima | Qayerga yoziladi |
|---|---|
| Kodlash uslubi, nomlash, papka tuzilishi | `server/CLAUDE.md`, `client/CLAUDE.md` |
| «Bu funksiyani qanday ishlatish kerak» | Fayl ichidagi izoh yoki `docs/` qo'llanmasi |
| Bir martalik tuzatish, bug fix | Commit xabari va PR tavsifi |
| Reja, keyin nima qilinadi | `docs/*-plan.md` |
| Audit natijasi, topilmalar ro'yxati | `docs/*-audit.md` |

**Oddiy sinov:** olti oydan keyin kimdir bu koddagi qatorni ko'rib «bu xato-ku, tuzataman» desa va **noto'g'ri qilsa** — demak ADR kerak edi.

---

## Qanday yoziladi

1. `0000-shablon.md` dan nusxa oling
2. Keyingi bo'sh raqamni oling. **Raqam hech qachon qayta ishlatilmaydi**, hatto ADR rad etilsa ham
3. Fayl nomi: `NNNN-qisqa-sarlavha.md` — kichik harf, chiziqcha bilan
4. **O'sha ishning o'zi bilan bitta commit/PR ichida** yoziladi, keyinga qoldirilmaydi
5. Quyidagi indeksga bitta qator qo'shiladi

Uzunligi: bir sahifadan oshmasin. ADR uzun bo'lsa, demak u aslida bir nechta qaror.

---

## Indeks

| # | Sarlavha | Holati | Sana |
|---|---|---|---|
| [0001](0001-bir-yozuv-bitta-filial.md) | Har bir yozuv aniq bitta filialga tegishli | Qabul qilindi | 2026-07-29 |
| [0002](0002-filial-qamrovi-fail-closed.md) | Noma'lum filial qamrovi hech narsani ko'rsatmaydi | Qabul qilindi | 2026-07-29 |
| [0003](0003-route-siyosati-manifest.md) | Har bir route filial siyosati bo'yicha toifalanadi | Qabul qilindi | 2026-08-06 |
| [0004](0004-balans-haqiqati-ledgerda.md) | Balans haqiqati ledger'da saqlangan, qayta hisoblanmaydi | Qabul qilindi | 2026-08-06 |
| [0005](0005-hisobot-pastki-chegarasi.md) | Hisobotlar `Company.systemStartDate` dan boshlanadi | Qabul qilindi | 2026-06-06 |
| [0006](0006-oylik-yagona-manba.md) | Ustoz oyligi faqat `getMonthly` dan o'qiladi | Qabul qilindi | 2026-07-05 |
| [0007](0007-lavozim-roldan-ajratilgan.md) | Lavozim roldan ajratilgan | Qabul qilindi | 2026-08-16 |
| [0008](0008-royxatdan-otish-aktori-oshkora.md) | Chaqiruvchisi yo'q yozuv o'zini oshkora e'lon qiladi | Qabul qilindi | 2026-08-19 |
| [0009](0009-deutsch-tutor-olib-tashlandi.md) | Deutsch Tutor noldan qayta quriladi, eski qatlam olib tashlandi | Qabul qilindi | 2026-08-19 |
| [0012](0012-bosh-sahifa-qayta-hisoblamaydi.md) | Bosh sahifa paneli raqamlarni qayta hisoblamaydi | Qabul qilindi | 2026-09-02 |

> 0001–0007 **retroaktiv** yozilgan (2026-08-19): qarorlar o'sha sanalarda amalda qabul qilingan, ADR keyinroq rasmiylashtirilgan. Sana ustunida qaror sanasi turadi, yozilgan sana emas.
