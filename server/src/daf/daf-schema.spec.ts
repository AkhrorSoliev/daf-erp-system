import { readFileSync } from 'fs';
import { join } from 'path';
import { Prisma } from '@prisma/client';

/**
 * Sxema qarorlarini qo'riqlaydigan testlar.
 *
 * Bular uslub tekshiruvi emas: har biri aniq bir yo'qotishni ushlaydi, va
 * uchalasi ham qaytarish qiyin bo'lgan qarorlar (spec D3, D4). Sxemaga
 * `companyId` qo'shish yoki progress jadvalini yaratish keyinchalik
 * «tabiiy» ko'rinadi — shuning uchun sabab test bilan birga yozilgan.
 */
describe('Daf sxemasi', () => {
  const model = (name: string) => {
    const m = Prisma.dmmf.datamodel.models.find((x) => x.name === name);
    if (!m) throw new Error(`${name} modeli sxemada yo'q`);
    return m;
  };
  const fieldsOf = (name: string) => model(name).fields.map((f) => f.name);

  // Kontent COERLL ning CC BY 4.0 materiali — u markazga tegishli emas va
  // filialdan filialga farq qilmaydi. `companyId` qo'shilishi har
  // kompaniyaga 1 180 mashqni nusxalashni anglatardi, va bitta tuzatish
  // nusxalar soniga ko'payardi.
  it.each(['DafUnit', 'DafLexeme', 'DafGrammar', 'DafExercise'])(
    "%s da companyId yo'q",
    (name) => {
      expect(fieldsOf(name)).not.toContain('companyId');
    },
  );

  // Urinish filialni MUHRLAYDI. Bu maydonlarsiz reyting o'quvchi
  // ko'chganda o'tgan oyning natijalarini yangi filialga olib o'tardi.
  it('DafAttempt kompaniya, filial va guruhni muhrlaydi', () => {
    expect(fieldsOf('DafAttempt')).toEqual(
      expect.arrayContaining(['companyId', 'branchId', 'groupId']),
    );
  });

  // Xato javoblar ham yoziladi — o'qituvchiga eng kerakli signal shu.
  it('DafAttempt berilgan javobni va davomiylikni saqlaydi', () => {
    expect(fieldsOf('DafAttempt')).toEqual(
      expect.arrayContaining(['given', 'isCorrect', 'durationMs']),
    );
  });

  // Ball formulasi keyin quriladi va o'zgarganda butun tarix qayta
  // hisoblanadi. Holat sifatida saqlangan ball buni imkonsiz qiladi.
  it('progress yoki ball jadvali yaratilmagan', () => {
    const names = Prisma.dmmf.datamodel.models.map((m) => m.name);
    expect(names).not.toContain('DafProgress');
    expect(names).not.toContain('DafScore');
  });

  // Manbadan yo'qolgan mashq o'chirilmaydi — unga ishora qiluvchi urinish
  // tarixi ma'nosini yo'qotadi.
  it('DafExercise nafaqaga chiqarishni belgilaydi', () => {
    expect(fieldsOf('DafExercise')).toContain('retiredAt');
  });

  // Seed shu maydon bo'yicha yangilaydi. Yagona bo'lmasa, qayta yuritish
  // qatorlarni takrorlaydi va mashq ikki marta ko'rinadi.
  //
  // Bu tekshiruv sxema FAYLIDAN o'qiydi, DMMF'dan emas: bu Prisma
  // versiyasida runtime DMMF qisqartirilgan va maydonda `isUnique` umuman
  // yo'q (faqat `name`, `kind`, `type` qoladi). DMMF orqali tekshirish
  // `undefined` ni ko'rib jimgina o'tib ketardi.
  it.each(['DafLexeme', 'DafGrammar', 'DafExercise'])(
    '%s da sourceId yagona',
    (name) => {
      const schema = readFileSync(
        join(__dirname, '..', '..', 'prisma', 'schema.prisma'),
        'utf8',
      );
      const block = schema.slice(schema.indexOf(`model ${name} {`));
      const body = block.slice(0, block.indexOf('\n}'));
      expect(body).toMatch(/sourceId\s+String\s+@unique/);
    },
  );
});

describe('A1 strukturasi', () => {
  // Bu blok ham sxema faylini matn sifatida o'qiydi — yuqoridagi
  // `sourceId yagona` testi kabi, DMMF emas, chunki bu yerda tekshirilgan
  // enum/unique shakllari runtime DMMF'da to'liq ko'rinmaydi.
  const schema = readFileSync(
    join(__dirname, '..', '..', 'prisma', 'schema.prisma'),
    'utf8',
  );

  // Faqat MODEL BLOKINING ICHIDAN qidirish uchun. `model X[\s\S]*?...`
  // kabi dangasa naqsh model chegarasida to'xtamaydi: agar X'da izlangan
  // maydon bo'lmasa, moslik pastroqdagi BOSHQA modelga sirg'alib ketadi
  // va test soxta-yashil qoladi (masalan `lessonId Int?` ham `DafLexeme`,
  // ham `DafExercise`da bor — DafLexeme.lessonId qayta majburiy qilinsa
  // ham, naqsh DafExercise'dagi optsional nusxaga tushib qolardi).
  const modelBlock = (name: string) => {
    const from = schema.indexOf(`model ${name} {`);
    if (from === -1) throw new Error(`model ${name} sxemada topilmadi`);
    const block = schema.slice(from);
    return block.slice(0, block.indexOf('\n}'));
  };

  // Daraja o'quvchining bosqichi bo'lishi kerak, manbaning yorlig'i emas.
  // Goethe imtihonlari ham A1/A2/B1.
  it('DafLevel uchta qiymatga tushgan', () => {
    expect(schema).toMatch(/enum DafLevel \{\s*A1\s+A2\s+B1\s*\}/);
    expect(schema).not.toMatch(/A1_1/);
    expect(schema).not.toMatch(/A2_2/);
  });

  // Eski DiB darslarida TURI emas, DARAJASI muhim edi: har bosqichda ham
  // lug'at, ham grammatika, ham eshitish bo'lardi. `tier` shu eski darslar
  // uchun ixtiyoriy ustun sifatida qoladi (`Int?`).
  //
  // A1 kurs qayta qurilishi (Task 3, sxema spec) buni qaytardi: yangi
  // kursda bir unitda 15–18 seans bor va ular `tier` bilan ajralmaydi —
  // ular `DafLessonKind` (SECTION_A/SECTION_B/BRIDGE/UNIT_TEST) bilan
  // ajraladi. Shuning uchun `@@unique([unitId, tier])` olib tashlandi va
  // `DafLessonKind` enumi qaytadan qo'shildi — ular endi ikkalasi ham
  // BIRGA yashaydi, `tier` esa eski darslarni buzmaydi.
  it('DafLesson eski tier va yangi DafLessonKind bilan bir vaqtda yashaydi', () => {
    expect(modelBlock('DafLesson')).toMatch(/tier\s+Int\?/);
    expect(schema).toMatch(/enum DafLessonKind/);
    expect(schema).not.toMatch(/@@unique\(\[unitId, tier\]\)/);
  });

  it('DafSentence bo`limga bog`langan va kelib chiqishini saqlaydi', () => {
    expect(modelBlock('DafSentence')).toMatch(/origin\s+DafSentenceOrigin/);
    expect(schema).toMatch(
      /enum DafSentenceOrigin \{\s*GENERATED\s+SOURCE\s*\}/,
    );
  });

  // «Qaysi so'z qaytishi kerak» savoliga butun urinishlar tarixidan
  // javob berish qimmat, shuning uchun holat saqlanadi.
  it('DafLexemeState o`quvchi va so`z bo`yicha yagona', () => {
    expect(modelBlock('DafLexemeState')).toMatch(
      /@@unique\(\[studentId, lexemeId\]\)/,
    );
    expect(modelBlock('DafLexemeState')).toMatch(
      /@@index\(\[studentId, dueAt\]\)/,
    );
  });

  it('DafLessonProgress o`quvchi va dars bo`yicha yagona', () => {
    expect(modelBlock('DafLessonProgress')).toMatch(
      /@@unique\(\[studentId, lessonId\]\)/,
    );
  });

  // Rasmli savol turlari faqat aniq so'zlarga beriladi — `weil` ni
  // chizib bo'lmaydi.
  it('DafLexeme picturable bayrog`ini olgan', () => {
    expect(modelBlock('DafLexeme')).toMatch(
      /picturable\s+Boolean\s+@default\(false\)/,
    );
  });

  // Yangi modelda so'z bo'limga tegishli, darsga emas. Sxema majburiy
  // desa, seed so'z yarata olmaydi.
  //
  // `modelBlock` bilan chegaralangan: `lessonId Int?` `DafExercise`da
  // ham bor, shuning uchun butun sxema bo'yicha qidirish (`model
  // DafLexeme[\s\S]*?lessonId Int?`) DafLexeme'ning o'zi majburiy
  // `Int`ga qaytarilsa ham, pastroqdagi DafExercise'ga sirg'alib,
  // testni soxta-yashil qoldirardi.
  it('DafLexeme darsga ixtiyoriy bog`lanadi', () => {
    expect(modelBlock('DafLexeme')).toMatch(/lessonId\s+Int\?/);
  });
});

describe('A1 kurs strukturasi', () => {
  const schema = readFileSync(
    join(__dirname, '..', '..', 'prisma', 'schema.prisma'),
    'utf8',
  );

  it('DafSection modeli bor', () => {
    expect(schema).toMatch(/model DafSection \{/);
  });

  it('bo`lim kaliti yagona', () => {
    const model = schema.split('model DafSection {')[1].split('}')[0];
    expect(model).toMatch(/code\s+String\s+@unique/);
  });

  it('seans turi enum sifatida belgilangan', () => {
    expect(schema).toMatch(
      /enum DafLessonKind \{[^}]*SECTION_A[^}]*SECTION_B[^}]*BRIDGE[^}]*UNIT_TEST/s,
    );
  });

  it('unit nafaqaga chiqarilishi mumkin', () => {
    const model = schema.split('model DafUnit {')[1].split('\n}')[0];
    expect(model).toMatch(/retiredAt\s+DateTime\?/);
    expect(model).toMatch(/code\s+String\?\s+@unique/);
  });

  it('tier majburiy emas — eski darslar uchun qoladi', () => {
    const model = schema.split('model DafLesson {')[1].split('\n}')[0];
    expect(model).toMatch(/tier\s+Int\?/);
    expect(model).toMatch(/kind\s+DafLessonKind\?/);
    expect(model).toMatch(/sectionId\s+Int\?/);
  });
});
