import { javobTogrimi } from './jang-javob';

describe('javobTogrimi', () => {
  it('tanlash — aynan variant matni', () => {
    const s = { kind: 'CHOOSE' as const, answer: 'Tschüss', akzeptiert: [] };
    expect(javobTogrimi(s, 'Tschüss')).toBe(true);
    expect(javobTogrimi(s, 'tschüss')).toBe(false);
  });
  it('yozish — ä/ae, katta-kichik harf kechiriladi', () => {
    const s = { kind: 'TYPE' as const, answer: 'Tschüss', akzeptiert: [] };
    expect(javobTogrimi(s, 'tschuess')).toBe(true);
    expect(javobTogrimi(s, 'Tschüs')).toBe(false);
    expect(javobTogrimi(s, '')).toBe(false);
  });
  it('yozish — akzeptiert', () => {
    expect(
      javobTogrimi(
        { kind: 'TYPE', answer: 'heiße', akzeptiert: ['heisse'] },
        'heisse',
      ),
    ).toBe(true);
  });
});
