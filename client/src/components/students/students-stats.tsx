import { TrendingDown, UserCheck, UserX, Users } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import type { Student } from "@/data/student-model";

const allStats = [
  {
    key: "total",
    label: "Jami",
    icon: Users,
    tooltip: "Barcha o'quvchilar soni",
    compute: (s: Student[]) => s.length,
  },
  {
    key: "active",
    label: "Faol",
    icon: UserCheck,
    tooltip: "Faol o'quvchilar",
    compute: (s: Student[]) => s.filter((x) => x.isActive && x.groups.length > 0).length,
  },
  {
    key: "frozen",
    label: "Muzlatilgan",
    icon: UserX,
    tooltip: "Muzlatilgan o'quvchilar",
    compute: (s: Student[]) => s.filter((x) => !x.isActive).length,
  },
  {
    key: "debtors",
    label: "Qarzdorlar",
    icon: TrendingDown,
    tooltip: "Balansi manfiy bo'lgan o'quvchilar",
    compute: (s: Student[]) => s.filter((x) => x.balance < 0).length,
  },
] as const;

interface StudentsStatsProps {
  students: Student[];
  loading?: boolean;
  isTeacher?: boolean;
}

export function StudentsStats({ students, loading, isTeacher }: StudentsStatsProps) {
  const stats = isTeacher
    ? allStats.filter((s) => s.key === "total")
    : allStats;

  return (
    <div className={`grid gap-2 sm:gap-3 ${isTeacher ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-4"}`}>
      {stats.map(({ key, label, icon: Icon, tooltip }) => (
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
                    {allStats.find((s) => s.key === key)!.compute(students)}
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
