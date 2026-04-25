"use client";

import { HelpCircle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface GatewayEventsFilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  provider: string;
  onProviderChange: (value: string) => void;
  outcomeFilter: string;
  onOutcomeFilterChange: (value: string) => void;
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
  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      {/* Qator 1: qidiruv + asosiy filtrlar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[240px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="O'quvchi bo'yicha qidirish (ID, ism, familiya)..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <Select value={provider} onValueChange={onProviderChange}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Barcha to&apos;lov tizimlari</SelectItem>
            <SelectItem value="PAYME">Payme</SelectItem>
            <SelectItem value="CLICK">Click</SelectItem>
            <SelectItem value="UZUM">Uzum</SelectItem>
          </SelectContent>
        </Select>

        <Select value={outcomeFilter} onValueChange={onOutcomeFilterChange}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Barcha natijalar</SelectItem>
            <SelectItem value="success">Muvaffaqiyatli</SelectItem>
            <SelectItem value="pending">Kutilmoqda</SelectItem>
            <SelectItem value="rejected">Xavfsizlik xatosi</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Qator 2: sana oralig'i + texnik so'rovlar + tozalash */}
      <div className="flex flex-wrap items-center gap-3 pt-3 border-t">
        <div className="flex items-center gap-2">
          <DatePicker
            value={startDate}
            onChange={onStartDateChange}
            placeholder="Boshlanish sanasi"
            maxDate={endDate ?? undefined}
            defaultMonth={endDate ?? undefined}
          />
          <span className="text-muted-foreground">—</span>
          <DatePicker
            value={endDate}
            onChange={onEndDateChange}
            placeholder="Tugash sanasi"
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
              Texnik so&apos;rovlarni ko&apos;rsatish
            </Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Texnik so'rovlar haqida ma'lumot"
                >
                  <HelpCircle className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs">
                Payme va Click tizimlari avtomatik yuborgan tekshiruv
                so&apos;rovlari — pul harakatiga aloqasi yo&apos;q. Jadvalda
                shovqinni kamaytirish uchun standart holatda yashirin.
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>

        <Button variant="outline" size="sm" onClick={onReset}>
          Tozalash
        </Button>
      </div>
    </div>
  );
}
