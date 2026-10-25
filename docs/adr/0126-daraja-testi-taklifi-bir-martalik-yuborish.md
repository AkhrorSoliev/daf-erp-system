# 0126. «Darajani aniqlash» taklifi: botdan foydalana oladigan hammaga bir martalik yuborish

- Holati: Qabul qilindi
- Sana: 2026-10-25
- Bog'liq: [0121](0121-darajani-aniqlash-boti-savollar-havzasi.md), [0122](0122-daraja-testi-natijalari-oquvchi-va-statistika.md), [0025](0025-telegram-xabarlari-kunlik-navbatga-jamlanadi.md)

## Kontekst

Test tayyor, lekin uni faqat /start menyusidan topgan odam yechadi (hamma vaqt bo'yicha 1 ta chat). CEO testni botdan foydalana oladigan hammaga bir xil taklif qilishni so'radi.

Botning hamma foydalanuvchisi ro'yxati yo'q: o'quvchi kartasiga bog'langan chatlar (`Student.telegramChatId`) va kanal tekshiruvidan o'tganlar (`TelegramChannelGateEvent`) saqlanadi; /start bosib, hech qaysisiga tushmagan odam faqat 24 soatlik sessiyada turadi.

## Qaror

1. **Auditoriya** (`level-test-invite.audience.ts`): kartasi o'chirilmagan, bot yeta oladigan (`telegramDisconnectedAt` yo'q) hamma o'quvchi chati — holatidan qat'i nazar (chetlatilgan ham); kanal tekshiruvi jadvalidagi, o'quvchi bo'lmagan odamlar. Xodimlar kirmaydi. Testni boshlaganlar va taklif olganlar chiqariladi.
2. **Bir marta.** `LevelTestInvite` (`chatId` unikal) qatori yuborishdan OLDIN `FAILED` bilan egallanadi: qatorni yaratgan chaqiruv yuboradi, ikkinchisi (cronning ikki nusxasi, qayta ishga tushirish) hech narsa yubormaydi. Yuborilgach `SENT`. Yiqilgan yoki rad etilgan qator qayta urinilmaydi — ikki marta yuborishdan ko'ra yubormaslik yaxshi.
3. **Faqat bir kuni.** `LEVEL_TEST_INVITE` = `off` (standart) | `log` | `on`; `LEVEL_TEST_INVITE_DATE` = `YYYY-MM-DD` (Toshkent). Cron har kuni 20:00 da (Toshkent) uyg'onadi, lekin sana mos kelmasa yoki rejim `off` bo'lsa hech narsa qilmaydi. `log` auditoriyani sanab yozadi, yubormaydi. Yakshanba va bayram tekshirilmaydi: sana qo'lda belgilanadi.
4. **Yuborish.** Bitta xabar (HTML) va tagida «📊 Darajani aniqlash» tugmasi (`menu_level`, /start menyusidagi bilan bir xil); `sendTelegramText` orqali (429 da bir marta kutadi), xabarlar orasida 60 ms pauza, ketma-ket 5 ta vaqtinchalik xatoda to'xtaydi. Bot yeta olmagan chatni `StudentChatReach` o'zi belgilaydi. Matn CEO tasdiqlagan (`level-test-invite.text.ts`), «bot» so'zi yo'q.
5. **ADR-0025.** Bu yangi "darhol" yuboriladigan xabar; u `src/telegram/` ichida (ruxsat etilgan ro'yxatda), digestga kirmaydi. Bir martalik, qayta ishlatilmaydi.

## Oqibatlar

- Migratsiya `20261025130000_level_test_invite`.
- Kanal tekshiruvi jadvalidagi odamlarning bot yeta olishi oldindan noma'lum: ularning bir qismiga xabar ketmay `FAILED` bo'ladi.
- /start bosgan, lekin hech qayerda saqlanmagan odamga yuborib bo'lmaydi. Kelajakda har /start ni yozib borish alohida qaror.
