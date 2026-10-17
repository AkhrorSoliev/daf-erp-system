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
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Card label="Oluvchilar" value={total} />
      <Card label="Hisobot yetadi" value={reaching} tone={GREEN} />
      <Card label="Yetmaydi" value={problem} tone={problem > 0 ? RED : undefined} />
      <Card label="Bot" value={botActive ? "ishlayapti" : "o'chiq"} tone={botActive ? GREEN : RED} />
    </div>
  );
}
