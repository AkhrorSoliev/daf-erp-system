import { certificateNumber } from './participation-number';

describe('certificateNumber', () => {
  it('pads the sequence to four digits', () => {
    expect(certificateNumber(2026, 1)).toBe('TB-2026-0001');
    expect(certificateNumber(2026, 42)).toBe('TB-2026-0042');
  });
  it('keeps growing past four digits', () => {
    expect(certificateNumber(2027, 10000)).toBe('TB-2027-10000');
  });
});
