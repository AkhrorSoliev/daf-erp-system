/**
 * «Nima yangi» oxirgi ko'rilgan sanasi — shu brauzerning qulayligi, xolos.
 * Kalit foydalanuvchiga bog'langan: chiqishda `clearSession` uni o'chirmaydi,
 * kalitsiz qiymat shu kompyuterdagi keyingi xodimga o'tib qolardi.
 * Xotira o'qilmasa (maxfiy oyna, taqiq) belgi chiqmaydi, sahifa ishlayveradi.
 */
const KALIT = "daf.qollanma.yangiliklar.oxirgi";
const HODISA = "qollanma-yangiliklar";

/** Shu sahifa yozgan qiymatlar: xotiraga yozib bo'lmasa ham belgi yo'qoladi (keyingi yuklashda unutiladi). */
const sessiya = new Map<number, string>();

const kalit = (userId: number) => `${KALIT}.${userId}`;

/** undefined — xotira ishlamaydi; null — hali ko'rilmagan. */
export function oxirgiKorilganniOqi(userId: number): string | null | undefined {
  const yozilgan = sessiya.get(userId);
  if (yozilgan !== undefined) return yozilgan;
  try {
    return window.localStorage.getItem(kalit(userId));
  } catch {
    return undefined;
  }
}

/** Orqaga qaytmaydi: eski bundle'li varaq yangiroq ko'rilgan sanani bosib, belgini qaytarib yubormasin. */
export function oxirgiKorilganniYoz(userId: number, sana: string): void {
  const hozir = oxirgiKorilganniOqi(userId);
  if (typeof hozir === "string" && hozir >= sana) return;
  sessiya.set(userId, sana);
  try {
    window.localStorage.setItem(kalit(userId), sana);
  } catch {
    // Yozib bo'lmadi: sessiya qiymati bilan davom etamiz.
  }
  window.dispatchEvent(new Event(HODISA));
}

/** `storage` boshqa varaqdagi o'zgarishni, HODISA shu varaqdagisini bildiradi. */
export function yangiliklarObunasi(chaqir: () => void): () => void {
  window.addEventListener("storage", chaqir);
  window.addEventListener(HODISA, chaqir);
  return () => {
    window.removeEventListener("storage", chaqir);
    window.removeEventListener(HODISA, chaqir);
  };
}
