import { afterQuietHours, telegramSendAfter } from './task-quiet-hours';

// Tashkent is UTC+5: 22:00 Tashkent = 17:00Z, 08:00 Tashkent = 03:00Z.
describe('night quiet (spec §6.4: 22:00–08:00 Asia/Tashkent)', () => {
  it.each([
    ['21:59 goes now', '2026-10-12T16:59:00.000Z', '2026-10-12T16:59:00.000Z'],
    [
      '22:00 waits for 08:00',
      '2026-10-12T17:00:00.000Z',
      '2026-10-13T03:00:00.000Z',
    ],
    [
      '23:30 waits for 08:00',
      '2026-10-12T18:30:00.000Z',
      '2026-10-13T03:00:00.000Z',
    ],
    [
      '00:10 waits for the same morning',
      '2026-10-12T19:10:00.000Z',
      '2026-10-13T03:00:00.000Z',
    ],
    [
      '07:59 waits one minute',
      '2026-10-13T02:59:00.000Z',
      '2026-10-13T03:00:00.000Z',
    ],
    ['08:00 goes now', '2026-10-13T03:00:00.000Z', '2026-10-13T03:00:00.000Z'],
    [
      '31.10 23:00 → 01.11 08:00',
      '2026-10-31T18:00:00.000Z',
      '2026-11-01T03:00:00.000Z',
    ],
  ])('%s', (_label, from, to) => {
    expect(afterQuietHours(new Date(from)).toISOString()).toBe(to);
  });

  it('an URGENT task never waits', () => {
    const night = new Date('2026-10-12T18:30:00.000Z');
    expect(telegramSendAfter(night, 'URGENT')).toBe(night);
  });

  it.each(['LOW', 'MEDIUM', 'HIGH'] as const)(
    '%s waits for the morning',
    (p) => {
      expect(
        telegramSendAfter(
          new Date('2026-10-12T18:30:00.000Z'),
          p,
        ).toISOString(),
      ).toBe('2026-10-13T03:00:00.000Z');
    },
  );
});
