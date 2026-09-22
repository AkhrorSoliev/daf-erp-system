"use client";

import { formatNumber } from "@/lib/format-utils";

interface Entry {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
}

interface Props {
  active?: boolean;
  payload?: Entry[];
  label?: string;
  /** Qiymat oxiriga qo'shiladigan matn, masalan «so'm» yoki «%». */
  suffix?: string;
  /** Nol qiymatli qatorlar chizilsinmi (sukut bo'yicha yo'q). */
  keepZeros?: boolean;
}

/**
 * Diagrammalar uchun umumiy tooltip.
 *
 * Recharts'ning standart tooltip'i ATAYLAB ishlatilmaydi: uning ranglari
 * shadcn mavzusini bilmaydi va qorong'i rejimda qora fonda qora matn beradi.
 * Bu esa Tailwind sinflari orqali mavzuni meros oladi.
 *
 * Nol qiymatli qatorlar tashlab ketiladi — aks holda ular tooltip'ni
 * to'ldirib, haqiqiy qiymatlarni ko'rinmas qilardi.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  suffix,
  keepZeros = false,
}: Props) {
  if (!active || !payload?.length) return null;

  const rows = keepZeros
    ? payload
    : payload.filter((p) => Number(p.value) !== 0);
  if (rows.length === 0) return null;

  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-popover-foreground shadow-md">
      {label && <p className="mb-1 text-xs font-medium">{label}</p>}
      <div className="space-y-0.5">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: r.color }}
            />
            <span className="text-muted-foreground">{r.name}</span>
            <span className="ml-auto font-medium tabular-nums">
              {typeof r.value === "number" ? formatNumber(r.value) : r.value}
              {suffix ? ` ${suffix}` : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
