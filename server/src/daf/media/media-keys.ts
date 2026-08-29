/**
 * `sourceId`dan barqaror qiymat yasovchi yordamchilar — R2 kaliti va
 * generatsiya urug'i (seed).
 *
 * Ikkalasi ham shu yerda, bir faylda: ikkalasi ham "so'z HAR DOIM bitta
 * qat'iy qiymatga tegishli bo'lsin" degan bitta qoidaning ikki ko'rinishi
 * (kalit — qayerga saqlansin, urug' — qanday chizilsin).
 */
import { createHash } from 'crypto';

/**
 * R2 kaliti HTTP(S) manzilning bir qismi sifatida ham ishlatiladi
 * (`R2_PUBLIC_URL + '/' + key`, `daf-portal-read.service.ts`dagi
 * `mediaUrl` shu tarzda yopishtiradi — kodlamasdan). `sourceId`dagi `#`
 * belgisi (masalan `dib-voc-03-01#2`) manzilda BO'LAK AJRATGICH: brauzer
 * `#`dan keyingisini serverga umuman yubormaydi, natijada `daf/img/dib-
 * voc-03-01#2.jpg` so'rovi `daf/img/dib-voc-03-01`ga qisqarib, R2'dan 404
 * qaytadi — rasm R2'da BOR bo'lsa ham. Bu xato prod'da bir marta jimgina
 * chiqdi (HTTP javob keladi, shuning uchun sezilmaydi).
 *
 * Tuzatish KODLASH (`encodeURIComponent`) EMAS, TOZALASH: kodlangan
 * kalitni HAR bir iste'molchi (klient, skript, o'qituvchi paneli) o'zi
 * qayta kodlashi kerak bo'lardi, va kimdir albatta unutadi — bitta
 * unutish yetarli, mina qayta portlaydi. Shuning uchun manzilda xavfli
 * bo'lgan HAR qanday belgi (harf-raqam-nuqta-tire-pastki chiziqdan
 * boshqasi: `#`, `?`, bo'shliq, `%`, ...) kalitning o'zida `_`ga
 * almashtiriladi — natija allaqachon xavfsiz ASCII, hech kim hech
 * narsani eslab yurishi shart emas.
 */
const UNSAFE_KEY_CHARS = /[^A-Za-z0-9._-]/g;

/**
 * So'z uchun R2'dagi rasm kaliti. Kengaytma har doim `.jpg` — bu FLUX
 * skriptining o'zi so'raydigan format (`fal-client.ts`da
 * `output_format: 'jpeg'`), shuning uchun bu yerda ham qattiq yozilgan.
 */
export function imageKeyFor(sourceId: string): string {
  return `daf/img/${sourceId.replace(UNSAFE_KEY_CHARS, '_')}.jpg`;
}

/**
 * `sourceId`dan barqaror rasm urug'i (seed).
 *
 * Nega kerak: FLUX bir xil `prompt` + bir xil `seed` bilan chaqirilsa
 * bir xil rasm qaytaradi. Skript qayta yugurtirilsa (masalan bitta so'z
 * rad etilib qayta so'ralganda emas, butun bo'lim tasodifan ikki marta
 * ishga tushirilganda) tasodifiy urug' har safar boshqa rasm berardi —
 * bu R2'dagi eski faylni yangisi bilan almashtirmaydi (idempotent emas),
 * shuning uchun "bir xil so'z — bir xil rasm" qat'iy talab.
 *
 * `sourceId`ning o'zi (masalan `dib-voc-03-01#2`) sonlarga oson
 * aylantirilmaydi (harflar, tire, `#` bor), shuning uchun SHA-256 orqali
 * hisoblanadi va natijaning birinchi 4 bayti manfiy bo'lmagan butun
 * songa o'giriladi — FLUX `seed` maydoni shu diapazonni kutadi.
 *
 * `attempt` — RAD ETILGAN rasmni qayta chizish uchun. "Bir xil so'z —
 * bir xil rasm" qoidasi rasm YAROQLI bo'lganda foydali, ammo rasm
 * buzuq chiqqanda tuzoqqa aylanadi: 12-bo'limda `sich die Zähne putzen`
 * deyarli qop-qora chiqqan, `der Honig`da suv belgisi bo'lgan — ikkalasi
 * ham o'sha urug' bilan qayta so'ralsa AYNAN o'zi qaytarardi. Urug'ga
 * urinish raqami qo'shilsa model boshqa rasm beradi, va bu ham barqaror:
 * bir xil (`sourceId`, `attempt`) juftligi har doim bir xil rasm.
 *
 * `attempt = 0` da hash MANBANING O'ZIDAN olinadi (`#0` qo'shilmaydi) —
 * shunda allaqachon qabul qilingan yuzlab rasm urug'i o'zgarmay qoladi.
 */
export function seedFor(sourceId: string, attempt = 0): number {
  const input = attempt === 0 ? sourceId : `${sourceId}@${attempt}`;
  const digest = createHash('sha256').update(input).digest();
  return digest.readUInt32BE(0);
}
