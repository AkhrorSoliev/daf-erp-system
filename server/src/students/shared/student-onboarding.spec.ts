import {
  ageOn,
  birthDateProblem,
  canVerifyBySms,
  isPhoneVerified,
  missingOnboardingSteps,
} from './student-onboarding';

const COMPLETE = {
  phone: '901234567',
  verifiedPhone: '901234567',
  gender: 'FEMALE' as const,
  dateOfBirth: new Date('2004-03-15T00:00:00.000Z'),
};
const ON = { phoneVerificationEnabled: true };

describe('student onboarding (ADR-0039)', () => {
  describe('isPhoneVerified', () => {
    it('is true only while the proved number is the number on the card', () => {
      expect(isPhoneVerified(COMPLETE)).toBe(true);
      // Staff changed the number after the proof: unverified, with no flag
      // anybody had to remember to reset.
      expect(isPhoneVerified({ ...COMPLETE, phone: '935554433' })).toBe(false);
      expect(isPhoneVerified({ ...COMPLETE, verifiedPhone: null })).toBe(false);
    });
  });

  describe('canVerifyBySms', () => {
    it('accepts only the stored 9-digit Uzbek form', () => {
      expect(canVerifyBySms('901234567')).toBe(true);
      expect(canVerifyBySms('4917612345678')).toBe(false); // foreign, kept with its code
      expect(canVerifyBySms('')).toBe(false);
      expect(canVerifyBySms(null)).toBe(false);
    });
  });

  describe('missingOnboardingSteps', () => {
    it('is empty for a complete card', () => {
      expect(missingOnboardingSteps(COMPLETE, ON)).toEqual([]);
    });

    it('lists every missing step in display order', () => {
      expect(
        missingOnboardingSteps(
          {
            phone: '901234567',
            verifiedPhone: null,
            gender: null,
            dateOfBirth: null,
          },
          ON,
        ),
      ).toEqual(['PHONE', 'GENDER', 'BIRTH_DATE']);
    });

    it('does not ask for the phone while verification is switched off', () => {
      expect(
        missingOnboardingSteps(
          { ...COMPLETE, verifiedPhone: null },
          {
            phoneVerificationEnabled: false,
          },
        ),
      ).toEqual([]);
    });

    it('does not ask for the phone when no SMS can reach it', () => {
      // Asking would lock this student out for good.
      expect(
        missingOnboardingSteps(
          { ...COMPLETE, phone: '4917612345678', verifiedPhone: null },
          ON,
        ),
      ).toEqual([]);
    });

    it('asks again after staff change a verified number', () => {
      expect(
        missingOnboardingSteps({ ...COMPLETE, phone: '935554433' }, ON),
      ).toEqual(['PHONE']);
    });
  });

  describe('ageOn', () => {
    it('counts full years and turns over on the birthday itself', () => {
      expect(ageOn('2004-03-15', '2026-03-14')).toBe(21);
      expect(ageOn('2004-03-15', '2026-03-15')).toBe(22);
      expect(ageOn('2004-03-15', '2026-12-31')).toBe(22);
    });
  });

  describe('birthDateProblem', () => {
    const TODAY = '2026-09-27';

    it('accepts a plausible birth date', () => {
      expect(birthDateProblem('2004-03-15', TODAY)).toBeNull();
    });

    it('refuses a malformed or impossible date', () => {
      expect(birthDateProblem('15.03.2004', TODAY)).toMatch(/YYYY-MM-DD/);
      expect(birthDateProblem('2010-02-30', TODAY)).toMatch(/noto'g'ri/);
    });

    it('refuses a date in the future', () => {
      expect(birthDateProblem('2026-09-28', TODAY)).toMatch(/kelajakda/);
    });

    it('refuses an age outside 5–100 (a typed year, not a person)', () => {
      expect(birthDateProblem('2022-01-01', TODAY)).toMatch(/Yosh/);
      expect(birthDateProblem('1920-01-01', TODAY)).toMatch(/Yosh/);
      expect(birthDateProblem('2021-09-27', TODAY)).toBeNull(); // exactly 5
    });
  });
});
