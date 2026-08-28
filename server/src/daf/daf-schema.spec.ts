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
