import {
  activeSessionCutoff,
  clientMeta,
  describeDevice,
  sessionRevokedKey,
} from './user-session';
import { REFRESH_TOKEN_TTL_SEC } from '../../auth/token-lifetimes';

describe('describeDevice', () => {
  const ua = {
    chromeMac:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    safariIphone:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    edgeWindows:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 Edg/120.0',
    firefoxLinux:
      'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
    chromeAndroid:
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
  };

  it('names browser and system', () => {
    expect(describeDevice(ua.chromeMac)).toBe('Chrome · macOS');
    expect(describeDevice(ua.safariIphone)).toBe('Safari · iOS');
    expect(describeDevice(ua.firefoxLinux)).toBe('Firefox · Linux');
    expect(describeDevice(ua.chromeAndroid)).toBe('Chrome · Android');
  });

  it('Edge calls itself Chrome too — Edge must win', () => {
    expect(describeDevice(ua.edgeWindows)).toBe('Edge · Windows');
  });

  it('falls back instead of printing nothing', () => {
    expect(describeDevice(null)).toBe("Noma'lum qurilma");
    expect(describeDevice('')).toBe("Noma'lum qurilma");
    expect(describeDevice('curl/8.0')).toBe("Noma'lum qurilma");
    expect(describeDevice('Mozilla/5.0 (Windows NT 10.0)')).toBe('Windows');
  });
});

describe('clientMeta', () => {
  it('reads user-agent and the first forwarded address', () => {
    expect(
      clientMeta({
        headers: { 'user-agent': 'UA', 'x-forwarded-for': '1.1.1.1, 2.2.2.2' },
        ip: '9.9.9.9',
      }),
    ).toEqual({ userAgent: 'UA', ip: '1.1.1.1' });
  });

  it('falls back to the socket address and survives a bare request', () => {
    expect(clientMeta({ headers: {}, ip: '9.9.9.9' }).ip).toBe('9.9.9.9');
    expect(clientMeta({})).toEqual({ userAgent: null, ip: null });
    expect(clientMeta(undefined)).toEqual({ userAgent: null, ip: null });
  });

  it('cuts an oversized user-agent', () => {
    const meta = clientMeta({ headers: { 'user-agent': 'x'.repeat(1000) } });
    expect(meta.userAgent).toHaveLength(300);
  });
});

describe('session helpers', () => {
  it('the cutoff is exactly one refresh-token lifetime back', () => {
    const now = new Date('2026-10-18T12:00:00Z');
    expect(now.getTime() - activeSessionCutoff(now).getTime()).toBe(
      REFRESH_TOKEN_TTL_SEC * 1000,
    );
  });

  it('keys the revoked mark by session id', () => {
    expect(sessionRevokedKey('abc')).toBe('user:session-revoked:abc');
  });
});
