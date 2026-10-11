import { richtigeAntwort, textAntwort } from './richtige-antwort';
import { uhrMaterial } from './uhr-fragen';

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

describe('clock answers (UHR_LESEN, UHR_TIPPEN)', () => {
  // `pruefen` loads this material from the stored time (`uhrMaterial`).
  const halbVier = uhrMaterial('03:30');

  it.each([
    'halb vier',
    'Halb vier.',
    'drei Uhr dreißig',
    'drei uhr dreissig',
    'fünfzehn Uhr dreißig',
    'fuenfzehn Uhr dreissig',
    'Es ist halb vier.',
    'es ist drei Uhr dreißig',
  ])('UHR_TIPPEN accepts %p for 3:30', (given) => {
    const r = textAntwort('UHR_TIPPEN', halbVier, given);
    expect(r.isCorrect).toBe(true);
    expect(r.tippfehler).toBe(false);
    expect(r.richtig).toBe('halb vier');
  });

  it.each([
    'halb drei',
    'halb fünf',
    'drei Uhr',
    'vier Uhr dreißig',
    'Viertel nach drei',
    '3:30',
    '',
  ])('UHR_TIPPEN refuses %p for 3:30', (given) => {
    expect(textAntwort('UHR_TIPPEN', halbVier, given).isCorrect).toBe(false);
  });

  it('UHR_TIPPEN forgives one slip in a long word, and says so', () => {
    const r = textAntwort(
      'UHR_TIPPEN',
      uhrMaterial('03:15'),
      'Virtel nach drei',
    );
    expect(r).toEqual({
      isCorrect: true,
      richtig: 'Viertel nach drei',
      tippfehler: true,
    });
  });

  it('both ways of saying 3:20 are right', () => {
    const m = uhrMaterial('03:20');
    expect(textAntwort('UHR_TIPPEN', m, 'zwanzig nach drei').isCorrect).toBe(
      true,
    );
    expect(textAntwort('UHR_TIPPEN', m, 'zehn vor halb vier').isCorrect).toBe(
      true,
    );
    expect(textAntwort('UHR_TIPPEN', m, 'zehn vor vier').isCorrect).toBe(false);
  });

  it('UHR_LESEN: the chosen option against the time, no slip forgiven', () => {
    expect(textAntwort('UHR_LESEN', halbVier, 'halb vier').isCorrect).toBe(
      true,
    );
    expect(textAntwort('UHR_LESEN', halbVier, 'halb drei')).toEqual({
      isCorrect: false,
      richtig: 'halb vier',
      tippfehler: false,
    });
  });
});
