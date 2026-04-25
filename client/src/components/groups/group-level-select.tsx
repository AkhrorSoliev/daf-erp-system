"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

interface GroupLevelSelectProps {
  value: string;
  onChange: (level: string) => void;
  error?: string;
}

export function GroupLevelSelect({
  value,
  onChange,
  error,
}: GroupLevelSelectProps) {
  return (
    <div className="space-y-2">
      <Label>Daraja</Label>
      <Select value={value || ""} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Darajani tanlang" />
        </SelectTrigger>
        <SelectContent
          position="popper"
          className="w-(--radix-select-trigger-width)"
        >
          {LEVELS.map((level) => (
            <SelectItem key={level} value={level}>
              {level}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}
