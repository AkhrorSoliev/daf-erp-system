/**
 * Qo'llanma skriptlari faqat lokal `daf_docs` bazasida ishlaydi. `server/.env`
 * bulutdagi bazaga qaraydi — himoyasiz skript o'shanga yozib yuborardi, seed
 * esa bazani avval to'liq tozalaydi.
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
}
