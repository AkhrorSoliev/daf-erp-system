/** Sana + "HH:mm" → ISO. Sana tanlanmagan bo'lsa `undefined`. */
export function buildDateTime(
  date: Date | null,
  time: string,
): string | undefined {
  if (!date) return undefined;
  const [hStr, mStr] = (time || "00:00").split(":");
  const h = Number(hStr) || 0;
  const m = Number(mStr) || 0;
  const out = new Date(date);
  out.setHours(h, m, 0, 0);
  return out.toISOString();
}
