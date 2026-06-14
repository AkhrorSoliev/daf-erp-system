"use client";

import { useMemo, useState } from "react";
import { ChevronsUpDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface TeacherOption {
  id: number;
  firstName: string;
  lastName: string;
}

interface GroupsTeacherFilterProps {
  value: string;
  teachers: TeacherOption[];
  onChange: (value: string) => void;
  /** Har bir o'qituvchidagi guruhlar soni (filial bo'yicha). */
  counts?: Record<string, number>;
}

export function GroupsTeacherFilter({
  value,
  teachers,
  onChange,
  counts,
}: GroupsTeacherFilterProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = useMemo(
    () => teachers.find((t) => String(t.id) === value),
    [teachers, value],
  );

  const filtered = useMemo(
    () =>
      search.trim()
        ? teachers.filter((t) =>
            `${t.lastName} ${t.firstName}`
              .toLowerCase()
              .includes(search.toLowerCase()),
          )
        : teachers,
    [teachers, search],
  );

  return (
    <Popover
      modal
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          type="button"
          className="h-9 w-[calc(100%-3rem)] min-w-0 justify-between font-normal sm:w-48"
        >
          <span className={cn(!selected && "text-muted-foreground")}>
            {selected
              ? `${selected.lastName} ${selected.firstName}`
              : "Barcha o‘qituvchilar"}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 gap-0 p-0" align="start">
        <div className="border-b p-2">
          <div className="relative">
            <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
            <Input
              placeholder="O&#39;qituvchi qidirish..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>
        <div className="max-h-52 space-y-1 overflow-y-auto overscroll-contain p-2">
          <button
            type="button"
            onClick={() => {
              onChange("all");
              setOpen(false);
              setSearch("");
            }}
            className={cn(
              "flex w-full items-center rounded-md px-2 py-1.5 text-sm hover:bg-accent",
              value === "all" && "bg-accent",
            )}
          >
            <span className="truncate flex-1 text-left">
              Barcha o&apos;qituvchilar
            </span>
          </button>
          {filtered.map((teacher) => {
            const isSelected = value === String(teacher.id);
            const fullName = `${teacher.lastName} ${teacher.firstName}`;
            return (
              <button
                key={teacher.id}
                type="button"
                onClick={() => {
                  onChange(isSelected ? "all" : String(teacher.id));
                  setOpen(false);
                  setSearch("");
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent",
                  isSelected && "bg-accent",
                )}
              >
                <span className="truncate flex-1 text-left">{fullName}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {counts?.[String(teacher.id)] ?? 0} guruh
                </span>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-muted-foreground px-2 py-1.5 text-sm">
              O&apos;qituvchilar topilmadi
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
