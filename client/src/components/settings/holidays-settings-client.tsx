"use client";

import { useState } from "react";
import { Plus, CalendarOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SettingsPageHeader } from "./settings-page-header";
import { HolidayRowActions } from "./holiday-row-actions";
import { EditHolidayDrawer } from "./edit-holiday-drawer";
import type { Holiday } from "@/hooks/use-edit-holiday";

const mockHolidays: Holiday[] = [
  { id: "1", name: "Yangi yil", startDate: "01.01.2026", endDate: "03.01.2026" },
  { id: "2", name: "Xalqaro xotin-qizlar kuni", startDate: "08.03.2026", endDate: "08.03.2026" },
  { id: "3", name: "Navro'z bayrami", startDate: "21.03.2026", endDate: "23.03.2026" },
  { id: "4", name: "Xotira va qadrlash kuni", startDate: "09.05.2026", endDate: "09.05.2026" },
  { id: "5", name: "Mustaqillik kuni", startDate: "01.09.2026", endDate: "01.09.2026" },
];

export function HolidaysSettingsClient() {
  const [search, setSearch] = useState("");

  const filtered = mockHolidays.filter((h) =>
    h.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <SettingsPageHeader
        title="Dam olish kunlari"
        description="Rasmiy bayramlar va dam olish kunlarini boshqarish"
      />

      <div className="flex items-center gap-3">
        <Input
          placeholder="Bayram nomi bo'yicha qidirish..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:max-w-sm"
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1.5 h-4 w-4" />
              Yangi bayram
            </Button>
          </TooltipTrigger>
          <TooltipContent>Yangi dam olish kuni qo&apos;shish</TooltipContent>
        </Tooltip>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead>Bayram nomi</TableHead>
              <TableHead>Boshlanish sanasi</TableHead>
              <TableHead>Tugash sanasi</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <CalendarOff className="h-8 w-8 text-muted-foreground/50" />
                    Dam olish kunlari topilmadi
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((holiday, index) => (
                <TableRow key={holiday.id}>
                  <TableCell className="border-r text-muted-foreground">{index + 1}</TableCell>
                  <TableCell className="font-medium">{holiday.name}</TableCell>
                  <TableCell>{holiday.startDate}</TableCell>
                  <TableCell>{holiday.endDate}</TableCell>
                  <TableCell>
                    <HolidayRowActions holiday={holiday} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <EditHolidayDrawer />
    </div>
  );
}
