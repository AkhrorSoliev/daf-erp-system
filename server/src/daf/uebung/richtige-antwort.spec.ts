import { richtigeAntwort } from './richtige-antwort';

describe('richtigeAntwort — a word`s other spellings', () => {
  const tschuess = { de: 'tschüss', uz: 'xayr', akzeptiert: ['tschüs'] };
  const bahnhof = {
    de: 'Bahnhof',
    uz: 'vokzal',
    artikel: 'der',
    akzeptiert: ['Bahnhoff'],
  };

  it('LUECKE accepts them', () => {
    expect(richtigeAntwort('LUECKE', tschuess).akzeptiert).toEqual(['tschüs']);
  });

  it('WORT_TIPPEN accepts them, with and without the article', () => {
    expect(richtigeAntwort('WORT_TIPPEN', bahnhof).akzeptiert).toEqual([
      'der Bahnhof',
      'Bahnhoff',
      'der Bahnhoff',
    ]);
  });

  it('BILD_TIPPEN accepts them with the article only', () => {
    expect(richtigeAntwort('BILD_TIPPEN', bahnhof)).toEqual({
      richtig: 'der Bahnhof',
      akzeptiert: ['der Bahnhoff'],
    });
  });

  it('UZ_WORT accepts them', () => {
    expect(richtigeAntwort('UZ_WORT', bahnhof).akzeptiert).toEqual([
      'Bahnhof',
      'Bahnhoff',
      'der Bahnhoff',
    ]);
  });

  it('a word without other spellings answers as before', () => {
    expect(richtigeAntwort('LUECKE', { de: 'ich', uz: 'men' })).toEqual({
      richtig: 'ich',
      akzeptiert: [],
    });
  });
});
