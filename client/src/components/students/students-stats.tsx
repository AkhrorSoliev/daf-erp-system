import { TrendingDown, UserCheck, UserX, Users } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";

export interface StudentsStatsData {
  total: number;
  active: number;
  frozen: number;
  debtors: number;
}

const allStats = [
  {
    key: "total" as const,
    label: "Jami",
    icon: Users,
    tooltip: "Barcha o'quvchilar soni",
  },
  {
    key: "active" as const,
    label: "Faol",
    icon: UserCheck,
    tooltip: "Faol o'quvchilar",
  },
  {
    key: "frozen" as const,
    label: "Muzlatilgan",
    icon: UserX,
    tooltip: "Muzlatilgan o'quvchilar",
  },
  {
    key: "debtors" as const,
    label: "Qarzdorlar",
    icon: TrendingDown,
    tooltip: "Balansi manfiy bo'lgan o'quvchilar",
  },
];

interface StudentsStatsProps {
  stats: StudentsStatsData;
  loading?: boolean;
  isTeacher?: boolean;
}

export function StudentsStats({ stats, loading, isTeacher }: StudentsStatsProps) {
  const items = isTeacher
    ? allStats.filter((s) => ["total", "active", "frozen"].includes(s.key))
    : allStats;

  return (
    <div className={`grid gap-2 sm:gap-3 ${isTeacher ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4"}`}>
      {items.map(({ key, label, icon: Icon, tooltip }) => (
        <Tooltip key={key}>
          <TooltipTrigger asChild>
            <div className="bg-card flex items-center gap-2 sm:gap-3 rounded-lg border px-2.5 py-2 sm:p-3">
              <Icon className="text-muted-foreground size-4 shrink-0" />
              <div className="min-w-0">
                <p className="text-muted-foreground text-xs truncate">{label}</p>
                {loading ? (
                  <Skeleton className="mt-0.5 sm:mt-1 h-5 sm:h-6 w-8 sm:w-10" />
                ) : (
                  <p className="text-base sm:text-lg font-semibold">
                    {stats[key]}
                  </p>
                )}
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
