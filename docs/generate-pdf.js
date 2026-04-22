const puppeteer = require('/tmp/node_modules/puppeteer');
const fs = require('fs');
const path = require('path');

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page { size: A4; margin: 2cm; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
    font-size: 11pt;
    line-height: 1.7;
    color: #1a1a1a;
    max-width: 100%;
  }
  h1 {
    font-size: 22pt;
    color: #111;
    border-bottom: 3px solid #2563eb;
    padding-bottom: 8px;
    margin-top: 0;
  }
  h2 {
    font-size: 16pt;
    color: #1e40af;
    margin-top: 32px;
    border-bottom: 1px solid #ddd;
    padding-bottom: 4px;
    page-break-after: avoid;
  }
  h3 {
    font-size: 13pt;
    color: #374151;
    margin-top: 20px;
    page-break-after: avoid;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0;
    font-size: 10pt;
    page-break-inside: avoid;
  }
  th {
    background: #f1f5f9;
    font-weight: 600;
    text-align: left;
    padding: 8px 10px;
    border: 1px solid #cbd5e1;
  }
  td {
    padding: 6px 10px;
    border: 1px solid #e2e8f0;
  }
  tr:nth-child(even) td {
    background: #f8fafc;
  }
  strong { color: #111; }
  hr {
    border: none;
    border-top: 1px solid #e2e8f0;
    margin: 24px 0;
  }
  ul, ol { padding-left: 24px; }
  li { margin-bottom: 4px; }
  .note {
    background: #fffbeb;
    border-left: 4px solid #f59e0b;
    padding: 10px 14px;
    margin: 12px 0;
    font-size: 10pt;
  }
  .flow-box {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 16px;
    margin: 12px 0;
    font-size: 10pt;
    white-space: pre-line;
  }
</style>
</head>
<body>

<h1>DaF Sprachzentrum — Moliyaviy Tizim</h1>
<p><strong>Versiya:</strong> 1.0 &nbsp;&nbsp; <strong>Sana:</strong> 2026-yil 14-aprel</p>

<hr>

<h2>1. Tizim haqida</h2>
<p>DaF Sprachzentrum o'quv markazining moliyaviy tizimi quyidagi vazifalarni bajaradi:</p>
<ul>
  <li>O'quvchilardan to'lov qabul qilish (naqd va online)</li>
  <li>O'qituvchilarga oylik hisoblash va to'lash</li>
  <li>Markaz xarajatlarini qayd qilish</li>
  <li>O'quvchi shartnomalarini boshqarish</li>
  <li>Pul qaytarish (refund) jarayoni</li>
  <li>Moliyaviy hisobotlar</li>
</ul>

<hr>

<h2>2. O'quvchi to'lov jarayoni</h2>

<h3>2.1 To'lov qanday ishlaydi</h3>
<ol>
  <li>O'quvchi kassaga (yoki kelajakda Payme/Click/Uzum orqali) pul to'laydi</li>
  <li>Kassir tizimga to'lovni qayd qiladi: summa, usul, o'quvchi</li>
  <li>O'quvchining <strong>hisobi</strong> (balansi) shu summaga oshadi</li>
  <li>O'quvchi guruhga yozilganda <strong>kurs narxi bittada hisobdan yechiladi</strong></li>
</ol>

<h3>2.2 Balans qanday ishlaydi</h3>
<p><strong>Misol:</strong> Kurs narxi 800,000 so'm, 12 darslik sikl</p>

<table>
  <tr><th>Hodisa</th><th>Balans</th></tr>
  <tr><td>O'quvchi 800,000 to'laydi</td><td>+800,000 so'm</td></tr>
  <tr><td>Guruhga yoziladi → 800,000 yechiladi</td><td>0 so'm</td></tr>
  <tr><td>1-chi dars ... 12-chi dars</td><td>0 so'm (o'zgarmaydi)</td></tr>
  <tr><td>13-chi dars boshlanishida → yana 800,000 yechiladi</td><td>-800,000 so'm</td></tr>
  <tr><td>O'quvchi yana to'lov qiladi</td><td>Ijobiy balansga qaytadi</td></tr>
</table>

<div class="note">
  <strong>Muhim:</strong> Balans manfiy bo'lsa — o'quvchi QR kod bilan davomatga kirolmaydi. O'quvchiga "Ma'muriyatga murojaat qiling" xabari chiqadi.
</div>

<h3>2.3 To'lov usullari</h3>
<table>
  <tr><th>Usul</th><th>Holati</th></tr>
  <tr><td>Naqd pul (kassa)</td><td>✅ Ishlaydi</td></tr>
  <tr><td>Payme</td><td>🔜 Rejalashtirilgan</td></tr>
  <tr><td>Click</td><td>🔜 Rejalashtirilgan</td></tr>
  <tr><td>Uzum Bank</td><td>🔜 Rejalashtirilgan</td></tr>
  <tr><td>Bank o'tkazmasi</td><td>✅ Ishlaydi</td></tr>
</table>

<hr>

<h2>3. O'qituvchi oyligi</h2>

<h3>3.1 Oylik qanday hisoblanadi</h3>
<p>Har bir o'qituvchiga oylik <strong>ikki usulda</strong> belgilanishi mumkin:</p>

<p><strong>1-usul: Foizli</strong></p>
<ul>
  <li>Masalan: har o'quvchidan dars narxining <strong>40%</strong> i</li>
  <li>Kurs narxi 800,000 ÷ 12 dars = 66,667 so'm (1 dars narxi)</li>
  <li>Ustoz ulushi: 66,667 × 40% = <strong>26,667 so'm</strong> (har dars, har o'quvchi)</li>
  <li>10 o'quvchi kelsa: 26,667 × 10 = <strong>266,670 so'm</strong> (1 dars uchun)</li>
</ul>

<p><strong>2-usul: Belgilangan summa</strong></p>
<ul>
  <li>Masalan: har o'quvchidan <strong>100,000 so'm</strong> oyiga</li>
  <li>10 o'quvchi bo'lsa: 100,000 × 10 = <strong>1,000,000 so'm</strong> oyiga</li>
</ul>

<div class="note">
  <strong>Muhim:</strong> Oylik faqat ustoz davomat olganda hisoblanadi. Agar ustoz biror darsda davomat olmasa, o'sha dars uchun oylik hisoblanmaydi.
</div>

<h3>3.2 Oylik hisoblash tartibi</h3>
<table>
  <tr><th>Sana</th><th>Nima bo'ladi</th></tr>
  <tr><td>Oy davomida</td><td>Har darsda, har kelgan o'quvchi uchun ustoz hisobiga yig'iladi</td></tr>
  <tr><td>Oyning 7-si</td><td>Hisoblash to'xtaydi (cutoff sana)</td></tr>
  <tr><td>Oyning 8-si</td><td>Tizim avtomatik barcha ustozlar oyligini hisoblaydi</td></tr>
  <tr><td>8-dan keyin</td><td>Yangi hisob keyingi oyga yig'ila boshlaydi</td></tr>
  <tr><td>Direktor tasdiqlaydi</td><td>Hisoblangan oylik tasdiqlanadi</td></tr>
  <tr><td>10-sanada</td><td>Oylik to'lanadi</td></tr>
</table>

<h3>3.3 Ustoz profilida ko'rinadigan ma'lumotlar</h3>
<ul>
  <li><strong>Kutilayotgan oylik</strong> — o'quvchilar soni × sozlama bo'yicha taxminiy oylik</li>
  <li><strong>Haqiqiy yig'ilgan</strong> — shu kungacha faqat kelgan o'quvchilardan yig'ilgan summa</li>
  <li><strong>Jami to'langan</strong> — avvalgi oylarda to'langan barcha oyliklar yig'indisi</li>
  <li><strong>Guruhlar bo'yicha</strong> — har guruhda nechta o'quvchi, qancha kutilmoqda</li>
</ul>

<hr>

<h2>4. Xarajatlar</h2>
<p>Markaz xarajatlarini qayd qilish tizimi:</p>
<table>
  <tr><th>Kategoriya</th><th>Misol</th></tr>
  <tr><td>Ijara</td><td>Bino ijarasi</td></tr>
  <tr><td>Kommunal</td><td>Elektr, suv, gaz</td></tr>
  <tr><td>Ta'minot</td><td>Doskalar, kitoblar, printer</td></tr>
  <tr><td>Marketing</td><td>Reklama, SMM</td></tr>
  <tr><td>Boshqa</td><td>Boshqa xarajatlar</td></tr>
</table>
<p>Har bir xarajat uchun summa, tavsif, sana va kim qayd qilgani saqlanadi.</p>

<hr>

<h2>5. Shartnoma</h2>

<h3>5.1 Shartnoma ma'lumotlari</h3>
<p>Har bir o'quvchi bilan shartnoma tuziladi:</p>
<ul>
  <li><strong>Shartnoma raqami</strong> — avtomatik yaratiladi (masalan: DAF-2026-00001)</li>
  <li><strong>O'quvchi</strong> — kim bilan tuzilgan</li>
  <li><strong>Kurs</strong> — qaysi kurs uchun</li>
  <li><strong>Jami summa</strong> — shartnomadagi to'lov summasi</li>
  <li><strong>To'langan</strong> — hozirga qadar qancha to'langan</li>
  <li><strong>Holat</strong> — faol, tugallangan, bekor qilingan, qaytarilgan</li>
</ul>

<h3>5.2 Shartnoma holatlari</h3>
<div class="flow-box">
Qoralama → Faol → Tugallangan
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;→ Bekor qilingan
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;→ Qaytarilgan (refund)
</div>

<hr>

<h2>6. Pul qaytarish (Refund)</h2>

<h3>6.1 Qaytarish qoidalari</h3>
<table>
  <tr><th>Holat</th><th>Qaytariladigan summa</th></tr>
  <tr><td>Kurs hali boshlanmagan</td><td><strong>100%</strong> qaytariladi</td></tr>
  <tr><td>Kursning yarmi yoki kamrog'i o'tilgan</td><td>O'tilgan darslar narxi yechib, <strong>qolgan qismi</strong> qaytariladi</td></tr>
  <tr><td>Kursning yarmidan ko'pi o'tilgan</td><td><strong>Qaytarilmaydi</strong></td></tr>
  <tr><td>Intizom buzilishi sababli chetlatilgan</td><td><strong>Qaytarilmaydi</strong></td></tr>
</table>

<h3>6.2 Hisob-kitob misoli</h3>
<p><strong>Sharoit:</strong> Kurs 800,000 so'm, 12 darslik, o'quvchi 5 darsga qatnashgan</p>
<table>
  <tr><th>Hisob</th><th>Summa</th></tr>
  <tr><td>1 dars narxi</td><td>800,000 ÷ 12 = 66,667 so'm</td></tr>
  <tr><td>5 dars uchun</td><td>66,667 × 5 = 333,333 so'm</td></tr>
  <tr><td><strong>Qaytariladigan</strong></td><td><strong>800,000 - 333,333 = 466,667 so'm</strong></td></tr>
  <tr><td>Muddat</td><td>15 ish kuni ichida</td></tr>
</table>

<div class="note">
  <strong>Eslatma:</strong> Agar o'qituvchiga oylik to'langan bo'lsa, u qaytarilmaydi — bu markaz xarajati sifatida qoladi.
</div>

<hr>

<h2>7. Moliyaviy hisobot</h2>

<h3>7.1 Umumiy ko'rsatkichlar</h3>
<p>Moliya bo'limida quyidagi ma'lumotlar ko'rsatiladi:</p>
<table>
  <tr><th>Ko'rsatkich</th><th>Tavsif</th></tr>
  <tr><td>Jami tushum</td><td>Barcha to'lovlar yig'indisi</td></tr>
  <tr><td>Kutilayotgan tushum</td><td>Faol o'quvchilar × kurs narxi (taxminiy)</td></tr>
  <tr><td>Yig'ilgan foiz</td><td>Haqiqiy tushum ÷ kutilayotgan × 100</td></tr>
  <tr><td>Jami xarajat</td><td>Barcha xarajatlar + oyliklar</td></tr>
  <tr><td>Sof foyda</td><td>Tushum - xarajat</td></tr>
  <tr><td>Qarzdorlar soni</td><td>Balansi manfiy o'quvchilar</td></tr>
</table>

<h3>7.2 To'lov usullari bo'yicha</h3>
<p>Har bir to'lov usuli (naqd, Payme, Click, Uzum) bo'yicha nechta to'lov amalga oshirilgan va jami qancha summa ko'rsatiladi.</p>

<h3>7.3 Ustoz oyliklari</h3>
<ul>
  <li>To'langan oyliklar yig'indisi</li>
  <li>Hali to'lanmagan (kutilayotgan) oyliklar yig'indisi</li>
</ul>

<hr>

<h2>8. Tizimga kirish huquqlari</h2>
<table>
  <tr>
    <th>Bo'lim</th><th>Direktor</th><th>Filial boshlig'i</th><th>Administrator</th><th>Kassir</th><th>O'qituvchi</th><th>O'quvchi</th>
  </tr>
  <tr><td>To'lov qabul qilish</td><td>✅</td><td>✅</td><td>✅</td><td>✅</td><td>❌</td><td>❌</td></tr>
  <tr><td>To'lovlar ro'yxati</td><td>✅</td><td>✅</td><td>✅</td><td>✅</td><td>❌</td><td>❌</td></tr>
  <tr><td>Qarzdorlar</td><td>✅</td><td>✅</td><td>✅</td><td>✅</td><td>❌</td><td>❌</td></tr>
  <tr><td>Ustoz oyligi</td><td>✅</td><td>✅</td><td>❌</td><td>❌</td><td>❌</td><td>❌</td></tr>
  <tr><td>Xarajatlar</td><td>✅</td><td>✅</td><td>✅</td><td>❌</td><td>❌</td><td>❌</td></tr>
  <tr><td>Shartnomalar</td><td>✅</td><td>✅</td><td>✅</td><td>❌</td><td>❌</td><td>❌</td></tr>
  <tr><td>Moliyaviy hisobot</td><td>✅</td><td>✅</td><td>❌</td><td>❌</td><td>❌</td><td>❌</td></tr>
  <tr><td>Balans tuzatish</td><td>✅</td><td>✅</td><td>❌</td><td>❌</td><td>❌</td><td>❌</td></tr>
  <tr><td>O'z balansini ko'rish</td><td>❌</td><td>❌</td><td>❌</td><td>❌</td><td>❌</td><td>✅</td></tr>
</table>

<hr>

<h2>9. Kelajak rejalari</h2>
<ul>
  <li>Payme orqali online to'lov qabul qilish</li>
  <li>Click orqali online to'lov</li>
  <li>Uzum Bank orqali online to'lov</li>
  <li>Soliq hisobi avtomatlashtirilishi</li>
  <li>Kvitansiya (check) chiqarish tizimi</li>
  <li>Shartnomani PDF formatda avtomatik yaratish</li>
</ul>

</body>
</html>`;

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.pdf({
    path: '/Users/a1111/Desktop/daf-erp-system/docs/moliyaviy-tizim.pdf',
    format: 'A4',
    margin: { top: '2cm', bottom: '2cm', left: '2cm', right: '2cm' },
    printBackground: true,
  });
  await browser.close();
  console.log('PDF yaratildi: docs/moliyaviy-tizim.pdf');
})();
