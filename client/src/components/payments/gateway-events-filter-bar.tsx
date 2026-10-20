"use client";

import { HelpCircle, Search } from "lucide-react";
import { useT } from "@/i18n/context";
import { msg } from "@/i18n/msg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  MultiSelectCombobox,
  type MultiSelectOption,
} from "@/components/ui/multi-select-combobox";

const OUTCOME_OPTIONS: MultiSelectOption[] = [
  { value: "success", label: msg("Muvaffaqiyatli") },
  { value: "pending", label: msg("So'rov kutilmoqda") },
  { value: "rejected", label: msg("Xavfsizlik xatosi") },
];

const PROVIDER_OPTIONS: MultiSelectOption[] = [
  { value: "PAYME", label: "Payme" },
  { value: "CLICK", label: "Click" },
  { value: "UZUM", label: "Uzum" },
];
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface GatewayEventsFilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  provider: string[];
  onProviderChange: (value: string[]) => void;
  outcomeFilter: string[];
  onOutcomeFilterChange: (value: string[]) => void;
  startDate: Date | undefined;
  onStartDateChange: (date: Date | undefined) => void;
  endDate: Date | undefined;
  onEndDateChange: (date: Date | undefined) => void;
  showChecks: boolean;
  onShowChecksChange: (value: boolean) => void;
  onReset: () => void;
}

export function GatewayEventsFilterBar({
  search,
  onSearchChange,
  provider,
  onProviderChange,
  outcomeFilter,
  onOutcomeFilterChange,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
  showChecks,
  onShowChecksChange,
  onReset,
}: GatewayEventsFilterBarProps) {
  const t = useT();
  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      {/* Qator 1: qidiruv + asosiy filtrlar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[240px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("O'quvchi bo'yicha qidirish (ID, ism, familiya)...")}
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <MultiSelectCombobox
          options={PROVIDER_OPTIONS}
          selected={provider}
          onChange={onProviderChange}
          placeholder={t("Barcha to'lov tizimlari")}
          searchPlaceholder={t("To'lov tizimi qidirish...")}
          className="w-[200px]"
        />

        <MultiSelectCombobox
          options={OUTCOME_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))}
          selected={outcomeFilter}
          onChange={onOutcomeFilterChange}
          placeholder={t("Barcha natijalar")}
          searchPlaceholder={t("Natija qidirish...")}
          className="w-[200px]"
        />
      </div>

      {/* Qator 2: sana oralig'i + texnik so'rovlar + tozalash */}
      <div className="flex flex-wrap items-center gap-3 pt-3 border-t">
        <div className="flex items-center gap-2">
          <DatePicker
            value={startDate}
            onChange={onStartDateChange}
            placeholder={t("Boshlanish sanasi")}
            maxDate={endDate ?? undefined}
            defaultMonth={endDate ?? undefined}
          />
          <span className="text-muted-foreground">—</span>
          <DatePicker
            value={endDate}
            onChange={onEndDateChange}
            placeholder={t("Tugash sanasi")}
            minDate={startDate ?? undefined}
            defaultMonth={startDate ?? undefined}
          />
        </div>

        <div className="flex-1" />

        <TooltipProvider delayDuration={200}>
          <div className="flex items-center gap-2">
            <Switch
              id="show-checks"
              checked={showChecks}
              onCheckedChange={onShowChecksChange}
            />
            <Label
              htmlFor="show-checks"
              className="text-sm cursor-pointer whitespace-nowrap"
            >
              {t("Texnik so'rovlarni ko'rsatish")}
            </Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={t("Texnik so'rovlar haqida ma'lumot")}
                >
                  <HelpCircle className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs">
                {t(
                  "Payme va Click tizimlari avtomatik yuborgan tekshiruv so'rovlari — pul harakatiga aloqasi yo'q. Jadvalda shovqinni kamaytirish uchun standart holatda yashirin.",
                )}
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>

        <Button variant="outline" size="sm" onClick={onReset}>
          {t("Tozalash")}
        </Button>
      </div>
    </div>
  );
}
