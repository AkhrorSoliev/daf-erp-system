"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartCard } from "@/components/shared/chart-card";
import { formatKunYorligi, formatKunOy } from "@/components/groups/app-activity/activity-format";
import type { MarkazTrendKuni } from "./types";

// Literal ranglar — SVG `hsl(var(--x))` ni ishonchli o'qimaydi (departed-students grafiklari kabi).
const KIRGAN = "#94a3b8"; // slate-400
const FAOL = "#2563eb"; // blue-600

export function DafTrendChart({ trend }: { trend: MarkazTrendKuni[] }) {
  const rows = trend.map((t) => ({ ...t, label: formatKunOy(t.sana) }));
  const bosh = rows.every((r) => r.kirganlar === 0 && r.faollar === 0);
  return (
    <ChartCard
      title="Kunlik faollik — 30 kun"
      subtitle="Och chiziq — ilovani ochganlar, to'q chiziq — faol kun bo'lganlar"
      tooltip={"Ikki chiziq orasidagi bo'shliq — «ochdi, lekin ishlamadi».\nDavr 7 kun tanlansa ham grafik 30 kun ko'rsatadi: tendensiya 7 kunda ko'rinmaydi."}
      isEmpty={bosh}
      emptyMessage="Bu davrda ilova faolligi yo'q"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={4} tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
          <Tooltip
            labelFormatter={(_, payload) => {
              const kun = payload?.[0]?.payload as MarkazTrendKuni | undefined;
              return kun ? formatKunYorligi(kun.sana) : "";
            }}
            formatter={(value, name) => [String(value), name === "kirganlar" ? "Kirgan" : "Faol kun"]}
          />
          <Line type="monotone" dataKey="kirganlar" stroke={KIRGAN} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="faollar" stroke={FAOL} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
