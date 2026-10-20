import { useT } from "@/i18n/context";
import { cn } from "@/lib/utils";

interface Props {
  total: number;
  reaching: number;
  problem: number;
  botActive: boolean;
}

function Card({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-xl border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", tone)}>{value}</p>
    </div>
  );
}

const GREEN = "text-emerald-700 dark:text-emerald-300";
const RED = "text-red-700 dark:text-red-300";

export function SummaryCards({ total, reaching, problem, botActive }: Props) {
  const t = useT();
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Card label={t("Oluvchilar")} value={total} />
      <Card label={t("Hisobot yetadi")} value={reaching} tone={GREEN} />
      <Card label={t("Hisobot yetmaydi")} value={problem} tone={problem > 0 ? RED : undefined} />
      <Card label={t("Bot")} value={botActive ? t("ishlayapti") : t("o'chiq")} tone={botActive ? GREEN : RED} />
    </div>
  );
}
