const FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Tashkent',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Tashkent wall clock: `{ date: 'DD.MM', time: 'HH:MM' }`. */
export function tashkentClock(now: Date): { date: string; time: string } {
  const p = Object.fromEntries(
    FMT.formatToParts(now).map((x) => [x.type, x.value]),
  );
  return { date: `${p.day}.${p.month}`, time: `${p.hour}:${p.minute}` };
}
