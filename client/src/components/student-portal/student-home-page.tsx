"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { StudentProfileHero } from "./student-profile-hero";
import { StudentQuickStats } from "./student-quick-stats";
import { StudentGroupsList } from "./student-groups-list";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const WEEKDAY_ORDER: Record<string, number> = {
  MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4,
  FRIDAY: 5, SATURDAY: 6, SUNDAY: 0,
};

const WEEKDAY_SHORT: Record<string, string> = {
  MONDAY: "Du", TUESDAY: "Se", WEDNESDAY: "Chor", THURSDAY: "Pay",
  FRIDAY: "Ju", SATURDAY: "Sha", SUNDAY: "Ya",
};

function getNextClass(
  groups: Array<{ exactDays: string[]; lessonStartTime: string | null; name: string }>
): string | null {
  if (!groups.length) return null;
  const now = new Date();
  const todayIndex = now.getDay();
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  let bestDay: string | null = null;
  let bestDiff = Infinity;
  for (const group of groups) {
    for (const day of group.exactDays) {
      const dayIndex = WEEKDAY_ORDER[day] ?? 0;
      let diff = dayIndex - todayIndex;
      if (diff < 0) diff += 7;
      if (diff === 0 && group.lessonStartTime && group.lessonStartTime <= currentTime) diff = 7;
      if (diff < bestDiff) {
        bestDiff = diff;
        bestDay = `${WEEKDAY_SHORT[day]}${group.lessonStartTime ? ` ${group.lessonStartTime}` : ""}`;
      }
    }
  }
  return bestDay;
}

export function StudentHomePage() {
  const { data: profile, isLoading, isError, refetch } = useQuery({
    queryKey: ["student-portal", "profile"],
    queryFn: () => api.get("/student-portal/profile").then((r) => r.data),
  });

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
        <Skeleton className="h-48 rounded-lg" />
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-5 w-24" />
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
    );
  }

  if (isError || !profile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-4 text-center">
        <AlertCircle className="size-8 text-muted-foreground mb-3" />
        <p className="text-sm font-medium">Ma'lumotlarni yuklashda xatolik</p>
        <p className="text-xs text-muted-foreground mt-1">
          Admin bilan bog'laning yoki sahifani yangilang
        </p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()}>
          Qayta yuklash
        </Button>
      </div>
    );
  }

  const nextClass = getNextClass(profile.groups ?? []);

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
      <StudentProfileHero
        student={{
          id: profile.id,
          firstName: profile.firstName,
          lastName: profile.lastName,
          phone: profile.phone,
          photo: profile.photo,
          balance: profile.balance,
          status: profile.status,
          dateOfBirth: profile.date_of_birth,
          address: profile.address,
          branches: profile.branches ?? [],
        }}
      />
      <StudentQuickStats nextClass={nextClass} />
      <StudentGroupsList groups={profile.groups ?? []} />
    </div>
  );
}
