import {
  wordsOf,
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

  // Lug'atda fe'l infinitivda turadi, o'quvchi esa uni tuslaydi.
  // Bu shakllarni notanish deb belgilash tabiiy gap yasashni
  // imkonsiz qilardi.
  it('muntazam fe`lning hozirgi zamon shakllarini hosil qiladi', () => {
    expect(wordFormsOf('wohnen')).toEqual(
      expect.arrayContaining(['wohnen', 'wohne', 'wohnst', 'wohnt']),
    );
  });

  // «arbeiten → du arbeitest, er arbeitet»
  it('-t bilan tugagan o`zakka yordamchi «e» qo`shadi', () => {
    expect(wordFormsOf('arbeiten')).toEqual(
      expect.arrayContaining(['arbeitest', 'arbeitet']),
    );
  });
});

describe('wordsOf', () => {
  // `wordFormsOf` dan farqi shu: takror saqlanadi, chunki gap
  // uzunligini aynan shu funksiya sanaydi.
  it('takror so`zni ikki marta qaytaradi', () => {
    expect(wordsOf('Anna und Anna')).toEqual(['anna', 'und', 'anna']);
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

  // Lug'atda `wohnen` turadi, gapda esa `wohne`.
  it('lug`atdagi infinitivning tuslangan shaklini kechiradi', () => {
    const v = cumulativeVocab(
      [{ sections: ['s'] }],
      new Map([['s', ['wohnen']]]),
      0,
    );
    expect(unknownWords('Ich wohne hier.', v)).toEqual([]);
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
