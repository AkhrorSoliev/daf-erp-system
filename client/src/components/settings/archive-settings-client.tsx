"use client";

import { useState } from "react";
import { RotateCcw, Trash2, Archive, MoreHorizontal } from "lucide-react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { SettingsPageHeader } from "./settings-page-header";

interface ArchivedItem {
  id: string;
  name: string;
  type: "group" | "course" | "student";
  archivedAt: string;
}

const mockArchived: ArchivedItem[] = [
  { id: "1", name: "Deutsch A1 - 15-guruh", type: "group", archivedAt: "15.01.2026" },
  { id: "2", name: "Deutsch A2 - 8-guruh", type: "group", archivedAt: "20.02.2026" },
  { id: "3", name: "Ingliz tili boshlang'ich", type: "course", archivedAt: "01.03.2026" },
];

const typeLabels: Record<ArchivedItem["type"], string> = {
  group: "Guruh",
  course: "Kurs",
  student: "O'quvchi",
};

export function ArchiveSettingsClient() {
  const [search, setSearch] = useState("");

  const filtered = mockArchived.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <SettingsPageHeader
        title="Arxiv"
        description="Arxivlangan guruhlar, kurslar va o'quvchilar"
      />

      <div className="flex items-center gap-3">
        <Input
          placeholder="Nomi bo'yicha qidirish..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nomi</TableHead>
              <TableHead>Turi</TableHead>
              <TableHead>Arxivlangan sana</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <Archive className="h-8 w-8 text-muted-foreground/50" />
                    Arxivda hech narsa topilmadi
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{typeLabels[item.type]}</Badge>
                  </TableCell>
                  <TableCell>{item.archivedAt}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-xs">
                              <MoreHorizontal className="size-4" />
                              <span className="sr-only">Amallar</span>
                            </Button>
                          </DropdownMenuTrigger>
                        </TooltipTrigger>
                        <TooltipContent>Amallar</TooltipContent>
                      </Tooltip>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>
                          <RotateCcw className="mr-2 size-4" />
                          Qayta tiklash
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive">
                          <Trash2 className="mr-2 size-4" />
                          Butunlay o&apos;chirish
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
