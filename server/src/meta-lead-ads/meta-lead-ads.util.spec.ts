import { createHmac } from 'crypto';
import {
  metaSourceName,
  parseMetaLead,
  verifyMetaSignature,
} from './meta-lead-ads.util';

const sign = (body: string, secret: string) =>
  'sha256=' + createHmac('sha256', secret).update(body).digest('hex');

describe('verifyMetaSignature', () => {
  const body = Buffer.from('{"entry":[]}');

  it('accepts the right signature', () => {
    expect(
      verifyMetaSignature(body, sign(body.toString(), 's3cret'), 's3cret'),
    ).toBe(true);
  });

  it('refuses a wrong secret, a missing header and a missing body', () => {
    expect(
      verifyMetaSignature(body, sign(body.toString(), 'other'), 's3cret'),
    ).toBe(false);
    expect(verifyMetaSignature(body, undefined, 's3cret')).toBe(false);
    expect(verifyMetaSignature(undefined, sign('x', 's3cret'), 's3cret')).toBe(
      false,
    );
    expect(verifyMetaSignature(body, 'sha256=zz', 's3cret')).toBe(false);
  });
});

describe('parseMetaLead', () => {
  it('splits full_name and normalizes an Uzbek phone', () => {
    expect(
      parseMetaLead([
        { name: 'full_name', values: ['Ali Valiyev Karim'] },
        { name: 'phone_number', values: ['+998 90 123 45 67'] },
      ]),
    ).toEqual({
      firstName: 'Ali',
      lastName: 'Valiyev Karim',
      phone: '901234567',
    });
  });

  it('prefers first_name / last_name and fills a missing last name', () => {
    expect(
      parseMetaLead([
        { name: 'first_name', values: ['Ali'] },
        { name: 'phone_number', values: ['901234567'] },
      ]),
    ).toEqual({ firstName: 'Ali', lastName: '-', phone: '901234567' });
  });

  it('returns null without a usable phone or name', () => {
    expect(parseMetaLead([{ name: 'full_name', values: ['Ali'] }])).toBeNull();
    expect(
      parseMetaLead([{ name: 'phone_number', values: ['901234567'] }]),
    ).toBeNull();
  });
});

describe('metaSourceName', () => {
  it('maps ig to Instagram and everything else to Facebook', () => {
    expect(metaSourceName('ig')).toBe('Instagram');
    expect(metaSourceName('fb')).toBe('Facebook');
    expect(metaSourceName(undefined)).toBe('Facebook');
  });
});
