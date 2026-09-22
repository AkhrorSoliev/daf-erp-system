import { INTERVALLE, naechsterZustand } from './leitner';

const JETZT = new Date('2026-09-04T10:00:00.000Z');
const TAG = 24 * 60 * 60 * 1000;

describe('naechsterZustand', () => {
  it('to`g`ri javob quti darajasini bittaga ko`taradi', () => {
    expect(naechsterZustand(0, true, JETZT).strength).toBe(1);
    expect(naechsterZustand(3, true, JETZT).strength).toBe(4);
  });

  it('eng yuqori qutidan oshmaydi', () => {
    const max = INTERVALLE.length - 1;
    expect(naechsterZustand(max, true, JETZT).strength).toBe(max);
  });

  it('to`g`ri javobda muddat yangi darajaga qarab qo`yiladi', () => {
    const z = naechsterZustand(1, true, JETZT);
    expect(z.dueAt.getTime()).toBe(JETZT.getTime() + INTERVALLE[2] * TAG);
  });

  it('xato javob darajani NOLGA tushiradi', () => {
    expect(naechsterZustand(5, false, JETZT).strength).toBe(0);
  });

  it('xato javobdan keyin so`z ertaga qaytadi', () => {
    const z = naechsterZustand(5, false, JETZT);
    expect(z.dueAt.getTime()).toBe(JETZT.getTime() + TAG);
  });
});
