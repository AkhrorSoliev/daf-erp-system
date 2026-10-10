import { richtigeAntwort, textAntwort } from './richtige-antwort';

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

describe('SATZ_HOEREN — checked exactly like SATZ_BAUEN', () => {
  const satz = {
    de: 'Ich wohne in Deutschland.',
    uz: 'Men Germaniyada yashayman.',
    akzeptiert: ['In Deutschland wohne ich.'],
  };

  it('has the same answer and accepted orders', () => {
    expect(richtigeAntwort('SATZ_HOEREN', satz)).toEqual(
      richtigeAntwort('SATZ_BAUEN', satz),
    );
  });

  it('an accepted other word order counts as correct', () => {
    // Never punish a correct answer: the student heard one order and built
    // another correct German sentence from the same tiles.
    expect(
      textAntwort('SATZ_HOEREN', satz, 'In Deutschland wohne Ich').isCorrect,
    ).toBe(true);
    expect(
      textAntwort('SATZ_HOEREN', satz, 'Wohne ich in Deutschland').isCorrect,
    ).toBe(false);
  });
});
