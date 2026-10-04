import { readFileSync } from 'fs';
import { join } from 'path';
import {
  isWordInGoetheA1,
  mergeGoethe,
  parseGoetheTsv,
  type GoetheFile,
} from './goethe-parse';

const HEADER =
  'level\tpage_num\tpar_num\tblock_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext';

/** `pdftotext -tsv` word rows, each given as [page, x, y, text]. */
function tsv(...words: Array<[number, number, number, string]>): string {
  const rows = words.map(
    ([p, x, y, t]) => `5\t${p}\t0\t0\t0\t0\t${x}\t${y}\t10\t10\t100\t${t}`,
  );
  return [HEADER, ...rows].join('\n');
}

describe('parseGoetheTsv', () => {
  it('skips the section letter and other pages, keeps a stem entry as printed', () => {
    expect(
      parseGoetheTsv(
        tsv(
          [8, 142.98, 300, 'schwarz'],
          [9, 142.98, 110, 'A'],
          [9, 142.98, 252.83, 'all-'],
          [9, 236.53, 252.83, 'Alles'],
          [9, 260.11, 252.83, 'Gute!'],
          [9, 142.98, 317.81, 'allein'],
        ),
      ),
    ).toEqual([
      { wort: 'all-', artikel: null },
      { wort: 'allein', artikel: null },
    ]);
  });

  it('joins a noun broken over two lines', () => {
    expect(
      parseGoetheTsv(
        tsv(
          [9, 148.22, 746.67, 'der'],
          [9, 164.09, 746.67, 'Anruf-'],
          [9, 236.53, 746.67, 'Sprechen'],
          [9, 148.22, 759.67, 'beantworter'],
          [9, 236.53, 759.67, 'den'],
        ),
      ),
    ).toEqual([{ wort: 'Anrufbeantworter', artikel: 'der', neben: true }]);
  });

  it('takes back a plural pushed into the example column', () => {
    expect(
      parseGoetheTsv(
        tsv(
          [23, 142.98, 278.82, 'die'],
          [23, 157.82, 278.82, 'Sehenswürdigkeit,'],
          [23, 232.82, 278.82, '-en'],
        ),
      ),
    ).toEqual([{ wort: 'Sehenswürdigkeit', artikel: 'die', plural: '-en' }]);
  });

  it('marks an indented entry as neben, by x or by leading spaces', () => {
    expect(
      parseGoetheTsv(
        tsv(
          [13, 142.98, 525.74, 'duschen'],
          [13, 142.98, 538.74, '  die'],
          [13, 157.82, 538.74, 'Dusche'],
          [13, 142.98, 551.73, 'einladen'],
          [13, 148.22, 564.73, 'die'],
          [13, 163.06, 564.73, 'Einladung'],
        ),
      ),
    ).toEqual([
      { wort: 'duschen', artikel: null },
      { wort: 'Dusche', artikel: 'die', neben: true },
      { wort: 'einladen', artikel: null },
      { wort: 'Einladung', artikel: 'die', neben: true },
    ]);
  });

  it('a pair split by "/" over two lines is two main entries', () => {
    expect(
      parseGoetheTsv(
        tsv(
          [17, 142.98, 213.85, 'die'],
          [17, 157.82, 213.85, 'Hausfrau,'],
          [17, 197.11, 213.85, '-en/'],
          [17, 142.98, 226.84, '  der'],
          [17, 162.4, 226.84, 'Hausmann'],
          [17, 236.53, 226.84, 'Die'],
        ),
      ),
    ).toEqual([
      { wort: 'Hausfrau', artikel: 'die', plural: '-en' },
      { wort: 'Hausmann', artikel: 'der' },
    ]);
  });

  it('expands a special headword', () => {
    expect(
      parseGoetheTsv(
        tsv(
          [13, 142.98, 304.82, 'der,'],
          [13, 160.03, 304.82, 'die,'],
          [13, 177.07, 304.82, 'das'],
          [16, 142.98, 161.86, 'gern(e)'],
        ),
      ),
    ).toEqual([
      { wort: 'der', artikel: null },
      { wort: 'die', artikel: null },
      { wort: 'das', artikel: null },
      { wort: 'gern', artikel: null, varianten: ['gerne'] },
    ]);
  });

  it('writes plurals one way: umlaut as ¨, dash as -, (pl.) kept', () => {
    expect(
      parseGoetheTsv(
        tsv(
          [10, 142.98, 200, 'der'],
          [10, 158.86, 200, 'Arzt,'],
          [10, 181.2, 200, '-Ä,'],
          [10, 195.3, 200, 'e'],
          [12, 142.98, 300, 'das'],
          [12, 159.24, 300, 'Brötchen,'],
          [12, 201.5, 300, '–'],
          [21, 142.98, 400, 'die'],
          [21, 157.82, 400, 'Pommes'],
          [21, 190.4, 400, 'frites'],
          [21, 217.71, 400, '(pl.)  Die'],
          [21, 236.53, 400, 'Kinder'],
        ),
      ),
    ).toEqual([
      { wort: 'Arzt', artikel: 'der', plural: '-¨e' },
      { wort: 'Brötchen', artikel: 'das', plural: '-' },
      { wort: 'Pommes frites', artikel: 'die', plural: '(pl.)' },
    ]);
  });
});

describe('mergeGoethe', () => {
  it('folds a homograph into auch and a group into its word', () => {
    expect(
      mergeGoethe([
        { wort: 'essen', artikel: null },
        { wort: 'Essen', artikel: 'das', neben: true },
        { wort: 'Uhr', artikel: 'die' },
        { wort: 'Uhr', artikel: null, gruppe: 'Uhrzeit' },
        { wort: 'halb', artikel: null, gruppe: 'Datum' },
        { wort: 'halb', artikel: null, gruppe: 'Uhrzeit' },
      ]),
    ).toEqual([
      { wort: 'essen', artikel: null, auch: ['Essen'] },
      { wort: 'Uhr', artikel: 'die', gruppe: 'Uhrzeit' },
      { wort: 'halb', artikel: null, gruppe: 'Datum; Uhrzeit' },
    ]);
  });
});

describe('isWordInGoetheA1', () => {
  const file: GoetheFile = {
    source: 'test',
    woerter: [
      { wort: 'gern', artikel: null, varianten: ['gerne'] },
      { wort: 'essen', artikel: null, auch: ['Essen'] },
      { wort: 'dies-', artikel: null },
      { wort: 'Lieblings-', artikel: null },
      { wort: 'Juli', artikel: 'der', gruppe: 'Monat/Monatsnamen' },
    ],
  };

  it('matches a spelling variant', () => {
    expect(isWordInGoetheA1('gerne', file)).toBe(true);
  });

  it('matches a homograph in any case', () => {
    expect(isWordInGoetheA1('Essen', file)).toBe(true);
    expect(isWordInGoetheA1('ESSEN', file)).toBe(true);
  });

  it('matches a word built on a stem entry', () => {
    expect(isWordInGoetheA1('diesen', file)).toBe(true);
    expect(isWordInGoetheA1('Lieblingsfilm', file)).toBe(true);
  });

  it('a lowercase stem only inflects, a capitalised one starts compounds', () => {
    expect(isWordInGoetheA1('diesem', file)).toBe(true);
    expect(isWordInGoetheA1('Diesel', file)).toBe(false);
    expect(isWordInGoetheA1('Lieblings', file)).toBe(false);
  });

  it('matches a group word', () => {
    expect(isWordInGoetheA1('juli', file)).toBe(true);
  });

  it('rejects a word that is not listed', () => {
    expect(isWordInGoetheA1('Kühlschrank', file)).toBe(false);
    expect(isWordInGoetheA1('die', file)).toBe(false);
  });
});

describe('goethe-a1.json', () => {
  const file = JSON.parse(
    readFileSync(
      join(
        __dirname,
        '..',
        '..',
        '..',
        'content',
        'daf',
        'a1',
        'goethe-a1.json',
      ),
      'utf8',
    ),
  ) as GoetheFile;

  it('keeps the words the line-by-line extraction lost', () => {
    const lost = [
      'Tag',
      'danke',
      'Entschuldigung',
      'erste',
      'Arbeit',
      'Minute',
      'Anrufbeantworter',
      'Kreditkarte',
      'zum Beispiel',
    ].filter((w) => !isWordInGoetheA1(w, file));
    expect(lost).toEqual([]);
  });

  it('holds no extraction junk', () => {
    const junk = file.woerter.filter(
      (e) =>
        /\d|\s{2}/.test(e.wort) ||
        e.wort.length < 2 ||
        /^[A-ZÄÖÜ]{3,}$/.test(e.wort),
    );
    expect(junk).toEqual([]);
  });
});
