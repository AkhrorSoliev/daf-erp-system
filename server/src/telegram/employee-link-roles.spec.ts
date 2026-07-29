import { GRANTABLE_ROLE_IDS, VALID_ROLE_IDS } from './constants';

/**
 * A signed registration link IS an account: whoever opens it registers with
 * exactly the roles baked into the payload. The signature stops forgery, but
 * it does not stop a legitimately-issued link from carrying a role the issuer
 * has no business granting — an Administrator minting a CEO link for their own
 * branch would pass every other check.
 */
describe('GRANTABLE_ROLE_IDS — privilege ceiling for registration links', () => {
  const CEO = 1;
  const BRANCH_DIRECTOR = 2;
  const ADMINISTRATOR = 3;
  const TEACHER = 4;
  const CASHIER = 5;

  it('lets a CEO grant every valid role', () => {
    expect([...GRANTABLE_ROLE_IDS.CEO].sort()).toEqual([...VALID_ROLE_IDS].sort());
  });

  it('never lets a Branch Director mint a CEO link', () => {
    expect(GRANTABLE_ROLE_IDS.BRANCH_DIRECTOR).not.toContain(CEO);
  });

  it('never lets an Administrator mint a CEO or Branch Director link', () => {
    expect(GRANTABLE_ROLE_IDS.ADMINISTRATOR).not.toContain(CEO);
    expect(GRANTABLE_ROLE_IDS.ADMINISTRATOR).not.toContain(BRANCH_DIRECTOR);
  });

  it('still lets an Administrator onboard the roles they actually hire', () => {
    expect(GRANTABLE_ROLE_IDS.ADMINISTRATOR).toContain(TEACHER);
    expect(GRANTABLE_ROLE_IDS.ADMINISTRATOR).toContain(CASHIER);
  });

  it('lets a Branch Director onboard staff below them', () => {
    for (const role of [ADMINISTRATOR, TEACHER, CASHIER]) {
      expect(GRANTABLE_ROLE_IDS.BRANCH_DIRECTOR).toContain(role);
    }
  });

  it('grants strictly narrow: nobody may grant a role above their own level', () => {
    // Each ceiling must be a subset of the one above it.
    const ceo = new Set<number>(GRANTABLE_ROLE_IDS.CEO);
    const bd = new Set<number>(GRANTABLE_ROLE_IDS.BRANCH_DIRECTOR);
    for (const r of GRANTABLE_ROLE_IDS.ADMINISTRATOR) expect(bd.has(r)).toBe(true);
    for (const r of GRANTABLE_ROLE_IDS.BRANCH_DIRECTOR) expect(ceo.has(r)).toBe(true);
  });
});
