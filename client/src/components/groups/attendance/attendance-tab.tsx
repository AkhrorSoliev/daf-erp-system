"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { AttendanceCycleDashboard } from "./attendance-cycle-dashboard";
import { AttendanceForm } from "./attendance-form";
import type { GroupData } from "@/hooks/use-edit-group";

const STATUS_LABELS: Record<string, string> = {
  FORMING: "Shakllanmoqda",
  PAUSED: "To'xtatilgan",
  COMPLETED: "Tugallangan",
  CANCELLED: "Bekor qilingan",
  ARCHIVED: "Arxivlangan",
};

interface AttendanceTabProps {
  group: GroupData;
}

export function AttendanceTab({ group }: AttendanceTabProps) {
  const [view, setView] = useState<"cycle" | "form">("cycle");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Guruh faol bo'lmasa davomat olish mumkin emas
  if (group.statusEnum !== "ACTIVE") {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
        <Info className="size-4 shrink-0" />
        Guruh faol emas ({STATUS_LABELS[group.statusEnum] ?? group.statusEnum}). Davomat olish mumkin emas.
      </div>
    );
  }

  const handleDateSelect = (date: string) => {
    setSelectedDate(date);
    setView("form");
  };

  const handleBack = () => {
    setSelectedDate(null);
    setView("cycle");
  };

  if (view === "form" && selectedDate) {
    return (
      <AttendanceForm
        group={group}
        date={selectedDate}
        onBack={handleBack}
        onSaved={handleBack}
      />
    );
  }

  return (
    <AttendanceCycleDashboard
      group={group}
      onSelectDate={handleDateSelect}
    />
  );
}
