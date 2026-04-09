import { TrendingDown, UserCheck, UserX, Users } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface StudentsStatsData {
  total: number;
  active: number;
  frozen: number;
  debtors: number;
}

const allStats = [
  {
    key: "total" as const,
    statusValue: "all",
    label: "Jami",
    icon: Users,
    tooltip: "Barcha o'quvchilar soni",
  },
  {
    key: "active" as const,
    statusValue: "active",
    label: "Faol",
    icon: UserCheck,
    tooltip: "Faol o'quvchilar",
  },
  {
    key: "frozen" as const,
    statusValue: "frozen",
    label: "Muzlatilgan",
    icon: UserX,
    tooltip: "Muzlatilgan o'quvchilar",
  },
  {
    key: "debtors" as const,
    statusValue: "debtors",
    label: "Qarzdorlar",
    icon: TrendingDown,
    tooltip: "Balansi manfiy bo'lgan o'quvchilar",
  },
];

interface StudentsStatsProps {
  stats: StudentsStatsData;
  loading?: boolean;
  isTeacher?: boolean;
  activeStatus?: string;
  onStatusClick?: (status: string) => void;
}

export function StudentsStats({ stats, loading, isTeacher, activeStatus, onStatusClick }: StudentsStatsProps) {
  const items = isTeacher
    ? allStats.filter((s) => ["total", "active", "frozen"].includes(s.key))
    : allStats;

  return (
    <div className={`grid gap-2 sm:gap-3 ${isTeacher ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4"}`}>
      {items.map(({ key, statusValue, label, icon: Icon, tooltip }) => {
        const isActive = activeStatus === statusValue || (activeStatus === "all" && statusValue === "all");
        return (
          <Tooltip key={key}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onStatusClick?.(statusValue)}
                className={cn(
                  "bg-card flex items-center gap-2 sm:gap-3 rounded-lg border px-2.5 py-2 sm:p-3 text-left transition-colors",
                  onStatusClick && "cursor-pointer hover:bg-accent",
                  isActive && "ring-2 ring-primary border-primary",
                )}
              >
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
              </button>
            </TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
