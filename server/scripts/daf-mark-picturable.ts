/**
 * A1 lug'atining har bir yozuviga sun'iy intellekt rasm chiza olishini
 * (`picturable`) bir marta hal qiladi.
 *
 *   npm run daf:mark-picturable
 *
 * Natija git'ga chiqadi (`content/daf/picturable.json`): bu qaror BIR
 * MARTA qabul qilinadi va odam ko'rib chiqadi (20 ta tasodifiy `true`
 * so'z qo'lda tekshiriladi — README/brief'ga qarang).
 *
 * Shartnoma FAYL darajasida emas, YOZUV darajasida: `content/daf/
 * picturable.json`da allaqachon ENTRY'si bor sourceId hech qachon qayta
 * so'ralmaydi (odam tasdiqlagan qaror jimgina almashtirilmasin — aks
 * holda model bir xil javob bermagani uchun natija har safar boshqacha
 * chiqardi). Faylda hali entry'si YO'Q sourceId'lar esa so'raladi —
 * eski kod buni "fayl bormi?" bilan tekshirar edi, shuning uchun eski
 * (dib-voc-*) kontent bilan fayl allaqachon to'la bo'lgani sabab, yangi
 * kontent (masalan A1 ning u01-* yozuvlari) UMUMAN so'ralmay, sukut
 * bo'yicha "false" bo'lib qolardi. Qarang: `findMissingPicturable` /
 * `mergePicturable` (`picturable.ts`).
 */
import 'dotenv/config';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  applyNeverPicturableRule,
  buildPicturablePrompt,
  findMissingPicturable,
  isNeverPicturable,
  mergePicturable,
  parsePicturable,
  PicturableCountMismatchError,
  type PicturableCandidate,
  type PicturableItem,
  type PicturableMap,
} from '../src/daf/media/picturable';
import {
  OpenAiTranslateModel,
  type TranslateModel,
} from '../src/daf/translate/translate-model';

const BATCH = 40;

/**
 * Natija ham kontentning bir qismi, shuning uchun u git'ga chiqadi (xuddi
 * tarjima va gaplar kabi — `daf-translate.ts`, `daf-gen-sentences.ts`).
 * Baza — bu MUHIT, git emas: fayl bo'lmasa prod'da bu qaror UMUMAN
 * qilinmagan bo'lardi.
 */
const EXPORT = join(__dirname, '..', 'content', 'daf', 'picturable.json');

/**
 * `en` emas `uz` — A1 kontentida inglizcha maydon yo'q (seed uni bo'sh
 * satr qilib yozadi). Qarang: `picturable.ts`dagi `PicturableCandidate`
 * izohi — xuddi shu sabab bilan.
 */
export type Lexeme = { sourceId: string; de: string; uz: string };

/**
 * Guruhni so'raydi; javob soni mos kelmasa guruhni ikkiga bo'lib qayta
 * so'raydi — `daf-translate.ts` dagi bilan bir xil naqsh, bir xil sabab
 * bilan: bitta muammoli so'z uchun butun ishni to'xtatish noto'g'ri.
 *
 * Yolg'iz qolgan so'z ham mos kelmasa, u `false` deb belgilanadi:
 * noto'g'ri "chizilsin" deyish puldan ayirardi (8-task rasm generatsiyasi
 * pullik), noto'g'ri "chizilmasin" deyish — yo'q. Shuning uchun noaniqlik
 * xavfsiz tomonga hal qilinadi, ogohlantirish bilan — Step 7 dagi qo'lda
 * tekshiruv buni ko'radi.
 */
async function markChunk(
  items: PicturableCandidate[],
  model: TranslateModel,
): Promise<boolean[]> {
  try {
    const raw = await model.complete(buildPicturablePrompt(items));
    return parsePicturable(raw, items.length);
  } catch (err) {
    if (!(err instanceof PicturableCountMismatchError)) throw err;

    if (items.length === 1) {
      console.warn(
        `  ⚠ noaniq javob, xavfsiz "false" qo'yildi: ${items[0].de}`,
      );
      return [false];
    }

    const half = Math.ceil(items.length / 2);
    return [
      ...(await markChunk(items.slice(0, half), model)),
      ...(await markChunk(items.slice(half), model)),
    ];
  }
}

/**
 * `missing` — faylda hali qarori yo'q yozuvlar (`findMissingPicturable`
 * bilan ajratilgan). Mamlakat/qit'a/son/ibora bo'lganlarni ajratib
 * (`isNeverPicturable` — pulni behuda sarflamaslik uchun), qolganini
 * modeldan so'raydi. Bu funksiya faylning QOLGAN qismiga tegmaydi —
 * chaqiruvchi natijani `mergePicturable` bilan qo'shadi.
 */
export async function generate(
  missing: Lexeme[],
  model: TranslateModel,
): Promise<PicturableMap> {
  const result: PicturableMap = {};
  const toAsk: Lexeme[] = [];
  for (const lex of missing) {
    if (isNeverPicturable(lex.de)) {
      // Mamlakat/qit'a: generatorga tushib qolmasin — Flux bayroq/xaritani
      // xato chizadi. Son: rasm uslubimiz yozuvni taqiqlaydi, sonni
      // rasmda ko'rsatib bo'lmaydi. Ibora: bitta konkret narsa emas.
      // Mamlakat/qit'a uchun bu "rasm kerak emas" degani EMAS: 8-task
      // oxirida tayyor bayroq fayli berilganda `true` ga qaytariladi.
      // `daf-gen-images` faqat `picturable=true` larni oladi, shuning
      // uchun hozircha shu yo'l bilan chetlatiladi.
      result[lex.sourceId] = false;
    } else {
      toAsk.push(lex);
    }
  }
  console.log(
    `${missing.length - toAsk.length} ta mamlakat/qit'a/son/ibora chetlatildi, ${toAsk.length} ta modeldan so'raladi`,
  );

  let done = 0;
  for (let i = 0; i < toAsk.length; i += BATCH) {
    const chunk = toAsk.slice(i, i + BATCH);
    const answers = await markChunk(
      chunk.map((l) => ({ sourceId: l.sourceId, de: l.de, uz: l.uz })),
      model,
    );
    for (const [j, picturable] of answers.entries()) {
      result[chunk[j].sourceId] = picturable;
    }
    done += chunk.length;
    console.log(`  ${done}/${toAsk.length}`);
  }

  return result;
}

export interface DecidePicturableResult {
  result: PicturableMap;
  missingCount: number;
  additionsCount: number;
}

/**
 * Butun qaror mantig'i — DB'siz, fayl tizimisiz, sof kirish/chiqish. Shu
 * ajratish testni imkonli qiladi: Prisma yoki haqiqiy model chaqirmasdan
 * "existing saqlanib qoladi", "missing so'raladi", "qattiq qoidalar model
 * javobini yengadi" va "bo'sh missing modelni chaqirmaydi" holatlarini
 * tekshirish mumkin.
 *
 * `buildModel` LAZY — faqat `missing.length > 0` bo'lganda chaqiriladi.
 * Shu sabab bo'sh partiyada `OPENAI_API_KEY` sozlanmagan bo'lsa ham
 * (hech narsa so'ralmayotgani uchun) funksiya yiqilmaydi, VA haqiqiy
 * model hech qachon qurilmaydi — "hatto bo'sh partiya bilan ham
 * chaqirilmasin" talabi shu orqali ta'minlanadi.
 */
export async function decidePicturable(
  lexemes: Lexeme[],
  existing: PicturableMap,
  buildModel: () => TranslateModel,
): Promise<DecidePicturableResult> {
  const items: PicturableItem[] = lexemes.map((l) => ({
    sourceId: l.sourceId,
    de: l.de,
  }));
  const missingIds = new Set(
    findMissingPicturable(items, existing).map((it) => it.sourceId),
  );
  // `findMissingPicturable` ishlaydi `PicturableItem` ({sourceId, de}) bilan
  // — u faylni tekshirish uchun `uz`ga muhtoj emas. `generate()` esa `uz`ni
  // promptga qo'shishi kerak, shuning uchun natijani asl `lexemes`dan
  // (to'liq maydonlar bilan) filtrlaymiz.
  const missing = lexemes.filter((l) => missingIds.has(l.sourceId));

  let additions: PicturableMap = {};
  if (missing.length === 0) {
    // Modelni HATTO bo'sh partiya bilan ham chaqirmaymiz (`buildModel()`
    // chaqirilmaydi) — apiKey sozlanmagan bo'lsa ham bu holat ishlashi
    // kerak (hech narsa so'ralmayapti), va operator "hech narsa
    // qilinmadi" bilan "hammasi allaqachon qilingan"ni ajrata olishi
    // kerak.
    console.log(
      "Yangi so'z yo'q — hammasi allaqachon hal qilingan, model chaqirilmadi.",
    );
  } else {
    console.log(
      `${missing.length} ta yangi so'z topildi (${items.length - missing.length} ta allaqachon hal qilingan), modeldan so'raladi.`,
    );
    additions = await generate(missing, buildModel());
  }

  let result = mergePicturable(existing, additions);

  // SO'ZSIZ filtr — manbasidan qat'i nazar (yangi model javobimi, eskidan
  // o'qilganmi). Mamlakat/qit'a/son/ibora hech qachon `true` bo'lib
  // qolmasligi kerak: agar bu qoida faqat so'rov matni ichida bo'lsa, u
  // eski (qoidasiz paytda yozilgan) faylga hech qachon ta'sir qilmasdi.
  result = applyNeverPicturableRule(items, result);

  const additionsCount = Object.keys(additions).length;
  console.log(
    `\nSo'raldi: ${missing.length} ta, yozildi: ${additionsCount} ta yangi yozuv.`,
  );

  return { result, missingCount: missing.length, additionsCount };
}

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  const rows = await prisma.dafLexeme.findMany({
    where: { unit: { level: 'A1' } },
    select: { sourceId: true, de: true, uz: true },
    orderBy: { id: 'asc' },
  });
  // `uz` sxemada ixtiyoriy (`String?`) — hech qachon so'ralmagan eski
  // yozuvlar uchun `null` bo'lishi mumkin. Bo'sh satr xuddi `en: ''` bilan
  // bir xil xavfsiz standart: prompt "[uz: ]" deb ko'rsatadi, model baribir
  // nemischadan hal qiladi.
  const lexemes: Lexeme[] = rows.map((r) => ({ ...r, uz: r.uz ?? '' }));
  console.log(`A1 lug'at: ${lexemes.length} ta yozuv`);

  // Fayl bo'lmasa {} — birinchi yurishda HAMMASI "missing" bo'ladi, xuddi
  // eski xatti-harakat kabi. Fayl bo'lsa, uning ichidagi yozuvlar SAQLANIB
  // qoladi (`mergePicturable`) — qayta so'ralmaydi.
  const existing: PicturableMap = existsSync(EXPORT)
    ? (JSON.parse(readFileSync(EXPORT, 'utf8')) as PicturableMap)
    : {};

  const { result } = await decidePicturable(lexemes, existing, () => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY sozlanmagan.');
    }
    return new OpenAiTranslateModel(apiKey);
  });

  // Fayl har doim shu (filtrlangan) natija bilan qayta yoziladi — hatto
  // mavjud fayldan o'qilgan bo'lsa ham, chunki filtr uni o'zgartirgan
  // bo'lishi mumkin (masalan eski faylda qoidasiz qolib ketgan yozuv).
  writeFileSync(EXPORT, JSON.stringify(result, null, 2) + '\n', 'utf8');
  console.log('\nYozildi: content/daf/picturable.json');

  let updated = 0;
  for (const lex of lexemes) {
    // Fayl DB dagi barcha yozuvlarni qamramasa (masalan yangi so'z
    // qo'shilgan), sukut bo'yicha "false" — xavfsiz tomon: noto'g'ri
    // "chizilmasin" pul sarflamaydi, noto'g'ri "chizilsin" sarflardi.
    if (!(lex.sourceId in result)) {
      console.warn(
        `  ⚠ picturable.json da yo'q, "false" qilib qoldirildi: ${lex.sourceId} (${lex.de})`,
      );
    }
    const picturable = result[lex.sourceId] ?? false;
    await prisma.dafLexeme.update({
      where: { sourceId: lex.sourceId },
      data: { picturable },
    });
    updated++;
  }

  const trueCount = lexemes.filter((l) => result[l.sourceId]).length;
  console.log(
    `\nBazaga yozildi: ${updated} ta yozuv. Rasm chiziladigan: ${trueCount}/${lexemes.length}`,
  );

  await prisma.$disconnect();
}

// Faqat to'g'ridan-to'g'ri ishga tushirilganda yuguradi (`ts-node
// scripts/daf-mark-picturable.ts`) — testlar bu faylni import qilganda
// `require.main !== module`, shuning uchun import HECH QANDAY DB
// ulanishi yoki pullik model chaqiruvi qilmaydi (`daf-voice-samples.ts`
// dagi bilan bir xil naqsh, bir xil sabab bilan).
if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
