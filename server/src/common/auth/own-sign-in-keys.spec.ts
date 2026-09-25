import { ForbiddenException } from '@nestjs/common';
import {
  assertNotChangingOwnSignInKeys,
  OWN_SIGN_IN_KEYS_MESSAGE,
} from './own-sign-in-keys';

const me = { id: 10, phone: '901112233', login: 'akmal' };

describe('assertNotChangingOwnSignInKeys (ADR-0031)', () => {
  it('refuses changing your own phone', () => {
    const attempt = () =>
      assertNotChangingOwnSignInKeys(me, 10, { phone: '909998877' });
    expect(attempt).toThrow(ForbiddenException);
    expect(attempt).toThrow(OWN_SIGN_IN_KEYS_MESSAGE);
  });

  it('refuses changing your own login', () => {
    expect(() =>
      assertNotChangingOwnSignInKeys(me, 10, { login: 'akmal2' }),
    ).toThrow(ForbiddenException);
  });

  it('refuses setting your own password, whatever it is', () => {
    expect(() =>
      assertNotChangingOwnSignInKeys(me, 10, { password: 'secret1' }),
    ).toThrow(ForbiddenException);
  });

  it('accepts the stored phone and login re-sent unchanged (the form re-sends them)', () => {
    expect(() =>
      assertNotChangingOwnSignInKeys(me, 10, {
        phone: '901112233',
        login: 'akmal',
      }),
    ).not.toThrow();
  });

  it('accepts an edit of yourself that touches no key', () => {
    expect(() => assertNotChangingOwnSignInKeys(me, 10, {})).not.toThrow();
  });

  it('treats an empty password as none, exactly as the services write it', () => {
    expect(() =>
      assertNotChangingOwnSignInKeys(me, 10, { password: '' }),
    ).not.toThrow();
  });

  it('leaves someone else alone: that is the rank rule, not this one', () => {
    expect(() =>
      assertNotChangingOwnSignInKeys(me, 11, {
        phone: '909998877',
        login: 'x',
        password: 'secret1',
      }),
    ).not.toThrow();
  });

  it('refuses when the caller is unknown instead of skipping the check (ADR-0008)', () => {
    expect(() =>
      assertNotChangingOwnSignInKeys(me, undefined, { firstName: 'x' } as any),
    ).toThrow(ForbiddenException);
  });
});
