import { TrendingDown, UserCheck, UserX, Users } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import type { Student } from "@/data/student-model";

const stats = [
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
}

export function StudentsStats({ students, loading }: StudentsStatsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map(({ key, label, icon: Icon, tooltip }) => (
        <Tooltip key={key}>
          <TooltipTrigger asChild>
            <div className="bg-card flex items-center gap-3 rounded-lg border p-3">
              <Icon className="text-muted-foreground size-4" />
              <div>
                <p className="text-muted-foreground text-xs">{label}</p>
                {loading ? (
                  <Skeleton className="mt-1 h-6 w-10" />
                ) : (
                  <p className="text-lg font-semibold">
                    {stats.find((s) => s.key === key)!.compute(students)}
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
