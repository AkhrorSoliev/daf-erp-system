"use client";

import { useState } from "react";
import { AttendanceCycleDashboard } from "./attendance-cycle-dashboard";
import { AttendanceForm } from "./attendance-form";
import { AttendanceStats } from "./attendance-stats";
import type { GroupData } from "@/hooks/use-edit-group";

interface AttendanceTabProps {
  group: GroupData;
}

export function AttendanceTab({ group }: AttendanceTabProps) {
  const [view, setView] = useState<"cycle" | "form" | "stats">("cycle");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const handleDateSelect = (date: string) => {
    setSelectedDate(date);
    setView("form");
  };

  const handleBack = () => {
    setSelectedDate(null);
    setView("cycle");
  };

  if (view === "stats") {
    return <AttendanceStats group={group} onBack={() => setView("cycle")} />;
  }

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
      onShowStats={() => setView("stats")}
    />
  );
}
