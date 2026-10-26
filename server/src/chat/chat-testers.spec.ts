import { isChatTester, parseChatTesterIds } from './chat-testers';

const cfg = (v?: string) => ({ get: () => v }) as never;

describe('chat testers', () => {
  it('parses unset and empty as nobody', () => {
    expect(parseChatTesterIds(undefined).size).toBe(0);
    expect(parseChatTesterIds('').size).toBe(0);
  });

  it('parses ids with whitespace, ignores junk, dedupes', () => {
    expect([
      ...parseChatTesterIds('10003, 10028 ,abc,-1,1.5,,0,10003'),
    ]).toEqual([10003, 10028]);
  });

  it('isChatTester matches listed ids only', () => {
    expect(isChatTester(cfg('10003, 10028'), 10028)).toBe(true);
    expect(isChatTester(cfg('10003, 10028'), 5)).toBe(false);
    expect(isChatTester(cfg(undefined), 10003)).toBe(false);
    expect(isChatTester(cfg('10003'), undefined)).toBe(false);
  });
});
