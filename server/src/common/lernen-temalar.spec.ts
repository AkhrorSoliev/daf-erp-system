import { DEFAULT_LERNEN_TEMA, LERNEN_TEMA_IDLARI } from './lernen-temalar';

describe('lernen temalar', () => {
  it('lists the four looks, the default first', () => {
    expect([...LERNEN_TEMA_IDLARI]).toEqual(['toza', 'ormon', 'dengiz', 'alp']);
    expect(DEFAULT_LERNEN_TEMA).toBe('toza');
    expect(LERNEN_TEMA_IDLARI[0]).toBe(DEFAULT_LERNEN_TEMA);
  });
});
