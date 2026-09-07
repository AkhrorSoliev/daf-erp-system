/**
 * Jonli juftlash mashqining sof holat mantig'i.
 *
 * `chapBosildi`/`ongBosildi` (`yigish.tsx`) tugma bosishni indeks bo'yicha
 * kuzatadi — bu fayl o'sha g'oyaning DAVOMI: bitta juft tuzilgach server
 * darhol tekshiradi (`useJuftTekshir`, `queries.ts`), va shu javob shu
 * yerda saqlanadi. INDEKS bo'yicha ishlash sababi bir xil qoladi: ikkita
 * tugma bir xil matnga ega bo'lishi mumkin, shuning uchun matn emas,
 * pozitsiya noyob identifikator hisoblanadi.
 *
 * `xato` HOLATI YO'Q (ataylab): xato juft ekranda qolmaydi, darhol
 * ro'yxatdan olib tashlanadi va ikkala tugma yana bo'sh bo'ladi. Qizil
 * chaqnash — vaqtinchalik ko'rinish effekti, komponentning ishi, bu
 * yerdagi holat mashinasining ishi emas.
 */

export type JuftHolat = "kutilmoqda" | "togri";

export interface JonliJuft {
  chapIdx: number;
  ongIdx: number;
  holat: JuftHolat;
}

/**
 * Boshlang'ich (bo'sh) holat.
 *
 * ALOHIDA FUNKSIYA qilib chiqarilgan — chaqiruvchi `useState<JonliJuft[]>([])`
 * o'rniga shuni chaqirsa, boshlang'ich qiymat BITTA joyda turadi va agar u
 * kelajakda o'zgarsa (masalan boshlang'ich meta-ma'lumot qo'shilsa), hamma
 * chaqiruvchi joy emas, shu funksiya yetarli.
 */
export function boshlaJuftlar(): JonliJuft[] {
  return [];
}

/**
 * Chap va o'ng tugma bosilib juft tuzilganda chaqiriladi.
 *
 * `chapIdx` yoki `ongIdx` allaqachon biror juftda band bo'lsa (u
 * "kutilmoqda" yoki "togri" bo'lishidan qat'i nazar) ro'yxat
 * O'ZGARISHSIZ qaytadi — band tugma UI'da allaqachon bosib bo'lmaydigan
 * qilib ko'rsatiladi, lekin bu funksiya shu qoidani mustaqil ravishda
 * ham ta'minlaydi.
 */
export function juftQoshildi(
  juftlar: JonliJuft[],
  chapIdx: number,
  ongIdx: number,
): JonliJuft[] {
  const bandmi = juftlar.some((j) => j.chapIdx === chapIdx || j.ongIdx === ongIdx);
  if (bandmi) return juftlar;
  return [...juftlar, { chapIdx, ongIdx, holat: "kutilmoqda" }];
}

/**
 * Serverdan `{ isCorrect }` javobi kelganda chaqiriladi.
 *
 * To'g'ri bo'lsa mos juft `togri` bo'ladi (yashil, doimiy qoladi). Xato
 * bo'lsa juft RO'YXATDAN BUTUNLAY OLIB TASHLANADI — `xato` holati yo'q,
 * chunki ikkala tugma darhol yana bo'sh (bosilishi mumkin) bo'lishi
 * kerak.
 *
 * Mos juft topilmasa (masalan javob kelguncha o'sha juft allaqachon
 * boshqa sabab bilan ro'yxatdan chiqib ketgan bo'lsa — tarmoq javoblari
 * tartib bilan kelishi kafolatlanmaydi) ro'yxat o'zgarishsiz qaytadi.
 */
export function juftJavobKeldi(
  juftlar: JonliJuft[],
  chapIdx: number,
  ongIdx: number,
  isCorrect: boolean,
): JonliJuft[] {
  const mavjud = juftlar.find((j) => j.chapIdx === chapIdx && j.ongIdx === ongIdx);
  if (!mavjud) return juftlar;
  if (!isCorrect) return juftlar.filter((j) => j !== mavjud);
  return juftlar.map((j) => (j === mavjud ? { ...j, holat: "togri" } : j));
}

/**
 * Mashq tugadimi: barcha `soni` ta juft tuzilgan VA hammasi `togri`.
 *
 * Ikkala shart ham kerak — faqat `holat === "togri"`ni tekshirish
 * yetarli emas, chunki `juftlar.length < soni` bo'lganda ham (hali
 * hammasi tuzilmagan) bo'sh yoki qisman ro'yxat "hammasi togri" bo'lib
 * noto'g'ri hisoblanib qolardi.
 */
export function hammasiTogri(juftlar: JonliJuft[], soni: number): boolean {
  return juftlar.length === soni && juftlar.every((j) => j.holat === "togri");
}
