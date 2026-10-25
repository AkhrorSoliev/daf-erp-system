import { maySeePhoto, mayFindByName, mayWrite } from './chat-people.rules';

describe('privacy rules', () => {
  it('mayWrite', () => {
    expect(mayWrite('EVERYONE', false)).toBe(true);
    expect(mayWrite('GROUPMATES', true)).toBe(true);
    expect(mayWrite('GROUPMATES', false)).toBe(false);
    expect(mayWrite('NOBODY', true)).toBe(false);
  });

  it('maySeePhoto follows the same table', () => {
    expect(maySeePhoto('EVERYONE', false)).toBe(true);
    expect(maySeePhoto('GROUPMATES', false)).toBe(false);
    expect(maySeePhoto('NOBODY', true)).toBe(false);
  });

  it('mayFindByName', () => {
    expect(mayFindByName('EVERYONE')).toBe(true);
    expect(mayFindByName('NOBODY')).toBe(false);
  });
});
