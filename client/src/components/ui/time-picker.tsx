"use client";

import * as React from "react";
import { ClockIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface TimePickerProps {
  value?: string;
  onChange?: (time: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  minTime?: string;
  maxTime?: string;
}

function generateHours() {
  const hours: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      hours.push(
        `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
      );
    }
  }
  return hours;
}

const timeOptions = generateHours();

export function TimePicker({
  value,
  onChange,
  placeholder = "Vaqtni tanlang",
  disabled,
  className,
  id,
  minTime,
  maxTime,
}: TimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selectedRef = React.useRef<HTMLButtonElement>(null);

  const filteredOptions = React.useMemo(() => {
    if (!minTime && !maxTime) return timeOptions;
    return timeOptions.filter((time) => {
      if (minTime && time < minTime) return false;
      if (maxTime && time > maxTime) return false;
      return true;
    });
  }, [minTime, maxTime]);

  React.useEffect(() => {
    if (open && selectedRef.current) {
      selectedRef.current.scrollIntoView({ block: "center" });
    }
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          disabled={disabled}
          data-empty={!value}
          className={cn(
            "w-full justify-start text-left font-normal data-[empty=true]:text-muted-foreground",
            className,
          )}
        >
          <ClockIcon className="mr-2 size-4" />
          {value || <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="h-64 overflow-y-auto p-1">
          {filteredOptions.map((time) => (
            <button
              key={time}
              ref={time === value ? selectedRef : undefined}
              type="button"
              onClick={() => {
                onChange?.(time);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-accent",
                time === value && "bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              {time}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
