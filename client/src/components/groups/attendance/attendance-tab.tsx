"use client";

import { useState } from "react";
import { AttendanceDateList } from "./attendance-date-list";
import { AttendanceForm } from "./attendance-form";
import { AttendanceStats } from "./attendance-stats";
import type { GroupData } from "@/hooks/use-edit-group";

interface AttendanceTabProps {
  group: GroupData;
}

export function AttendanceTab({ group }: AttendanceTabProps) {
  const [view, setView] = useState<"dates" | "form" | "stats">("dates");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const handleDateSelect = (date: string) => {
    setSelectedDate(date);
    setView("form");
  };

  const handleBack = () => {
    setSelectedDate(null);
    setView("dates");
  };

  if (view === "stats") {
    return <AttendanceStats group={group} onBack={() => setView("dates")} />;
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
    <AttendanceDateList
      group={group}
      onSelectDate={handleDateSelect}
      onShowStats={() => setView("stats")}
    />
  );
}
