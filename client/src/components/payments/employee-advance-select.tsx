"use client";

import { useMemo, useState } from "react";
import { ChevronsUpDown, Loader2, Search } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface EmployeeOption {
  id: number;
  firstName: string;
  lastName: string;
  photo: string | null;
  roles: { id: number; name: string }[];
}

const roleLabels: Record<number, string> = {
  1: "Direktor",
  2: "Filial direktori",
  3: "Administrator",
  4: "O'qituvchi",
  5: "Kassir",
};

export function employeeRoleLabel(
  roles: { id: number; name: string }[],
): string {
  if (!roles?.length) return "";
  // Prefer the teaching role when present — the category is "Ustozga avans".
  const teacher = roles.find((r) => r.id === 4);
  const primary = teacher ?? roles[0];
  return roleLabels[primary.id] ?? primary.name;
}

// Show the search box only when the list is long enough to warrant it.
// A handful of options fit without scrolling and need no filter.
const SEARCH_THRESHOLD = 7;

interface EmployeeAdvanceSelectProps {
  value: string;
  onChange: (id: string) => void;
  employees: EmployeeOption[];
  loading?: boolean;
}

export function EmployeeAdvanceSelect({
  value,
  onChange,
  employees,
  loading = false,
}: EmployeeAdvanceSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = useMemo(
    () => employees.find((e) => String(e.id) === value),
    [employees, value],
  );

  const filtered = useMemo(
    () =>
      search.trim()
        ? employees.filter((e) =>
            `${e.firstName} ${e.lastName}`
              .toLowerCase()
              .includes(search.toLowerCase()),
          )
        : employees,
    [employees, search],
  );

  if (loading) {
    return (
      <Button
        variant="outline"
        type="button"
        disabled
        className="w-full justify-start font-normal text-muted-foreground"
      >
        <Loader2 className="mr-2 size-4 animate-spin" />
        Yuklanmoqda...
      </Button>
    );
  }

  const showSearch = employees.length > SEARCH_THRESHOLD;

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
          className="w-full justify-between font-normal"
        >
          {selected ? (
            <span className="flex min-w-0 items-center gap-2">
              <Avatar size="sm">
                {selected.photo && (
                  <AvatarImage
                    src={selected.photo}
                    alt={`${selected.firstName} ${selected.lastName}`}
                  />
                )}
                <AvatarFallback>
                  {`${selected.firstName[0] ?? ""}${selected.lastName[0] ?? ""}`.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="truncate">
                {selected.firstName} {selected.lastName}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">
              Avans oluvchi xodimni tanlang
            </span>
          )}
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] gap-0 p-0"
        align="start"
      >
        {showSearch && (
          <div className="border-b p-2">
            <div className="relative">
              <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder="Ism bo'yicha qidirish..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        )}
        <div className="max-h-60 space-y-1 overflow-y-auto overscroll-contain p-2">
          {filtered.map((e) => {
            const isSelected = String(e.id) === value;
            const fullName = `${e.firstName} ${e.lastName}`;
            const initials =
              `${e.firstName[0] ?? ""}${e.lastName[0] ?? ""}`.toUpperCase();
            const role = employeeRoleLabel(e.roles);
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => {
                  onChange(isSelected ? "" : String(e.id));
                  setOpen(false);
                  setSearch("");
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent",
                  isSelected && "bg-accent",
                )}
              >
                <Avatar size="sm">
                  {e.photo && <AvatarImage src={e.photo} alt={fullName} />}
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <span className="flex-1 truncate text-left">{fullName}</span>
                {role && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {role}
                  </span>
                )}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">
              Xodim topilmadi
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
