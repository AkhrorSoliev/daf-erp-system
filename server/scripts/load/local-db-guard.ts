/** Load scripts write a million rows: they refuse any database but a local one. */
export function assertLocalDb(): void {
  const host = new URL(process.env.DATABASE_URL ?? 'postgres://none').hostname;
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error(`Faqat lokal baza (hozir: ${host}). To'xtatildi.`);
  }
}
