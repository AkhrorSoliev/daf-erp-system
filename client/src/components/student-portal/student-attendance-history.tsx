"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, X, AlarmClock, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

interface AttendanceRecord {
  date: string;
  status: "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
  note: string | null;
}

interface GroupAttendance {
  groupId: string;
  groupName: string;
  courseName: string | null;
  lessonTime: string | null;
  stats: {
    total: number;
    present: number;
    absent: number;
    late: number;
    excused: number;
    percentage: number;
  };
  records: AttendanceRecord[];
}

const STATUS_MAP = {
  PRESENT: { label: "Keldi", icon: Check, color: "text-green-600 dark:text-green-400", bg: "bg-green-100 dark:bg-green-900/30" },
  ABSENT: { label: "Kelmadi", icon: X, color: "text-red-600 dark:text-red-400", bg: "bg-red-100 dark:bg-red-900/30" },
  LATE: { label: "Kechikdi", icon: AlarmClock, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-900/30" },
  EXCUSED: { label: "Sababli", icon: ShieldCheck, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-900/30" },
} as const;

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-");
  return `${d}.${m}.${y}`;
}

const DAY_NAMES: Record<number, string> = {
  0: "Yak", 1: "Du", 2: "Se", 3: "Cho", 4: "Pay", 5: "Ju", 6: "Sha",
};

export function StudentAttendanceHistory() {
  const router = useRouter();

  const { data, isLoading } = useQuery<GroupAttendance[]>({
    queryKey: ["student-portal", "attendance-history"],
    queryFn: () => api.get("/student-portal/attendance/history").then((r) => r.data),
  });

  return (
    <div className="space-y-4 p-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" onClick={() => router.push("/portal")}>
          <ArrowLeft className="size-5" />
        </Button>
        <h1 className="text-base font-semibold">Davomat tarixi</h1>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="space-y-2 rounded-lg border p-4">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-24" />
              <div className="space-y-1.5 pt-2">
                {[1, 2, 3].map((j) => (
                  <Skeleton key={j} className="h-10 w-full" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-lg border">
          <p className="text-sm text-muted-foreground">Davomat ma&apos;lumotlari topilmadi</p>
        </div>
      ) : (
        <div className="space-y-4">
          {data.map((group) => (
            <div key={group.groupId} className="rounded-lg border bg-card">
              {/* Guruh sarlavhasi */}
              <div className="border-b px-4 py-3">
                <h2 className="text-sm font-semibold">{group.groupName}</h2>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {group.courseName && <span>{group.courseName}</span>}
                  {group.lessonTime && <span>{group.lessonTime}</span>}
                </div>
              </div>

              {/* Statistika */}
              <div className="grid grid-cols-4 gap-1 border-b px-4 py-2.5">
                <div className="text-center">
                  <p className="text-lg font-bold text-green-600 dark:text-green-400">{group.stats.present}</p>
                  <p className="text-[10px] text-muted-foreground">Keldi</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-red-600 dark:text-red-400">{group.stats.absent}</p>
                  <p className="text-[10px] text-muted-foreground">Kelmadi</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{group.stats.late}</p>
                  <p className="text-[10px] text-muted-foreground">Kechikdi</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-primary">{group.stats.percentage}%</p>
                  <p className="text-[10px] text-muted-foreground">Davomat</p>
                </div>
              </div>

              {/* Davomat jadvali */}
              {group.records.length === 0 ? (
                <div className="flex h-16 items-center justify-center">
                  <p className="text-xs text-muted-foreground">Hali davomat yozilmagan</p>
                </div>
              ) : (
                <div className="divide-y">
                  {group.records.map((record, i) => {
                    const cfg = STATUS_MAP[record.status];
                    const Icon = cfg.icon;
                    const dateObj = new Date(record.date);
                    const dayName = DAY_NAMES[dateObj.getDay()];

                    return (
                      <div
                        key={record.date}
                        className="flex items-center gap-3 px-4 py-2.5"
                      >
                        <span className="w-5 text-center text-xs text-muted-foreground">
                          {group.records.length - i}
                        </span>
                        <div className="flex-1">
                          <span className="text-sm">{formatDate(record.date)}</span>
                          <span className="ml-1.5 text-xs text-muted-foreground">{dayName}</span>
                        </div>
                        <div className={cn("flex items-center gap-1.5 rounded-full px-2.5 py-1", cfg.bg)}>
                          <Icon className={cn("size-3.5", cfg.color)} />
                          <span className={cn("text-xs font-medium", cfg.color)}>{cfg.label}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
