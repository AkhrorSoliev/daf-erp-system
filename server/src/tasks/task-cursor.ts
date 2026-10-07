/** Keyset cursor over (createdAt desc, id desc). */
export function encodeCursor(row: { createdAt: Date; id: string }): string {
  return Buffer.from(`${row.createdAt.toISOString()}|${row.id}`).toString(
    'base64url',
  );
}

export function decodeCursor(
  s: string | undefined,
): { createdAt: Date; id: string } | null {
  if (!s) return null;
  const [iso, id] = Buffer.from(s, 'base64url').toString('utf8').split('|');
  const createdAt = new Date(iso);
  if (!id || Number.isNaN(createdAt.getTime())) return null;
  return { createdAt, id };
}
