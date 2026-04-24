"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, subDays } from "date-fns";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { PaymentsOverview } from "./payments-overview";
import { RecentPaymentsTable } from "./recent-payments-table";
import { RecordPaymentDialog } from "./record-payment-dialog";

const presets = [
  { label: "Bugun", get: () => ({ start: new Date(), end: new Date() }) },
  { label: "Bu hafta", get: () => {
    const now = new Date();
    const day = now.getDay() || 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - day + 1);
    return { start: monday, end: now };
  }},
  { label: "Bu oy", get: () => ({ start: startOfMonth(new Date()), end: endOfMonth(new Date()) }) },
  { label: "O'tgan oy", get: () => {
    const prev = subMonths(new Date(), 1);
    return { start: startOfMonth(prev), end: endOfMonth(prev) };
  }},
  { label: "Oxirgi 3 oy", get: () => ({ start: startOfMonth(subMonths(new Date(), 2)), end: new Date() }) },
  { label: "Bu yil", get: () => ({ start: startOfYear(new Date()), end: new Date() }) },
];

export function OverviewClient() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [startDate, setStartDate] = useState<Date>(startOfMonth(new Date()));
  const [endDate, setEndDate] = useState<Date>(endOfMonth(new Date()));
  const [activePreset, setActivePreset] = useState("Bu oy");

  const startStr = format(startDate, "yyyy-MM-dd");
  const endStr = format(endDate, "yyyy-MM-dd");

  const handlePreset = (preset: typeof presets[number]) => {
    const { start, end } = preset.get();
    setStartDate(start);
    setEndDate(end);
    setActivePreset(preset.label);
  };

  const handleCustomDate = (type: "start" | "end", date: Date | undefined) => {
    if (!date) return;
    if (type === "start") setStartDate(date);
    else setEndDate(date);
    setActivePreset("");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-heading text-lg font-semibold tracking-tight">
            Umumiy ma&apos;lumotlar
          </h2>
          <p className="text-sm text-muted-foreground">
            Moliyaviy umumiy ko&apos;rsatkichlar va statistika
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="size-4 mr-2" />
          To&apos;lov qayd qilish
        </Button>
      </div>

      {/* Davr tanlash */}
      <div className="space-y-3">
        {/* Tezkor davrlar */}
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <Button
              key={p.label}
              variant={activePreset === p.label ? "default" : "outline"}
              size="sm"
              className="text-xs h-7"
              onClick={() => handlePreset(p)}
            >
              {p.label}
            </Button>
          ))}
        </div>

        {/* Aniq sana tanlash */}
        <div className="flex items-center gap-2">
          <DatePicker
            value={startDate}
            onChange={(d) => handleCustomDate("start", d)}
            placeholder="Boshlanish"
            className="w-40"
            maxDate={endDate ?? undefined}
            defaultMonth={endDate ?? undefined}
          />
          <span className="text-sm text-muted-foreground">—</span>
          <DatePicker
            value={endDate}
            onChange={(d) => handleCustomDate("end", d)}
            placeholder="Tugash"
            className="w-40"
            minDate={startDate ?? undefined}
            defaultMonth={startDate ?? undefined}
          />
        </div>
      </div>

      <PaymentsOverview startDate={startStr} endDate={endStr} refreshKey={refreshKey} />

      <div>
        <h3 className="font-heading text-base font-semibold mb-3">
          Oxirgi to&apos;lovlar
        </h3>
        <RecentPaymentsTable refreshKey={refreshKey} startDate={startStr} endDate={endStr} />
      </div>

      <RecordPaymentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={() => {
          setRefreshKey((k) => k + 1);
          queryClient.invalidateQueries({ queryKey: ["financial-overview"] });
        }}
      />
    </div>
  );
}
