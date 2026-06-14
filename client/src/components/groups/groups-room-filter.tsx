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

interface RoomOption {
  id: number;
  name: string;
}

interface GroupsRoomFilterProps {
  value: string;
  rooms: RoomOption[];
  onChange: (value: string) => void;
  /** Har bir xonadagi guruhlar soni (filial bo'yicha). */
  counts?: Record<string, number>;
}

export function GroupsRoomFilter({
  value,
  rooms,
  onChange,
  counts,
}: GroupsRoomFilterProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = useMemo(
    () => rooms.find((r) => String(r.id) === value),
    [rooms, value],
  );

  const filtered = useMemo(
    () =>
      search.trim()
        ? rooms.filter((r) =>
            r.name.toLowerCase().includes(search.toLowerCase()),
          )
        : rooms,
    [rooms, search],
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
          className="h-9 w-[calc(100%-3rem)] min-w-0 justify-between font-normal sm:w-44"
        >
          <span className={cn(!selected && "text-muted-foreground")}>
            {selected ? selected.name : "Barcha xonalar"}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 gap-0 p-0" align="start">
        <div className="border-b p-2">
          <div className="relative">
            <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
            <Input
              placeholder="Xona qidirish..."
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
            <span className="truncate flex-1 text-left">Barcha xonalar</span>
          </button>
          {filtered.map((room) => {
            const isSelected = value === String(room.id);
            return (
              <button
                key={room.id}
                type="button"
                onClick={() => {
                  onChange(isSelected ? "all" : String(room.id));
                  setOpen(false);
                  setSearch("");
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent",
                  isSelected && "bg-accent",
                )}
              >
                <span className="truncate flex-1 text-left">{room.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {counts?.[String(room.id)] ?? 0} guruh
                </span>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-muted-foreground px-2 py-1.5 text-sm">
              Xonalar topilmadi
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
