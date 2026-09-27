import { bildPrompt } from './bild-stil';

describe('bildPrompt', () => {
  it('puts the scene into the CEO-chosen flat style (B), word for word', () => {
    expect(bildPrompt('a bicycle seen from the side')).toBe(
      'Flat vector illustration with bold simple shapes, clean thick outlines ' +
        'and bright friendly colors: a bicycle seen from the side. Minimal ' +
        'detail, plain light background, subject centered and filling most ' +
        'of the frame. No text, no letters, no words, no writing, no signs ' +
        'anywhere.',
    );
  });

  it('trims the scene', () => {
    expect(bildPrompt('  a bus  ')).toContain('colors: a bus. Minimal');
  });

  it('refuses an empty scene — the model would draw anything', () => {
    expect(() => bildPrompt('   ')).toThrow(/sahna/);
  });
});
