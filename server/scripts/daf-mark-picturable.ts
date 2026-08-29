/**
 * A1 lug'atining har bir yozuviga sun'iy intellekt rasm chiza olishini
 * (`picturable`) bir marta hal qiladi.
 *
 *   npm run daf:mark-picturable
 *
 * Natija git'ga chiqadi (`content/daf/picturable.json`): bu qaror BIR
 * MARTA qabul qilinadi va odam ko'rib chiqadi (20 ta tasodifiy `true`
 * so'z qo'lda tekshiriladi — README/brief'ga qarang). Fayl mavjud bo'lsa
 * u MANBA bo'ladi: model qayta so'ralmaydi, faqat bazaga yoziladi — aks
 * holda har yuritishda pul sarflanardi va (model bir xil javob
 * bermagani uchun) natija boshqacha chiqib, odam tasdiqlagan qaror
 * jimgina almashtirilardi.
 */
import 'dotenv/config';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  applyNeverPicturableRule,
  buildPicturablePrompt,
  isNeverPicturable,
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

type Lexeme = { sourceId: string; de: string; en: string };

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
 * Fayl bo'lmaganda: mamlakat/qit'a/son/ibora bo'lganlarni ajratib
 * (`isNeverPicturable` — pulni behuda sarflamaslik uchun), qolganini
 * modeldan so'raydi.
 */
async function generate(lexemes: Lexeme[]): Promise<PicturableMap> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY sozlanmagan.');
  }
  const model = new OpenAiTranslateModel(apiKey);

  const result: PicturableMap = {};
  const toAsk: Lexeme[] = [];
  for (const lex of lexemes) {
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
    `${lexemes.length - toAsk.length} ta mamlakat/qit'a/son/ibora chetlatildi, ${toAsk.length} ta modeldan so'raladi`,
  );

  let done = 0;
  for (let i = 0; i < toAsk.length; i += BATCH) {
    const chunk = toAsk.slice(i, i + BATCH);
    const answers = await markChunk(
      chunk.map((l) => ({ de: l.de, en: l.en })),
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

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  const lexemes = await prisma.dafLexeme.findMany({
    where: { unit: { level: 'A1' } },
    select: { sourceId: true, de: true, en: true },
    orderBy: { id: 'asc' },
  });
  console.log(`A1 lug'at: ${lexemes.length} ta yozuv`);

  let result: PicturableMap;
  if (existsSync(EXPORT)) {
    console.log("Mavjud picturable.json topildi — model qayta so'ralmaydi.");
    result = JSON.parse(readFileSync(EXPORT, 'utf8')) as PicturableMap;
  } else {
    result = await generate(lexemes);
  }

  // SO'ZSIZ filtr — manbasidan qat'i nazar (yangi model javobimi, eskidan
  // o'qilganmi). Mamlakat/qit'a/son/ibora hech qachon `true` bo'lib
  // qolmasligi kerak: agar bu qoida faqat so'rov matni ichida bo'lsa, u
  // eski (qoidasiz paytda yozilgan) faylga hech qachon ta'sir qilmasdi.
  const items: PicturableItem[] = lexemes.map((l) => ({
    sourceId: l.sourceId,
    de: l.de,
  }));
  result = applyNeverPicturableRule(items, result);

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

void main();
