import type { ConfigService } from '@nestjs/config';

/** `CHAT_TESTER_IDS` — comma-separated student ids; junk tokens are ignored. */
export function parseChatTesterIds(raw: string | undefined): Set<number> {
  const ids = new Set<number>();
  for (const token of (raw ?? '').split(',')) {
    const t = token.trim();
    if (/^\d+$/.test(t) && Number(t) > 0) ids.add(Number(t));
  }
  return ids;
}

/** A named tester uses the chat before the launch (switch off, write rules skipped; a ban still applies). */
export function isChatTester(
  config: ConfigService,
  studentId: number | undefined,
): boolean {
  if (typeof studentId !== 'number') return false;
  return parseChatTesterIds(config.get<string>('CHAT_TESTER_IDS')).has(
    studentId,
  );
}
