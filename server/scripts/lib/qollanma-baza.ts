/**
 * Qo'llanma skriptlari faqat lokal `daf_docs` bazasida ishlaydi. `server/.env`
 * bulutdagi bazaga qaraydi — himoyasiz skript o'shanga yozib yuborardi, seed
 * esa bazani avval to'liq tozalaydi.
 *
 * Nishon faqat host:port/baza bilan emas, so'rov parametrlari bilan ham
 * o'zgaradi: `pg` `?host=` va `?port=` ni manzildagi qiymatlardan afzal
 * ko'radi. Shuning uchun `?schema=` dan boshqa har qanday parametr rad etiladi.
 */
export function docsBazasiniTekshir(url: string | undefined): void {
  let manzil: URL;
  try {
    manzil = new URL(url ?? '');
  } catch {
    throw new Error(
      "DATABASE_URL o'qilmadi — qollanma skriptlari faqat lokal daf_docs bilan ishlaydi.",
    );
  }
  const lokal =
    manzil.hostname === 'localhost' || manzil.hostname === '127.0.0.1';
  if (!lokal || manzil.port !== '5433' || manzil.pathname !== '/daf_docs') {
    throw new Error(
      `Qollanma skripti faqat localhost:5433/daf_docs da ishlaydi, hozirgisi: ${manzil.hostname}:${manzil.port}${manzil.pathname}`,
    );
  }
  const begona = [...new Set(manzil.searchParams.keys())].filter(
    (kalit) => kalit !== 'schema',
  );
  if (begona.length > 0) {
    throw new Error(
      `Qollanma skripti DATABASE_URL da ?schema= dan boshqa parametrni qabul qilmaydi (?host= va ?port= ulanishni boshqa serverga yo'naltiradi), hozirgisi: ${begona.join(', ')}`,
    );
  }
}
