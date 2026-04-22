import markdown
from weasyprint import HTML

md_content = """
# DaF Sprachzentrum — Moliyaviy Tizim

**Versiya:** 1.0 | **Sana:** 2026-yil 14-aprel

---

## 1. Tizim haqida

DaF Sprachzentrum o'quv markazining moliyaviy tizimi quyidagi vazifalarni bajaradi:

- O'quvchilardan to'lov qabul qilish (naqd va online)
- O'qituvchilarga oylik hisoblash va to'lash
- Markaz xarajatlarini qayd qilish
- O'quvchi shartnomalarini boshqarish
- Pul qaytarish (refund) jarayoni
- Moliyaviy hisobotlar

---

## 2. O'quvchi to'lov jarayoni

### 2.1 To'lov qanday ishlaydi

1. O'quvchi kassaga (yoki kelajakda Payme/Click/Uzum orqali) pul to'laydi
2. Kassir tizimga to'lovni qayd qiladi: summa, usul, o'quvchi
3. O'quvchining **hisobi** (balansi) shu summaga oshadi
4. O'quvchi guruhga yozilganda **kurs narxi** bittada hisobdan yechiladi

### 2.2 Balans qanday ishlaydi

**Misol:** Kurs narxi 800,000 so'm, 12 darslik sikl

| Hodisa | Balans |
|--------|--------|
| O'quvchi 800,000 to'laydi | +800,000 so'm |
| Guruhga yoziladi → 800,000 yechiladi | 0 so'm |
| 1-chi dars... 12-chi dars | 0 so'm (o'zgarmaydi) |
| 13-chi dars boshlanishida → yana 800,000 yechiladi | -800,000 so'm |
| O'quvchi yana to'lov qiladi | Ijobiy balansga qaytadi |

**Muhim qoidalar:**
- Balans manfiy bo'lsa — o'quvchi QR kod bilan davomatga kirolmaydi
- O'quvchiga "Ma'muriyatga murojaat qiling" xabari chiqadi
- Ustoz qo'lda davomat olganda ham ogohlantirish ko'rinadi

### 2.3 To'lov usullari

| Usul | Holati |
|------|--------|
| Naqd pul (kassa) | Ishlaydi |
| Payme | Rejalashtirilgan |
| Click | Rejalashtirilgan |
| Uzum Bank | Rejalashtirilgan |
| Bank o'tkazmasi | Ishlaydi |

---

## 3. O'qituvchi oyligi

### 3.1 Oylik qanday hisoblanadi

Har bir o'qituvchiga oylik **ikki usulda** belgilanishi mumkin:

**1-usul: Foizli**
- Masalan: har o'quvchidan dars narxining **40%** i
- Kurs narxi 800,000 / 12 dars = 66,667 so'm (1 dars)
- Ustoz ulushi: 66,667 × 40% = **26,667 so'm** (har dars, har o'quvchi)
- 10 o'quvchi kelsa: 26,667 × 10 = **266,670 so'm** (1 dars uchun)

**2-usul: Belgilangan summa**
- Masalan: har o'quvchidan **100,000 so'm** oyiga
- 10 o'quvchi bo'lsa: 100,000 × 10 = **1,000,000 so'm** oyiga

### 3.2 Oylik hisoblash tartibi

| Sana | Nima bo'ladi |
|------|-------------|
| Oy davomida | Har darsda, har kelgan o'quvchi uchun ustoz hisobiga yig'iladi |
| Oyning 7-si | Hisoblash to'xtaydi (cutoff) |
| Oyning 8-si | Tizim avtomatik barcha ustozlar oyligini hisoblaydi |
| 8-dan keyin | Yangi hisob keyingi oyga yig'iladi |
| CEO tasdiqlaydi | Hisoblangan oylik tasdiqlanadi |
| 10-sanada | Oylik to'lanadi |

### 3.3 Ustoz profilida ko'rinadigan ma'lumotlar

- **Kutilayotgan oylik** — nechta o'quvchisi bor × config bo'yicha taxminiy oylik
- **Haqiqiy yig'ilgan** — shu kungacha haqiqatda yig'ilgan summa (faqat kelgan o'quvchilar hisobida)
- **Jami to'langan** — avvalgi oylarda to'langan barcha oyliklar yig'indisi
- **Guruhlar bo'yicha taqsimot** — har guruhda nechta o'quvchi, qancha kutilmoqda

---

## 4. Xarajatlar

Markaz xarajatlarini qayd qilish tizimi:

| Kategoriya | Misol |
|------------|-------|
| Ijara | Bino ijarasi |
| Kommunal | Elektr, suv, gaz |
| Ta'minot | Doskalar, kitoblar, printer |
| Marketing | Reklama, SMM |
| Boshqa | Boshqa xarajatlar |

Har bir xarajat uchun summa, tavsif, sana va kim qayd qilgani saqlanadi.

---

## 5. Shartnoma (Kontrakt)

### 5.1 Shartnoma ma'lumotlari

Har bir o'quvchi bilan shartnoma tuziladi:
- **Shartnoma raqami** — avtomatik (masalan: DAF-2026-00001)
- **O'quvchi** — kim bilan tuzilgan
- **Kurs** — qaysi kurs uchun
- **Jami summa** — shartnomadagi to'lov summasi
- **To'langan** — hozirga qadar qancha to'langan
- **Holat** — faol, tugallangan, bekor qilingan, qaytarilgan

### 5.2 Shartnoma holatlari

```
Qoralama → Faol → Tugallangan
                 → Bekor qilingan
                 → Qaytarilgan (refund)
```

---

## 6. Pul qaytarish (Refund)

O'quvchi pulini qaytarib olmoqchi bo'lganda quyidagi qoidalar amal qiladi:

### 6.1 Qaytarish qoidalari

| Holat | Qaytariladigan summa |
|-------|---------------------|
| Kurs hali boshlanmagan | **100%** qaytariladi |
| Kursning yarmi yoki kamrog'i o'tilgan | O'tilgan darslar narxi yechib, **qolgan qismi** qaytariladi |
| Kursning yarmidan ko'pi o'tilgan | **Qaytarilmaydi** |
| Intizom buzilishi sababli chetlatilgan | **Qaytarilmaydi** |

### 6.2 Hisob-kitob misoli

**Sharoit:** Kurs 800,000 so'm, 12 darslik, o'quvchi 5 darsga qatnashgan

| Hisob | Summa |
|-------|-------|
| 1 dars narxi | 800,000 ÷ 12 = 66,667 so'm |
| 5 dars uchun | 66,667 × 5 = 333,333 so'm |
| **Qaytariladigan** | 800,000 - 333,333 = **466,667 so'm** |
| Muddat | 15 ish kuni ichida |

**Eslatma:** Agar o'qituvchiga oylik to'langan bo'lsa, u qaytarilmaydi — bu markaz xarajati sifatida qoladi.

---

## 7. Moliyaviy hisobot

### 7.1 Umumiy ko'rsatkichlar

Moliya bo'limida quyidagi ma'lumotlar ko'rsatiladi:

- **Jami tushum** — barcha to'lovlar yig'indisi
- **Kutilayotgan tushum** — faol o'quvchilar × kurs narxi (taxminiy)
- **Yig'ilgan foiz** — haqiqiy tushum ÷ kutilayotgan tushum × 100
- **Jami xarajat** — barcha xarajatlar + oyliklar
- **Sof foyda** — tushum - xarajat
- **Qarzdorlar soni** — balansi manfiy o'quvchilar

### 7.2 To'lov usullari bo'yicha

Har bir to'lov usuli (naqd, Payme, Click, Uzum) bo'yicha:
- Nechta to'lov amalga oshirilgan
- Jami qancha summa

### 7.3 Ustoz oyliklari

- To'langan oyliklar yig'indisi
- Hali to'lanmagan (kutilayotgan) oyliklar yig'indisi

---

## 8. Tizimga kirish huquqlari

| Bo'lim | Direktor | Filial boshlig'i | Administrator | Kassir | O'qituvchi | O'quvchi |
|--------|----------|------------------|---------------|--------|------------|----------|
| To'lov qabul qilish | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| To'lovlar ro'yxati | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Qarzdorlar | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Ustoz oyligi | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Xarajatlar | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Shartnomalar | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Moliyaviy hisobot | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Balans tuzatish | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| O'z balansini ko'rish | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## 9. Kelajak rejalari

- Payme orqali online to'lov qabul qilish
- Click orqali online to'lov
- Uzum Bank orqali online to'lov
- Soliq hisobi avtomatlashtirilishi
- Kvitansiya (check) chiqarish tizimi
- Shartnomani PDF formatda avtomatik yaratish
"""

# Convert markdown to HTML
html_body = markdown.markdown(md_content, extensions=['tables'])

# Full HTML with styling
full_html = f"""
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page {{
    size: A4;
    margin: 2cm;
  }}
  body {{
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 11pt;
    line-height: 1.6;
    color: #1a1a1a;
  }}
  h1 {{
    font-size: 22pt;
    color: #111;
    border-bottom: 3px solid #2563eb;
    padding-bottom: 8px;
    margin-top: 0;
  }}
  h2 {{
    font-size: 16pt;
    color: #1e40af;
    margin-top: 28px;
    border-bottom: 1px solid #ddd;
    padding-bottom: 4px;
  }}
  h3 {{
    font-size: 13pt;
    color: #374151;
    margin-top: 20px;
  }}
  table {{
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0;
    font-size: 10pt;
  }}
  th {{
    background: #f1f5f9;
    font-weight: 600;
    text-align: left;
    padding: 8px 10px;
    border: 1px solid #e2e8f0;
  }}
  td {{
    padding: 6px 10px;
    border: 1px solid #e2e8f0;
  }}
  tr:nth-child(even) td {{
    background: #f8fafc;
  }}
  code {{
    background: #f1f5f9;
    padding: 1px 4px;
    border-radius: 3px;
    font-size: 10pt;
  }}
  pre {{
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    padding: 12px;
    border-radius: 6px;
    font-size: 9pt;
    white-space: pre-wrap;
  }}
  strong {{
    color: #111;
  }}
  hr {{
    border: none;
    border-top: 1px solid #e2e8f0;
    margin: 20px 0;
  }}
  ul, ol {{
    padding-left: 24px;
  }}
  li {{
    margin-bottom: 4px;
  }}
</style>
</head>
<body>
{html_body}
</body>
</html>
"""

HTML(string=full_html).write_pdf('/Users/a1111/Desktop/daf-erp-system/docs/moliyaviy-tizim.pdf')
print("PDF yaratildi: docs/moliyaviy-tizim.pdf")
