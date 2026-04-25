"use client";

import { useMemo, useState } from "react";
import { ChevronsUpDown, Search, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { AvailableTeacher } from "@/hooks/use-schedule-availability";

interface GroupTeacherSelectProps {
  value: number | undefined;
  onChange: (id: number | undefined) => void;
  teachers: AvailableTeacher[];
}

export function GroupTeacherSelect({
  value,
  onChange,
  teachers,
}: GroupTeacherSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectedTeacher = useMemo(
    () => teachers.find((t) => t.id === value),
    [teachers, value],
  );

  const filteredTeachers = useMemo(
    () =>
      search.trim()
        ? teachers.filter((t) =>
            `${t.firstName} ${t.lastName}`
              .toLowerCase()
              .includes(search.toLowerCase()),
          )
        : teachers,
    [teachers, search],
  );

  if (teachers.length === 0) {
    return (
      <p className="text-muted-foreground rounded-md border border-dashed px-3 py-2 text-sm">
        Hozircha o&apos;qituvchi yo&apos;q
      </p>
    );
  }

  return (
    <Popover
      modal
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setSearch("");
      }}
    >
      <div className="flex items-center gap-1.5">
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            type="button"
            className="min-w-0 flex-1 justify-between font-normal"
          >
            {selectedTeacher ? (
              <span className="flex items-center gap-2">
                <Avatar size="sm">
                  {selectedTeacher.photo && (
                    <AvatarImage
                      src={selectedTeacher.photo}
                      alt={`${selectedTeacher.firstName} ${selectedTeacher.lastName}`}
                    />
                  )}
                  <AvatarFallback>
                    {`${selectedTeacher.firstName[0] ?? ""}${selectedTeacher.lastName[0] ?? ""}`.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                {selectedTeacher.firstName} {selectedTeacher.lastName}
              </span>
            ) : (
              "O'qituvchini tanlang"
            )}
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        {selectedTeacher && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 shrink-0"
            onClick={() => onChange(undefined)}
          >
            <X className="size-4" />
          </Button>
        )}
      </div>
      <PopoverContent className="w-72 gap-0 p-0" align="start">
        <div className="border-b p-2">
          <div className="relative">
            <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
            <Input
              placeholder="Qidirish..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>
        <div className="max-h-52 space-y-1 overflow-y-auto overscroll-contain p-2">
          {filteredTeachers.map((t) => {
            const isSelected = value === t.id;
            const fullName = `${t.firstName} ${t.lastName}`;
            const initials =
              `${t.firstName[0] ?? ""}${t.lastName[0] ?? ""}`.toUpperCase();
            return (
              <button
                key={t.id}
                type="button"
                disabled={!t.available}
                onClick={() => {
                  if (!t.available) return;
                  onChange(isSelected ? undefined : t.id);
                  setOpen(false);
                  setSearch("");
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                  !t.available && "opacity-50 cursor-not-allowed",
                  t.available && "hover:bg-accent",
                  isSelected && "bg-accent",
                )}
              >
                <Avatar size="sm">
                  {t.photo && <AvatarImage src={t.photo} alt={fullName} />}
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <span className="truncate flex-1 text-left">{fullName}</span>
                {!t.available && t.busyGroup && (
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {t.busyGroup}
                  </span>
                )}
              </button>
            );
          })}
          {filteredTeachers.length === 0 && (
            <p className="text-muted-foreground px-2 py-1.5 text-sm">
              O&apos;qituvchilar topilmadi
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
