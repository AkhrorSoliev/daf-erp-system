/**
 * «Nima yangi» oxirgi ko'rilgan sanasi — shu brauzerning qulayligi, xolos.
 * Xotira o'qilmasa (maxfiy oyna, taqiq) belgi chiqmaydi, sahifa ishlayveradi.
 */
const KALIT = "daf.qollanma.yangiliklar.oxirgi";
const HODISA = "qollanma-yangiliklar";

/** undefined — xotira ishlamaydi; null — hali ko'rilmagan. */
export function oxirgiKorilganniOqi(): string | null | undefined {
  try {
    return window.localStorage.getItem(KALIT);
  } catch {
    return undefined;
  }
}

export function oxirgiKorilganniYoz(sana: string): void {
  try {
    window.localStorage.setItem(KALIT, sana);
  } catch {
    return;
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
