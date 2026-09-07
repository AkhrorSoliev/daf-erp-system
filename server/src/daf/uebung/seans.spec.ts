import { baueSeans, FORMAT_MAX_PRO_SEANS, MIN_FORMATE } from './seans';
import type { Frage, FrageFormat } from './frage.types';

function f(
  format: FrageFormat,
  itemId: number,
  belegteItems?: string[],
): Frage {
  return {
    format,
    itemType: 'WORT',
    itemId,
    prompt: `p${itemId}`,
    hilfe: null,
    options: [],
    richtig: 'x',
    akzeptiert: [],
    belegteItems: belegteItems ?? [`WORT:${itemId}`],
  };
}

/** Har formatdan yetarlicha nomzod. */
function kandidaten(): Frage[] {
  const formate: FrageFormat[] = [
    'WORT_UZ',
    'UZ_WORT',
    'PAAR',
    'ARTIKEL',
    'LUECKE',
    'SATZ_BAUEN',
    'SATZ_UEBERSETZEN',
    'REAKTION',
  ];
  return formate.flatMap((fmt, i) =>
    Array.from({ length: 5 }, (_, j) => f(fmt, i * 10 + j)),
  );
}

const rnd = (): number => 0.5;

describe('baueSeans', () => {
  it('so`ralgan sondagi savolni beradi', () => {
    expect(baueSeans(kandidaten(), 12, rnd).fragen).toHaveLength(12);
  });

  it('bitta formatni uch martadan ko`p ishlatmaydi', () => {
    const { fragen } = baueSeans(kandidaten(), 12, rnd);
    const sanoq = new Map<string, number>();
    for (const q of fragen) sanoq.set(q.format, (sanoq.get(q.format) ?? 0) + 1);
    for (const n of sanoq.values())
      expect(n).toBeLessThanOrEqual(FORMAT_MAX_PRO_SEANS);
  });

  // Diqqat: nomzodlar bir xil sonli (5 tadan sakkiz formatda) bo'lganda,
  // rnd=0.5 bilan Fisher-Yates aralashtirish TASODIFAN hech qachon bir
  // xil formatni ketma-ket qo'ymaydi — shu sabab bu qoida asl nomzod
  // to'plamida sinalmasdan ham "o'tib ketardi". Ketma-ketlikni haqiqatda
  // MAJBURLAB buzadigan holat kerak: kamroq format (5 ta), teng sonli
  // (3 tadan) nomzod — shunda algoritm ketma-ketlik tekshiruvisiz
  // haqiqatda ikkita bir xil formatni yonma-yon qo'yib qo'yadi (sinovda
  // tekshirilgan: `WORT_UZ, WORT_UZ` 7-8 o'rinlarda chiqadi).
  it('ketma-ket ikki savolni bir formatda qo`ymaydi', () => {
    const formate: FrageFormat[] = [
      'WORT_UZ',
      'UZ_WORT',
      'PAAR',
      'ARTIKEL',
      'LUECKE',
    ];
    const nomzodlar = formate.flatMap((fmt, i) =>
      Array.from({ length: 3 }, (_, j) => f(fmt, i * 100 + j)),
    );
    const { fragen } = baueSeans(nomzodlar, 12, rnd);
    expect(fragen).toHaveLength(12);
    for (let i = 1; i < fragen.length; i += 1) {
      expect(fragen[i].format).not.toBe(fragen[i - 1].format);
    }
  });

  // Diqqat: sakkiz xil formatli boy nomzod to'plamida MIN_FORMATE=5
  // qoidasi hech qanday alohida kuch ishlatmasdan ham bajarilib
  // qolaveradi — bu qoidani sinamaydi. Haqiqatda sinash uchun panelda
  // ANIQ to'rtta format ko'p (4x3=12=so`ralgan son bilan bir xil) va
  // beshinchisi KAM (bitta) bo'lishi kerak: shunda "ishlatilmagan
  // formatga ustunlik" qoidasi yo'q bo'lsa, ochko'z tanlov to'rtta
  // formatni to'ldirib, beshinchisiga umuman yetmaydi (sinovda
  // tekshirilgan: mexanizmsiz — 4 format, mexanizm bilan — 5 format).
  it('kamida besh xil format ishlatadi', () => {
    const nomzodlar: Frage[] = [
      ...Array.from({ length: 4 }, (_, i) => f('WORT_UZ', i)),
      ...Array.from({ length: 4 }, (_, i) => f('UZ_WORT', 100 + i)),
      ...Array.from({ length: 4 }, (_, i) => f('PAAR', 200 + i)),
      ...Array.from({ length: 4 }, (_, i) => f('ARTIKEL', 300 + i)),
      f('LUECKE', 400),
    ];
    const { verwendeteFormate } = baueSeans(nomzodlar, 12, rnd);
    expect(verwendeteFormate.length).toBeGreaterThanOrEqual(MIN_FORMATE);
  });

  // Diqqat: `splice` bilan olib tashlash o'zi ham bitta array ichida
  // bitta savolni ikki marta tanlashning oldini oladi — shu sabab bu
  // qoida bir martalik nomzodlar bilan sinalsa hech narsani isbotlamaydi
  // (benutzteItems Set'siz ham o'tib ketaveradi). Haqiqiy sinov: BITTA
  // material (itemType+itemId) ikkita TURLI formatli nomzod sifatida
  // panelda ikki marta bo'lsin (masalan, bitta so'zdan ham WORT_UZ, ham
  // UZ_WORT savoli yasalgan) — shunda faqat benutzteItems tekshiruvi
  // ikkinchisining tanlanishini to'sadi.
  it('bir materialni bir seansda ikki marta so`ramaydi', () => {
    const nomzodlar: Frage[] = [
      f('WORT_UZ', 5),
      f('UZ_WORT', 5), // bitta material, ikki format
      ...Array.from({ length: 3 }, (_, i) => f('PAAR', 20 + i)),
      ...Array.from({ length: 3 }, (_, i) => f('ARTIKEL', 30 + i)),
      ...Array.from({ length: 3 }, (_, i) => f('LUECKE', 40 + i)),
    ];
    const { fragen } = baueSeans(nomzodlar, 8, rnd);
    const kalitlar = fragen.map((q) => `${q.itemType}:${q.itemId}`);
    expect(new Set(kalitlar).size).toBe(kalitlar.length);
    expect(fragen.filter((q) => q.itemId === 5)).toHaveLength(1);
  });

  // `PAAR` to'rtta so'zni bittada ko'rsatadi va ularning tarjimasini
  // oshkor qiladi — shuning uchun to'rttasi ham `belegteItems`da "band"
  // deb belgilanadi. Bu test faqat `itemId`ga (bitta materialga) emas,
  // BUTUN `belegteItems` ro'yxatiga qarab tekshirishni sinaydi: `PAAR`
  // ichidagi 2-so'z (itemId=2) alohida `WORT_UZ` nomzodi sifatida ham
  // panelda bo'lsa, ikkinchi marta (endi alohida savol sifatida)
  // so'ralmasligi kerak.
  it('PAAR ichida ko`rsatilgan so`z shu seansda alohida savol sifatida qayta so`ralmaydi', () => {
    const juftlik = f('PAAR', 1, ['WORT:1', 'WORT:2', 'WORT:3', 'WORT:4']);
    const alohidaSavol2 = f('UZ_WORT', 2); // belegteItems: ['WORT:2'] — PAAR bilan bir xil material
    const toldiruvchilar: Frage[] = [
      juftlik,
      alohidaSavol2,
      ...Array.from({ length: 3 }, (_, i) => f('ARTIKEL', 30 + i)),
      ...Array.from({ length: 3 }, (_, i) => f('LUECKE', 40 + i)),
    ];
    const { fragen } = baueSeans(toldiruvchilar, 8, rnd);

    const paarTanlandi = fragen.some((q) => q.format === 'PAAR');
    const alohidaTanlandi = fragen.some(
      (q) => q.format === 'UZ_WORT' && q.itemId === 2,
    );
    // Ikkalasi ham material '2'ni "band" qiladi — ikkalasi BIRDANIGA
    // seansga kira olmaydi.
    expect(paarTanlandi && alohidaTanlandi).toBe(false);
  });

  it('nomzod yetmasa borini beradi, takrorlamaydi', () => {
    const kam = [f('WORT_UZ', 1), f('UZ_WORT', 2), f('PAAR', 3)];
    const { fragen } = baueSeans(kam, 12, rnd);
    expect(fragen).toHaveLength(3);
    expect(new Set(fragen.map((q) => q.itemId)).size).toBe(3);
  });

  // Diqqat: asl variant (bitta formatdan 10 ta nomzod) "cap"ni emas,
  // ketma-ketlik qoidasini sinardi — ikkinchi nomzod tanlanmay qolishi
  // sababi u oxirgisi bilan bir xil format edi, cap hali to'lmagan edi
  // (nomzod #2 tanlanganda proFormat[WORT_UZ] hali 1 edi). Haqiqiy cap
  // sinovi uchun format ketma-ket kelmasin: to'rtta format, teng sonli
  // (4 tadan) nomzod — shunda WORT_UZ boshqa formatlar bilan navbatlashib
  // panelga qaytib keladi, va faqat cap uni uchtadan keyin to'xtatadi
  // (sinovda tekshirilgan: cap'siz WORT_UZ 4 marta chiqadi, ketma-ketlik
  // buzilmasdan).
  it('cap to`lgan formatni uchtadan ko`p qo`shmaydi (ketma-ketlik emas)', () => {
    const nomzodlar: Frage[] = [
      ...Array.from({ length: 4 }, (_, i) => f('WORT_UZ', i)),
      ...Array.from({ length: 4 }, (_, i) => f('UZ_WORT', 100 + i)),
      ...Array.from({ length: 4 }, (_, i) => f('PAAR', 200 + i)),
      ...Array.from({ length: 4 }, (_, i) => f('ARTIKEL', 300 + i)),
    ];
    const { fragen } = baueSeans(nomzodlar, 12, rnd);
    expect(fragen).toHaveLength(12);
    expect(fragen.filter((q) => q.format === 'WORT_UZ')).toHaveLength(
      FORMAT_MAX_PRO_SEANS,
    );
  });

  // Nomzodlar panelida besh xil format umuman yo'q bo'lsa (bor-yo'g'i
  // to'rtta), MIN_FORMATE qoidasi xatoga olib kelmaydi va seansni
  // qisqartirmaydi — mavjud materialdan to'liq foydalaniladi.
  it('materialda besh format yo`q bo`lsa, xato bermaydi va qisqartirmaydi', () => {
    const nomzodlar: Frage[] = [
      ...Array.from({ length: 10 }, (_, i) => f('WORT_UZ', i)),
      ...Array.from({ length: 10 }, (_, i) => f('UZ_WORT', 100 + i)),
      ...Array.from({ length: 10 }, (_, i) => f('PAAR', 200 + i)),
      ...Array.from({ length: 10 }, (_, i) => f('ARTIKEL', 300 + i)),
    ];
    const { fragen, verwendeteFormate } = baueSeans(nomzodlar, 10, rnd);
    expect(fragen).toHaveLength(10);
    expect(verwendeteFormate.length).toBe(4);
  });

  it('qaytarish savollarini seansga albatta qo`shadi', () => {
    // Muddati kelgan so'zlar oddiy nomzodlardan OLDIN joylashadi:
    // ular seansning sababi, qolgani to'ldiruvchi.
    const wiederholung = [f('UZ_WORT', 900), f('WORT_UZ', 901)];
    const { fragen } = baueSeans(kandidaten(), 12, rnd, wiederholung);
    const ids = fragen.map((q) => q.itemId);
    expect(ids).toContain(900);
    expect(ids).toContain(901);
  });

  it('qaytarish savollari ham qoidalarga bo`ysunadi', () => {
    const wiederholung = [f('WORT_UZ', 900), f('WORT_UZ', 901)];
    const { fragen } = baueSeans(kandidaten(), 12, rnd, wiederholung);
    for (let i = 1; i < fragen.length; i += 1) {
      expect(fragen[i].format).not.toBe(fragen[i - 1].format);
    }
  });

  // Cap haqiqatda to'lgan bo'lsa (bo'shliq yaratishga urinish yordam
  // bermaydi), ortiqcha majburiy savol jimgina yo'qolmaydi —
  // nichtPlatziert'da ko'rinadi.
  it('cap to`lgani sabab joylasholmagan majburiy savol nichtPlatziert`da ko`rinadi', () => {
    const wiederholung = [
      f('WORT_UZ', 900),
      f('WORT_UZ', 901),
      f('WORT_UZ', 902),
      f('WORT_UZ', 903),
    ];
    const toldiruvchilar: Frage[] = [
      ...Array.from({ length: 5 }, (_, i) => f('UZ_WORT', 10 + i)),
      ...Array.from({ length: 5 }, (_, i) => f('PAAR', 20 + i)),
      ...Array.from({ length: 5 }, (_, i) => f('ARTIKEL', 30 + i)),
      ...Array.from({ length: 5 }, (_, i) => f('LUECKE', 40 + i)),
    ];
    const { fragen, nichtPlatziert } = baueSeans(
      toldiruvchilar,
      12,
      rnd,
      wiederholung,
    );
    const joylashganIds = fragen
      .filter((q) => q.itemId >= 900)
      .map((q) => q.itemId);
    expect(joylashganIds).toHaveLength(FORMAT_MAX_PRO_SEANS);
    expect(nichtPlatziert.map((q) => q.itemId)).toEqual([903]);
  });

  // Bo'shliq yaratish uchun material umuman bo'lmasa (bo'sh panel),
  // ketma-ketlik qoidasi ikkinchi majburiy savolni rad etadi va bu
  // holat ham hisobotga tushadi — jimgina yo'qolmaydi.
  it('bo`shliq yaratib bo`lmagani sabab joylasholmagan majburiy savol nichtPlatziert`da ko`rinadi', () => {
    const wiederholung = [f('WORT_UZ', 900), f('WORT_UZ', 901)];
    const { fragen, nichtPlatziert } = baueSeans([], 12, rnd, wiederholung);
    expect(fragen.map((q) => q.itemId)).toEqual([900]);
    expect(nichtPlatziert.map((q) => q.itemId)).toEqual([901]);
  });

  // benutzteItems majburiy va oddiy nomzodlar orasida ham ishlashi
  // kerak: bitta material majburiy ro'yxatda BOSHQA formatli nomzod
  // sifatida panelda ham bo'lsa, ikkinchi marta so'ralmaydi.
  it('majburiy savol nomzodlar panelida ham bo`lsa, ikki marta so`ramaydi', () => {
    const dublikat = f('UZ_WORT', 5); // xuddi shu material, panelda boshqa format
    const nomzodlar: Frage[] = [
      dublikat,
      ...Array.from({ length: 5 }, (_, i) => f('PAAR', 20 + i)),
    ];
    const { fragen } = baueSeans(nomzodlar, 5, rnd, [f('WORT_UZ', 5)]);
    expect(fragen.filter((q) => q.itemId === 5)).toHaveLength(1);
    expect(fragen[0]).toMatchObject({ format: 'WORT_UZ', itemId: 5 });
  });
});

describe('baueSeans — moyillik', () => {
  // Diqqat: brifdagi asl fikstura (bor-yo'g'i 2 xil format: SATZ_BAUEN
  // va WORT_UZ, 6 tadan) bu testni HECH NARSANI isbotlamaydigan holga
  // keltirardi — nomzodlarda atigi 2 format bo'lgani uchun
  // `MIN_FORMATE`(5) qoidasi ikkalasini ham navbat bilan (round-robin)
  // MAJBUR ravishda ishlatadi, moyillik bor-yo'qligidan qat'i nazar
  // natija har doim 3-3 chiqadi (tekshirilgan: moyillikni butunlay
  // o'chirib qo'yganda ham xuddi shu natija). Haqiqiy sinov uchun
  // `MIN_FORMATE`dan KO'P (oltita) format kerak: shunda dastlabki "har
  // formatdan bittadan" bosqichi 5 tada to'xtaydi, va navbatdagi
  // to'ldirish ENDI TARTIBGA qarab tanlaydi — aynan shu yerda moyillik
  // ko'rinadi. `WORT_UZ` massivda ATAYLAB ENG OXIRIDA turadi: moyillik
  // bo'lmasa (pool tartibi o'zgarmasa), boshqa beshta format cap`ga
  // (3 tadan, jami 15) yetguncha uni hech qachon egallamaydi — 12 ta
  // so'ralganda WORT_UZ 0 marta chiqadi (tekshirilgan). Moyillik uni
  // oldinga surganda esa cap`iga (3) yetadi.
  it('afzal formatlar oldinga suriladi', () => {
    const k: Frage[] = [
      ...Array.from({ length: 4 }, (_, i) => f('UZ_WORT', i)),
      ...Array.from({ length: 4 }, (_, i) => f('PAAR', 100 + i)),
      ...Array.from({ length: 4 }, (_, i) => f('ARTIKEL', 200 + i)),
      ...Array.from({ length: 4 }, (_, i) => f('LUECKE', 300 + i)),
      ...Array.from({ length: 4 }, (_, i) => f('SATZ_BAUEN', 400 + i)),
      ...Array.from({ length: 4 }, (_, i) => f('WORT_UZ', 500 + i)),
    ];
    const plan = baueSeans(k, 12, () => 0.9999, [], ['WORT_UZ']);
    const wortUz = plan.fragen.filter((q) => q.format === 'WORT_UZ').length;
    const boshqa = plan.fragen.length - wortUz;
    // Moyillik bo'lmasa (bazaviy holat, tekshirilgan) WORT_UZ 0 marta
    // chiqadi — massivning oxirida turgani uchun cap'ga yetgan boshqa
    // beshta format uni hech qachon egallamaydi.
    expect(wortUz).toBeGreaterThan(0);
    // Cap baribir ushlab turadi — moyillik uni bekor qilmaydi.
    expect(wortUz).toBeLessThanOrEqual(FORMAT_MAX_PRO_SEANS);
    expect(boshqa).toBeGreaterThan(0);
  });

  // Diqqat: nomzodlarda 6 xil format bor (MIN_FORMATE=5'dan ko'p);
  // moyillik faqat BITTASINI (`WORT_UZ`, 3 ta nomzod) afzal ko'rsatadi.
  // Agar moyillik XATO ravishda QAT'IY BO'LINISHGA aylantirilgan bo'lsa
  // (poolni faqat bevorzugt formatlarga filtrlab tashlasa), pooldan
  // atigi 3 ta WORT_UZ nomzodi qolardi va 12 ta so'ralganda ham
  // natijada FAQAT 1 xil format bo'lardi — MIN_FORMATE(5) BUZILARDI.
  // Barqaror SARALASH (to'g'ri yechim) esa butun poolni saqlab qoladi,
  // shuning uchun MIN_FORMATE baribir bajariladi.
  it('moyillik MIN_FORMATE ni buzmaydi (qat`iy bo`linishga aylanmaydi)', () => {
    const formatlar: FrageFormat[] = [
      'WORT_UZ',
      'UZ_WORT',
      'ARTIKEL',
      'LUECKE',
      'SATZ_BAUEN',
      'SATZ_UEBERSETZEN',
    ];
    const k = formatlar.flatMap((fmt, i) =>
      Array.from({ length: 3 }, (_, j) => f(fmt, i * 10 + j)),
    );
    const plan = baueSeans(k, 12, () => 0.9999, [], ['WORT_UZ']);
    const xil = new Set(plan.fragen.map((q) => q.format)).size;
    expect(xil).toBeGreaterThanOrEqual(MIN_FORMATE);
  });

  it('moyillik berilmasa xatti-harakat o`zgarmaydi', () => {
    const k = Array.from({ length: 10 }, (_, i) => f('WORT_UZ', i));
    const a = baueSeans(k, 5, () => 0.5);
    const b = baueSeans(k, 5, () => 0.5, [], []);
    expect(a.fragen.map((q) => q.itemId)).toEqual(
      b.fragen.map((q) => q.itemId),
    );
  });
});
