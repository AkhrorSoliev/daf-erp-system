import {
  latestValidNotice,
  NO_NOTICE_REFUSAL,
  transferState,
  transferTerm,
} from './transfer-condition';

const none = new Set<string>();

describe('transfer condition (ADR-0077)', () => {
  describe('latestValidNotice', () => {
    const notice = {
      createdAt: new Date('2026-10-10T07:00:00Z'),
      channel: 'BOT' as const,
    };

    it("a notice given in the student's current state counts", () => {
      expect(
        latestValidNotice(notice, new Date('2026-10-01T07:00:00Z')),
      ).toEqual({
        date: '2026-10-10',
        channel: 'BOT',
      });
      expect(latestValidNotice(notice, notice.createdAt)).not.toBeNull();
    });

    it('a notice from before the student came back and left again does not', () => {
      expect(
        latestValidNotice(notice, new Date('2026-10-15T07:00:00Z')),
      ).toBeNull();
    });

    it('a card that never changed status: every notice counts; no notice is none', () => {
      expect(latestValidNotice(notice, null)).not.toBeNull();
      expect(latestValidNotice(null, null)).toBeNull();
    });
  });

  it('the §5.2 example: notice Sat 10.10 → term to 23.10 → transfer from 22.11', () => {
    expect(transferTerm('2026-10-10', none)).toEqual({
      termEnds: '2026-10-23',
      allowedFrom: '2026-11-22',
    });
  });

  describe('transferState', () => {
    const notice = { date: '2026-10-10', channel: 'CALL' as const };

    it('without a notice: locked, with the spec text', () => {
      expect(transferState(null, none, '2026-12-01')).toEqual({
        notice: null,
        termEnds: null,
        allowedFrom: null,
        allowed: false,
        refusal: NO_NOTICE_REFUSAL,
      });
      expect(NO_NOTICE_REFUSAL).toBe(
        "Avval o'quvchiga xabar bering. Markazga o'tkazish xabardan 10 bank kuni va yana 30 kun o'tgach ochiladi.",
      );
    });

    it('too early: locked, naming the three dates', () => {
      expect(transferState(notice, none, '2026-11-21')).toEqual({
        notice,
        termEnds: '2026-10-23',
        allowedFrom: '2026-11-22',
        allowed: false,
        refusal:
          "Markazga o'tkazish 22.11 dan ochiladi (xabar 10.10 da berilgan, qaytarish muddati 23.10 gacha).",
      });
    });

    it('opens on the allowed day itself', () => {
      expect(transferState(notice, none, '2026-11-22')).toMatchObject({
        allowed: true,
        refusal: null,
      });
    });
  });
});
