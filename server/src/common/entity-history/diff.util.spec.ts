import { computeChangedFields } from './diff.util';

describe('computeChangedFields', () => {
  it('never journals the session version — a security counter, not business data', () => {
    expect(
      computeChangedFields(
        { firstName: 'Ali', sessionVersion: 2 },
        { firstName: 'Ali', sessionVersion: 3 },
      ),
    ).toBeNull();
  });

  it('still journals an ordinary field beside it', () => {
    expect(
      computeChangedFields(
        { firstName: 'Ali', sessionVersion: 2 },
        { firstName: 'Vali', sessionVersion: 3 },
      ),
    ).toEqual({
      oldValues: { firstName: 'Ali' },
      newValues: { firstName: 'Vali' },
    });
  });
});
