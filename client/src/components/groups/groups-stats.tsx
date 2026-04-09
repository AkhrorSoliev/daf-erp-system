import { CheckCircle, CircleDot, CircleCheck, Layers, PauseCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";

export interface GroupsStatsData {
  total: number;
  active: number;
  forming: number;
  paused: number;
  completed: number;
}

const statItems = [
  {
    key: "total" as const,
    label: "Jami",
    icon: Layers,
    tooltip: "Barcha guruhlar soni",
  },
  {
    key: "active" as const,
    label: "Faol",
    icon: CheckCircle,
    tooltip: "Faol guruhlar",
  },
  {
    key: "forming" as const,
    label: "Boshlanmagan",
    icon: CircleDot,
    tooltip: "Shakllanayotgan guruhlar",
  },
  {
    key: "paused" as const,
    label: "Pauza",
    icon: PauseCircle,
    tooltip: "To'xtatilgan guruhlar",
  },
  {
    key: "completed" as const,
    label: "Tugallangan",
    icon: CircleCheck,
    tooltip: "Tugallangan guruhlar",
  },
];

interface GroupsStatsProps {
  stats: GroupsStatsData;
  loading?: boolean;
}

export function GroupsStats({ stats, loading }: GroupsStatsProps) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 sm:gap-3">
      {statItems.map(({ key, label, icon: Icon, tooltip }) => (
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
