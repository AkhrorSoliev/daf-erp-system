"use client";

/**
 * Javobdan KEYIN ochiladigan suhbat matni — o'quvchi nimani
 * eshitmaganini ko'radi. Bu mashqning asosiy o'rganish lahzasi; savol
 * paytida ko'rsatilsa, eshitish mashqi o'qish mashqiga aylanardi.
 */
export function TranskriptBlok({
  zeilen,
}: {
  zeilen: Array<{ sprecher: string; de: string; uz: string }>;
}) {
  return (
    <div className="space-y-2 rounded-2xl border border-line bg-surface p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Suhbat matni</p>
      {zeilen.map((z, i) => (
        <div key={i} className="text-base leading-relaxed">
          <span className="font-semibold text-ink-500">{z.sprecher}: </span>
          <span className="text-ink-900">{z.de}</span>
          <span className="block text-sm text-ink-500">{z.uz}</span>
        </div>
      ))}
    </div>
  );
}
