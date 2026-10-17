import { attemptNote, reachOf } from './reach-state';

describe('reachOf', () => {
  const base = { linked: true, disconnectedAt: null, lastAttemptOk: null };
  it('unlinked wins over everything', () => {
    expect(
      reachOf({
        ...base,
        linked: false,
        disconnectedAt: new Date(),
        lastAttemptOk: true,
      }),
    ).toBe('UNLINKED');
  });
  it('a known block wins over a past success', () => {
    expect(
      reachOf({ ...base, disconnectedAt: new Date(), lastAttemptOk: true }),
    ).toBe('BLOCKED');
  });
  it('a delivered last attempt is DELIVERED', () => {
    expect(reachOf({ ...base, lastAttemptOk: true })).toBe('DELIVERED');
  });
  it('linked and never tried, or last try failed for another reason, is LINKED', () => {
    expect(reachOf(base)).toBe('LINKED');
    expect(reachOf({ ...base, lastAttemptOk: false })).toBe('LINKED');
  });
});

describe('attemptNote', () => {
  it('null on success', () => expect(attemptNote({ ok: true })).toBeNull());
  it('names each local reason in Uzbek', () => {
    expect(attemptNote({ ok: false, reason: 'NO_CHAT' })).toBe(
      'Telegram ulanmagan',
    );
    expect(attemptNote({ ok: false, reason: 'NO_BRANCH' })).toBe(
      'Filial tanlanmagan',
    );
    expect(attemptNote({ ok: false, reason: 'NO_BOT' })).toBe(
      'Bot ishlamayapti',
    );
  });
  it('maps a permanent Telegram refusal to the staff wording, others generically', () => {
    expect(
      attemptNote({
        ok: false,
        reason: 'SEND_FAILED',
        kind: 'permanent',
        description: 'Forbidden: bot was blocked by the user',
      }),
    ).toBe('Botni bloklagan');
    expect(
      attemptNote({
        ok: false,
        reason: 'SEND_FAILED',
        kind: 'transient',
        description: 'timeout',
      }),
    ).toBe('Telegram vaqtincha javob bermadi');
    expect(
      attemptNote({
        ok: false,
        reason: 'SEND_FAILED',
        kind: 'content',
        description: 'too long',
      }),
    ).toBe("Xabarni yuborib bo'lmadi");
  });
});
