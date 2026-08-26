import { asciiMetadata } from './r2-uploader';

describe('asciiMetadata', () => {
  it('em tireni oddiy defisga almashtiradi (haqiqiy attribution satri)', () => {
    expect(
      asciiMetadata(
        'Deutsch im Blick, COERLL, The University of Texas at Austin — CC BY 4.0',
      ),
    ).toBe(
      'Deutsch im Blick, COERLL, The University of Texas at Austin - CC BY 4.0',
    );
  });

  it('ZUM shabloni: ikkita em tire ham, avtor bo\'lmaganda ham to\'g\'ri tekislanadi', () => {
    expect(asciiMetadata('ZUM Deutsch Lernen — Anna Muller — CC BY-SA 4.0')).toBe(
      'ZUM Deutsch Lernen - Anna Muller - CC BY-SA 4.0',
    );
  });

  it('qayrilma bir va qo\'sh tirnoqlarni oddiy tirnoqqa almashtiradi', () => {
    expect(asciiMetadata('‘Hallo’ “welt”')).toBe(
      '\'Hallo\' "welt"',
    );
  });

  it('jadvalda nomlanmagan ASCII bo\'lmagan belgini "?" bilan almashtiradi', () => {
    expect(asciiMetadata('café')).toBe('caf?');
  });

  it('faqat ASCII satrni o\'zgarishsiz qaytaradi', () => {
    expect(asciiMetadata('COERLL')).toBe('COERLL');
  });
});
