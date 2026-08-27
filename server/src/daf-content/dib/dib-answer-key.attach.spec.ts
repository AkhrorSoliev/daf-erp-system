import {
  attachAnswerKey,
  AnswerKeyMismatchError,
} from './dib-answer-key.attach';
import type { GapExercise } from '../dataset.types';

const ex = (id: string, slots: number[]): GapExercise => ({
  id,
  kind: 'GAP',
  sentenceDe: '___ Mutter',
  blankCount: slots.length,
  answers: null,
  answerStatus: 'MISSING',
  grammarCode: 'no_02',
  setCode: 'no_02_01_fib',
  slots,
});

describe('attachAnswerKey', () => {
  it('javobni o`z raqami bo`yicha biriktiradi', () => {
    const out = attachAnswerKey(
      [ex('a', [1]), ex('b', [2])],
      ['die', 'das'],
      'no_02_01_fib',
    );

    expect(out[0].answers).toEqual(['die']);
    expect(out[1].answers).toEqual(['das']);
    expect(out[0].answerStatus).toBe('FROM_SOURCE');
  });

  it('ko`p bo`sh joyli mashqqa bir nechta javob beradi', () => {
    const out = attachAnswerKey(
      [ex('a', [1, 2])],
      ['der', 'die'],
      'no_02_01_fib',
    );

    expect(out[0].answers).toEqual(['der', 'die']);
  });

  // Raqam bo'yicha biriktirishning butun ma'nosi shu: mashqlar hujjat
  // tartibida kelmasa ham javob o'z egasini topadi.
  it('mashqlar tartibi buzilgan bo`lsa ham to`g`ri biriktiradi', () => {
    const out = attachAnswerKey(
      [ex('ikkinchi', [2]), ex('birinchi', [1])],
      ['BIR', 'IKKI'],
      's',
    );

    expect(out[0].answers).toEqual(['IKKI']);
    expect(out[1].answers).toEqual(['BIR']);
  });

  it('egasiz javob qolsa yiqiladi — o`qilmagan mashq bor degani', () => {
    expect(() =>
      attachAnswerKey([ex('a', [1])], ['die', 'das'], 'no_02_01_fib'),
    ).toThrow(AnswerKeyMismatchError);
  });

  it('bitta o`rin ikki mashqqa tegishli bo`lsa yiqiladi', () => {
    expect(() =>
      attachAnswerKey([ex('a', [1]), ex('b', [1])], ['die'], 's'),
    ).toThrow(/ikki marta/);
  });

  it('kalitda yo`q o`rin so`ralsa yiqiladi', () => {
    expect(() => attachAnswerKey([ex('a', [9])], ['die'], 's')).toThrow(
      /9-o'rinni so'radi/,
    );
  });

  it('javob o`rni yo`q mashq jimgina o`tmaydi', () => {
    expect(() => attachAnswerKey([ex('a', [])], ['die'], 's')).toThrow(
      /javob o'rni yo'q/,
    );
  });
});
