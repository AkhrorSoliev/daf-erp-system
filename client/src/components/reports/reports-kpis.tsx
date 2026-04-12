"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  GraduationCap,
  Layers,
  Minus,
  Target,
  TrendingUp,
  UserMinus,
  UserPlus,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";

interface Props {
  branchId: number;
  startDate: string;
  endDate: string;
}

interface KpisData {
  activeStudents: { current: number; trend: number };
  activeGroups: number;
  averageAttendance: number;
  leadConversionRate: number;
  newStudentsThisMonth: number;
  churnedThisMonth: number;
}

export function ReportsKpis({ branchId, startDate, endDate }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["reports", "kpis", branchId, startDate, endDate],
    queryFn: () =>
      api
        .get<KpisData>("/reports/kpis", {
          params: { branchId, startDate, endDate },
        })
        .then((r) => r.data),
    enabled: branchId > 0,
  });

  if (isLoading) {
    return (
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  const attendanceColor =
    data.averageAttendance >= 80
      ? "text-green-600 dark:text-green-400"
      : data.averageAttendance >= 60
        ? "text-amber-600 dark:text-amber-400"
        : "text-red-600 dark:text-red-400";

  const cards = [
    {
      label: "Faol o'quvchilar",
      value: data.activeStudents.current,
      icon: GraduationCap,
      tooltip: "Hozirgi faol o'quvchilar soni",
      extra: (
        <span
          className={`flex items-center text-xs ${data.activeStudents.trend > 0 ? "text-green-600" : data.activeStudents.trend < 0 ? "text-red-600" : "text-muted-foreground"}`}
        >
          {data.activeStudents.trend > 0 ? (
            <ArrowUp className="size-3" />
          ) : data.activeStudents.trend < 0 ? (
            <ArrowDown className="size-3" />
          ) : (
            <Minus className="size-3" />
          )}
          {Math.abs(data.activeStudents.trend)}%
        </span>
      ),
    },
    {
      label: "Faol guruhlar",
      value: data.activeGroups,
      icon: Layers,
      tooltip: "Hozirgi faol guruhlar soni",
    },
    {
      label: "O'rtacha davomat",
      value: `${data.averageAttendance}%`,
      icon: Target,
      tooltip: "Joriy oy uchun o'rtacha davomat foizi",
      valueClass: attendanceColor,
    },
    {
      label: "Konversiya",
      value: `${data.leadConversionRate}%`,
      icon: TrendingUp,
      tooltip: "Lead dan o'quvchiga konversiya foizi",
    },
    {
      label: "Yangi o'quvchilar",
      value: data.newStudentsThisMonth,
      icon: UserPlus,
      tooltip: "Joriy oyda qo'shilgan yangi o'quvchilar",
      valueClass: "text-green-600 dark:text-green-400",
    },
    {
      label: "Ketganlar",
      value: data.churnedThisMonth,
      icon: UserMinus,
      tooltip: "Joriy oyda ketgan o'quvchilar (chetlatilgan + tushirilgan)",
      valueClass:
        data.churnedThisMonth > 0
          ? "text-red-600 dark:text-red-400"
          : undefined,
    },
  ];

  return (
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map((card) => (
        <Tooltip key={card.label}>
          <TooltipTrigger asChild>
            <div className="bg-card flex items-center gap-2 rounded-lg border px-3 py-2.5">
              <card.icon className="text-muted-foreground size-4 shrink-0" />
              <div className="min-w-0">
                <p className="text-muted-foreground text-xs truncate">
                  {card.label}
                </p>
                <div className="flex items-center gap-1">
                  <p
                    className={`text-base font-semibold ${card.valueClass ?? ""}`}
                  >
                    {card.value}
                  </p>
                  {card.extra}
                </div>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent>{card.tooltip}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
