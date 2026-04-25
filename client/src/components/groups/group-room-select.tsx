"use client";

import { useMemo, useState } from "react";
import { ChevronsUpDown, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { AvailableRoom } from "@/hooks/use-schedule-availability";

interface GroupRoomSelectProps {
  value: string;
  onChange: (id: string) => void;
  rooms: AvailableRoom[];
}

export function GroupRoomSelect({
  value,
  onChange,
  rooms,
}: GroupRoomSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectedRoom = useMemo(
    () => rooms.find((r) => r.id === value),
    [rooms, value],
  );

  const filteredRooms = useMemo(
    () =>
      search.trim()
        ? rooms.filter((r) =>
            r.name.toLowerCase().includes(search.toLowerCase()),
          )
        : rooms,
    [rooms, search],
  );

  if (rooms.length === 0) {
    return (
      <p className="text-muted-foreground rounded-md border border-dashed px-3 py-2 text-sm">
        Hozircha xona yo&apos;q
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
            {selectedRoom ? (
              <span>
                {selectedRoom.name}
                {selectedRoom.capacity ? ` (${selectedRoom.capacity})` : ""}
              </span>
            ) : (
              "Xonani tanlang"
            )}
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        {selectedRoom && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 shrink-0"
            onClick={() => onChange("")}
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
        <div className="max-h-40 space-y-1 overflow-y-auto overscroll-contain p-2">
          {filteredRooms.map((r) => {
            const isSelected = value === r.id;
            return (
              <button
                key={r.id}
                type="button"
                disabled={!r.available}
                onClick={() => {
                  if (!r.available) return;
                  onChange(isSelected ? "" : r.id);
                  setOpen(false);
                  setSearch("");
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                  !r.available && "opacity-50 cursor-not-allowed",
                  r.available && "hover:bg-accent",
                  isSelected && "bg-accent",
                )}
              >
                <span className="truncate flex-1 text-left">
                  {r.name}
                  {r.capacity ? ` (${r.capacity})` : ""}
                </span>
                {!r.available && r.busyGroup && (
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {r.busyGroup} band
                  </span>
                )}
              </button>
            );
          })}
          {filteredRooms.length === 0 && (
            <p className="text-muted-foreground px-2 py-1.5 text-sm">
              Xonalar topilmadi
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
