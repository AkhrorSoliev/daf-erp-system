/** Keyset cursor over (createdAt desc, id desc). */
export function encodeCursor(row: { createdAt: Date; id: string }): string {
  return Buffer.from(`${row.createdAt.toISOString()}|${row.id}`).toString(
    'base64url',
  );
}

/**
 * The `where` fragment for "after this row" in (createdAt desc, id desc) order.
 * Shaped to fit any Prisma model with `createdAt` and a string `id`.
 */
export function cursorWhere(cursor: { createdAt: Date; id: string }) {
  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ],
  };
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
