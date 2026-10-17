import { DEFAULT_UI_SKIN, UI_SKIN_IDS } from './ui-skins';

describe('ui skins', () => {
  it('lists the five skins, the default first', () => {
    expect([...UI_SKIN_IDS]).toEqual([
      'daftar',
      'ormon',
      'gilos',
      'grafit',
      'qum',
    ]);
    expect(DEFAULT_UI_SKIN).toBe('daftar');
    expect(UI_SKIN_IDS[0]).toBe(DEFAULT_UI_SKIN);
  });
});
