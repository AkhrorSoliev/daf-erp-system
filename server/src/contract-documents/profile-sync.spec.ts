import type { ContractCustomer } from './contract-fields';
import {
  conflictMessage,
  profileSyncPlan,
  type StudentProfile,
} from './profile-sync';

const customer = (over: Partial<ContractCustomer> = {}): ContractCustomer => ({
  kind: 'SELF',
  kindOther: null,
  fullName: 'Soliyev Ahror',
  birthDate: '1995-05-05',
  passport: null,
  address: null,
  phone: null,
  telegram: null,
  email: null,
  ...over,
});

const profile = (over: Partial<StudentProfile> = {}): StudentProfile => ({
  passportSeries: null,
  address: null,
  telegram: null,
  parentName: null,
  parentPhone: null,
  phone: '901234567',
  ...over,
});

describe('profileSyncPlan', () => {
  it('fills empty profile fields from the contract', () => {
    expect(
      profileSyncPlan(
        customer({
          passport: 'AB1234567',
          address: 'Namangan',
          telegram: '@ahror',
        }),
        profile(),
      ),
    ).toEqual({
      writes: {
        passportSeries: 'AB1234567',
        address: 'Namangan',
        telegram: '@ahror',
      },
      conflicts: [],
    });
  });

  it('treats spacing, case and @ as the same value', () => {
    expect(
      profileSyncPlan(
        customer({
          passport: 'ab 1234567',
          telegram: 'Ahror',
          phone: '+998 90 123 45 67',
        }),
        profile({ passportSeries: 'AB1234567', telegram: '@ahror' }),
      ),
    ).toEqual({ writes: {}, conflicts: [] });
  });

  it('refuses a difference the admin has not settled', () => {
    const plan = profileSyncPlan(
      customer({ passport: 'AC7654321' }),
      profile({ passportSeries: 'AB1234567' }),
    );
    expect(plan).toEqual({ writes: {}, conflicts: ['passportSeries'] });
    expect(conflictMessage(plan.conflicts)).toMatch(/farq qiladi: pasport/);
  });

  it('updates the profile when the admin chose the new value', () => {
    expect(
      profileSyncPlan(
        customer({ passport: 'AC7654321' }),
        profile({ passportSeries: 'AB1234567' }),
        ['passportSeries'],
      ),
    ).toEqual({ writes: { passportSeries: 'AC7654321' }, conflicts: [] });
  });

  it('never writes the student own phone, even when asked', () => {
    expect(
      profileSyncPlan(customer({ phone: '911112233' }), profile(), ['phone']),
    ).toEqual({ writes: {}, conflicts: ['phone'] });
    expect(
      profileSyncPlan(
        customer({ phone: '911112233' }),
        profile({ phone: null }),
      ),
    ).toEqual({ writes: {}, conflicts: [] });
    expect(conflictMessage(['phone'])).toMatch(/profilni tahrirlash/);
  });

  it('maps a parent customer to the parent fields', () => {
    expect(
      profileSyncPlan(
        customer({
          kind: 'PARENT',
          fullName: 'Soliyeva Malika',
          phone: '907654321',
          passport: 'AA1',
        }),
        profile({ parentName: 'Soliyeva  malika' }),
      ),
    ).toEqual({ writes: { parentPhone: '907654321' }, conflicts: [] });
  });

  it('leaves a guardian or other customer out of the profile', () => {
    expect(
      profileSyncPlan(
        customer({
          kind: 'GUARDIAN',
          fullName: 'X',
          phone: '907654321',
          address: 'Y',
        }),
        profile(),
      ),
    ).toEqual({ writes: {}, conflicts: [] });
  });
});
