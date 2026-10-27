import {
  jangFayliXatolari,
  type JangSavolFayli,
} from './jang-savollari.validate';

const choose = (i: number) => ({
  id: `jang-a1-u01-${String(i).padStart(3, '0')}`,
  kind: 'CHOOSE' as const,
  prompt: '«Xayr» nemischa?',
  options: ['Tschüss', 'Hallo', 'Danke'],
  answer: 'Tschüss',
});
const fayl = (savollar: JangSavolFayli['savollar']): JangSavolFayli => ({
  level: 'A1',
  order: 1,
  tasdiqlangan: false,
  savollar,
});
const yaxshi = () =>
  fayl([
    ...Array.from({ length: 16 }, (_, i) => choose(i + 1)),
    ...Array.from({ length: 12 }, (_, i) => ({
      id: `jang-a1-u01-${String(i + 17).padStart(3, '0')}`,
      kind: 'TYPE' as const,
      prompt: 'Guten ___! (ertalab)',
      answer: 'Morgen',
    })),
    ...Array.from({ length: 4 }, (_, i) => ({
      id: `jang-a1-u01-${String(i + 29).padStart(3, '0')}`,
      kind: 'LISTEN' as const,
      prompt: "Qaysi so'zni eshitdingiz?",
      options: ['Hallo', 'Tschüss', 'Danke'],
      answer: 'Hallo',
      lexeme: 'u01-s1-hallo',
    })),
  ]);
const ESH = { 'u01-s1-hallo': 900 };

describe('jangFayliXatolari', () => {
  it("yaxshi fayl — xato yo'q", () =>
    expect(jangFayliXatolari(yaxshi(), ESH)).toEqual([]));
  it('30 tadan kam savol', () => {
    const f = yaxshi();
    f.savollar = f.savollar.slice(0, 20);
    expect(jangFayliXatolari(f, ESH).join()).toContain('30–40');
  });
  it('takror id', () => {
    const f = yaxshi();
    f.savollar[1].id = f.savollar[0].id;
    expect(jangFayliXatolari(f, ESH).join()).toContain('takror');
  });
  it("javob variantlar ichida yo'q", () => {
    const f = yaxshi();
    f.savollar[0].options = ['Hallo', 'Danke', 'Bitte'];
    expect(jangFayliXatolari(f, ESH).join()).toContain('variant');
  });
  it("eshitish so'zi uzun yoki yo'q", () => {
    expect(jangFayliXatolari(yaxshi(), {}).join()).toContain('3000');
  });
  it('id shakli unit bilan mos', () => {
    const f = yaxshi();
    f.savollar[0].id = 'jang-a1-u02-001';
    expect(jangFayliXatolari(f, ESH).join()).toContain('id');
  });
});
