import { readFileSync } from 'fs';
import { join } from 'path';
import { validateEindeutigkeit } from './unit-inhalt.validate';
import type { WoerterFile, RedemittelFile } from './unit-inhalt.types';

const A1 = join(__dirname, '..', '..', '..', 'content', 'daf', 'a1');
const read = <T>(...p: string[]): T =>
  JSON.parse(readFileSync(join(A1, ...p), 'utf8')) as T;

const wort = (
  de: string,
  sourceId: string,
): WoerterFile['woerter'][number] => ({
  sourceId,
  section: 'u01-s1',
  de,
  uz: 'x',
  core: true,
  order: 1,
});

const phrase = (funktionUz: string): RedemittelFile['phrasen'][number] => ({
  section: 'u01-s1',
  funktion: 'f',
  funktionUz,
  de: 'Hallo!',
  uz: 'Salom!',
});

describe('unit ichida matn noyobligi', () => {
  it('takroriy `de` topiladi va nechta ekani aytiladi', () => {
    const problems = validateEindeutigkeit(
      {
        unit: 'u02',
        woerter: [
          wort('die Bank', 'u02-s1-bank'),
          wort('die Bank', 'u02-s3-bank-sitz'),
          wort('der Tisch', 'u02-s1-tisch'),
        ],
      },
      null,
    );

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('die Bank');
    expect(problems[0]).toContain('2 marta');
  });

  it('takroriy `funktionUz` topiladi', () => {
    const problems = validateEindeutigkeit(
      { unit: 'u02', woerter: [wort('der Tisch', 'u02-s1-tisch')] },
      {
        unit: 'u02',
        phrasen: [phrase('salomlashish'), phrase('salomlashish')],
      },
    );

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('salomlashish');
  });

  // Bazadagi qidiruv AYNAN solishtiradi (`where: { de }`), shuning uchun
  // `Bank` va `bank` ikki xil qator — ular bir-birini jazolay olmaydi va
  // bu yerda ham muammo deb belgilanmasligi kerak. Normalizatsiya
  // qo'shilsa, validator kod qilmaydigan narsani talab qilib qolardi.
  it('katta-kichik harf farqi takror emas', () => {
    const problems = validateEindeutigkeit(
      {
        unit: 'u02',
        woerter: [wort('Bank', 'u02-s1-bank'), wort('bank', 'u02-s2-bank')],
      },
      null,
    );

    expect(problems).toEqual([]);
  });

  it('1-unitning haqiqiy matni toza', () => {
    expect(
      validateEindeutigkeit(
        read<WoerterFile>('u01', 'woerter.json'),
        read<RedemittelFile>('u01', 'redemittel.json'),
      ),
    ).toEqual([]);
  });
});
