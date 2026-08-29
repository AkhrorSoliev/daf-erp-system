import {
  wordFormsOf,
  cumulativeVocab,
  unknownWords,
  FUNCTION_WORDS,
} from './sentence-validate';

describe('wordFormsOf', () => {
  // Lug'at yozuvi ko'pincha ibora yoki bir necha shakl bo'ladi:
  // «Bis dann! / Bis später!», «das Land (die Länder)».
  it('ibora ichidagi barcha so`zlarni ajratadi', () => {
    expect(wordFormsOf('Bis dann! / Bis später!')).toEqual(
      expect.arrayContaining(['bis', 'dann', 'später']),
    );
  });

  it('qavs ichidagi ko`plik shaklini ham oladi', () => {
    expect(wordFormsOf('das Land (die Länder)')).toEqual(
      expect.arrayContaining(['das', 'land', 'die', 'länder']),
    );
  });

  it('bir harfli bo`laklarni tashlaydi', () => {
    expect(wordFormsOf('A, B, C')).toEqual([]);
  });
});

describe('cumulativeVocab', () => {
  const entries = new Map([
    ['s1', ['Hallo!']],
    ['s2', ['gehen']],
    ['s3', ['der Apfel']],
  ]);
  const units = [
    { sections: ['s1'] },
    { sections: ['s2'] },
    { sections: ['s3'] },
  ];

  // Gap faqat o'quvchi ALLAQACHON ko'rgan so'zlardan tuzilishi kerak —
  // kelajakdagi bo'limning so'zi hozir notanish.
  it('shu bo`lim va undan oldingilarni qamraydi', () => {
    const v = cumulativeVocab(units, entries, 1);
    expect(v.has('hallo')).toBe(true);
    expect(v.has('gehen')).toBe(true);
    expect(v.has('apfel')).toBe(false);
  });
});

describe('unknownWords', () => {
  const allowed = new Set(['heiße', 'anna']);

  it('tanish so`zlardan tuzilgan gapga e`tiroz bildirmaydi', () => {
    expect(unknownWords('Ich heiße Anna.', allowed)).toEqual([]);
  });

  // Manbadagi gaplarning 73 % i aynan shu sababdan yaroqsiz edi.
  it('notanish so`zni topadi', () => {
    expect(unknownWords('Ich heiße Anna aus Kalifornien.', allowed)).toEqual([
      'kalifornien',
    ]);
  });

  // Artikl, olmosh, bog'lovchi har bo'limda uchraydi va ularni
  // lug'atga qo'shib chiqish shart emas.
  it('yordamchi so`zlarni kechiradi', () => {
    expect(FUNCTION_WORDS.has('ich')).toBe(true);
    expect(unknownWords('Ich bin und der die das', allowed)).toEqual([]);
  });

  it('katta-kichik harf farqini hisobga olmaydi', () => {
    expect(unknownWords('HEISSE anna', new Set(['heisse', 'anna']))).toEqual(
      [],
    );
  });
});
