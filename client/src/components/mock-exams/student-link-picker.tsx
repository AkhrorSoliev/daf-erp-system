"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronsUpDown, Loader2, Search, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { StatusBadge } from "@/components/ui/status-badge";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import api from "@/lib/api";
import { formatPhone } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { normalizeStudentSearch, type LinkableStudent } from "./student-link";

const MIN_QUERY_LENGTH = 2;
const RESULT_LIMIT = 8;

interface StudentLinkPickerProps {
  value: LinkableStudent | null;
  onChange: (student: LinkableStudent | null) => void;
  disabled?: boolean;
}

function initialsOf(s: LinkableStudent): string {
  return `${s.firstName[0] ?? ""}${s.lastName[0] ?? ""}`.toUpperCase();
}

function StudentAvatar({ student }: { student: LinkableStudent }) {
  return (
    <Avatar size="sm">
      {student.photo && (
        <AvatarImage
          src={student.photo}
          alt={`${student.firstName} ${student.lastName}`}
        />
      )}
      <AvatarFallback>{initialsOf(student)}</AvatarFallback>
    </Avatar>
  );
}

/**
 * Markaz o'quvchisini ism, telefon yoki ID bo'yicha qidirib tanlash. Ro'yxat
 * serverdan keladi (o'quvchilar ko'p), shuning uchun qidiruv doim ko'rinadi.
 */
export function StudentLinkPicker({
  value,
  onChange,
  disabled,
}: StudentLinkPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const query = normalizeStudentSearch(useDebouncedValue(search, 300));
  const enabled = open && query.length >= MIN_QUERY_LENGTH;

  const {
    data: students = [],
    isFetching,
    isError,
  } = useQuery({
    queryKey: ["mock-participant-student-search", query],
    queryFn: () =>
      api
        .get<{ data: LinkableStudent[] }>("/students", {
          params: { search: query, pageSize: RESULT_LIMIT },
        })
        .then((r) => r.data.data),
    enabled,
    staleTime: 30_000,
  });

  function close() {
    setOpen(false);
    setSearch("");
  }

  return (
    <Popover
      modal
      open={open}
      onOpenChange={(o) => (o ? setOpen(true) : close())}
    >
      <div className="flex items-center gap-1.5">
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            type="button"
            disabled={disabled}
            className="min-w-0 flex-1 justify-between font-normal"
          >
            {value ? (
              <span className="flex min-w-0 items-center gap-2">
                <StudentAvatar student={value} />
                <span className="truncate">
                  {value.firstName} {value.lastName}
                </span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                  #{value.id}
                </span>
              </span>
            ) : (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Search className="size-4" />
                O&apos;quvchini qidirish...
              </span>
            )}
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 shrink-0"
            disabled={disabled}
            onClick={() => onChange(null)}
            aria-label="O'quvchi bog'lanishini olib tashlash"
          >
            <X className="size-4" />
          </Button>
        )}
      </div>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] min-w-72 gap-0 p-0"
        align="start"
      >
        <div className="border-b p-2">
          <div className="relative">
            <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Ism, telefon yoki ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>
        <div className="max-h-60 space-y-1 overflow-y-auto overscroll-contain p-2">
          {query.length < MIN_QUERY_LENGTH ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">
              Kamida {MIN_QUERY_LENGTH} ta belgi yozing
            </p>
          ) : isFetching && students.length === 0 ? (
            <p className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Qidirilmoqda...
            </p>
          ) : isError ? (
            <p className="px-2 py-1.5 text-sm text-destructive">
              Qidirishda xatolik. Qayta urinib ko&apos;ring.
            </p>
          ) : students.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">
              O&apos;quvchi topilmadi
            </p>
          ) : (
            students.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  onChange(s);
                  close();
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
                  value?.id === s.id && "bg-accent",
                )}
              >
                <StudentAvatar student={s} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    {s.firstName} {s.lastName}
                  </span>
                  <span className="block font-mono text-xs text-muted-foreground tabular-nums">
                    #{s.id} · {formatPhone(s.phone)}
                  </span>
                </span>
                {s.status !== "ACTIVE" && (
                  <StatusBadge
                    entityType="students"
                    status={s.status}
                    className="shrink-0"
                  />
                )}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
