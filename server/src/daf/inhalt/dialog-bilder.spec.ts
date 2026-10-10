import { validateDialogBilder } from './dialog-bilder';

const KEY = 'daf/bild/0123456789abcdef0123456789abcdef.jpg';

describe('validateDialogBilder', () => {
  it('accepts a random key for an existing dialog', () => {
    expect(
      validateDialogBilder({ 'u04-d1': KEY }, new Set(['u04-d1'])),
    ).toEqual([]);
  });

  it('flags a key for a dialog that does not exist', () => {
    expect(
      validateDialogBilder({ 'u04-d99': KEY }, new Set(['u04-d1'])),
    ).toEqual([expect.stringContaining('u04-d99')]);
  });

  it('flags a key that is not daf/bild/<hex>.jpg', () => {
    // A readable key ("u04-d1.jpg") would name the dialog in the URL.
    expect(
      validateDialogBilder(
        { 'u04-d1': 'daf/bild/u04-d1.jpg' },
        new Set(['u04-d1']),
      ),
    ).toEqual([expect.stringContaining('u04-d1')]);
  });
});
