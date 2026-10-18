const LOCAL_DB_NAME = 'daf_s1_yuklama';

/**
 * Load scripts write a million rows (the seed wipes DafAttempt): they refuse any
 * database but the local throwaway one. A tunnel can put production on
 * localhost, so the host alone is not enough — the name must match too.
 */
export function assertLocalDb(): void {
  const url = new URL(process.env.DATABASE_URL ?? 'postgres://none');
  const host = url.hostname;
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error(`Faqat lokal baza (hozir: ${host}). To'xtatildi.`);
  }
  const name = url.pathname.replace(/^\//, '');
  if (name !== LOCAL_DB_NAME) {
    throw new Error(
      `Faqat "${LOCAL_DB_NAME}" bazasi (hozir: "${name}"). To'xtatildi.`,
    );
  }
}
