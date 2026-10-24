const TASHKENT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Tashkent",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** «dd.MM.yyyy, HH:mm» on the Toshkent clock. */
export function archiveDate(iso: string | null): string {
  if (!iso) return "—";
  const p = Object.fromEntries(
    TASHKENT.formatToParts(new Date(iso)).map((x) => [x.type, x.value]),
  );
  return `${p.day}.${p.month}.${p.year}, ${p.hour}:${p.minute}`;
}
