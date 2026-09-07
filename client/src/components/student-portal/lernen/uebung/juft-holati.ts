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

/**
 * Yakuniy (hammasi yashil) `juftlar`dan `pruefen`ning `richtig`i bilan
 * BIR XIL shakldagi "chap=o'ng|chap=o'ng|…" qatorini quradi.
 *
 * NEGA BU KERAK (ko'rik topilmasi tuzatildi): sintetik natija avval
 * `richtig: ""` bilan yuborilardi — bu `javobBerildi` orqali
 * `xatolar`ga tushib, seans oxiridagi xato ko'rigini (`natija-ekrani.tsx`)
 * BO'SH qoldirardi: `ZUORDNEN`da mavjud `if (!xato.richtig) return null`
 * qo'riqchisi (kamdan-kam server-tomon kolliziyasi uchun yozilgan edi)
 * ENDI ODATIY holatda ishga tushib, qatorni butunlay yashirardi;
 * `PAAR`da esa to'g'ri javob ustuni doim bo'sh chiqardi. Aslida bu
 * ma'lumot ALLAQACHON mavjud: savol tugagan payt HAR bir juft
 * serverda alohida tasdiqlangan (`holat === "togri"`), shuning uchun
 * uni matnga aylantirish JAVOBNI MIJOZGA OSHKOR QILISH emas — mijoz
 * allaqachon bilgan (va server tasdiqlagan) narsani qayta hisoblab
 * chiqarish, xolos.
 *
 * FAQAT "togri" juftlarni oladi (himoya qatlami): chaqiruvchi buni
 * `hammasiTogri` rost bo'lgandagina chaqirishi kerak — o'sha paytda
 * BARCHA juftlar allaqachon "togri" — lekin funksiya bu shartga
 * mustaqil ravishda ham amal qiladi, shunda nazariy jihatdan noto'g'ri
 * chaqiruv "kutilmoqda" juftni javobga aralashtirib yubormaydi.
 *
 * `chapUstun`/`ongUstun`NI OLADI, `options`NI EMAS — `juftUstunlar`
 * (`yigish.tsx`) bilan bir xil sabab: bo'lish qoidasi FAQAT bir joyda
 * yashasin, bu yerda qayta yozilmasin.
 */
export function juftlarniRichtigga(
  juftlar: JonliJuft[],
  chapUstun: string[],
  ongUstun: string[],
): string {
  return juftlar
    .filter((j) => j.holat === "togri")
    .map((j) => `${chapUstun[j.chapIdx]}=${ongUstun[j.ongIdx]}`)
    .join("|");
}
