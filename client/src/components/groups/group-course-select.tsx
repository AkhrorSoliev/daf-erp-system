"use client";

import type { ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useT } from "@/i18n/context";

export interface CourseOption {
  id: string;
  name: string;
  courseDuration: number | null;
}

interface GroupCourseSelectProps {
  value: string;
  onChange: (id: string) => void;
  courses: CourseOption[];
  error?: string;
  /** Rendered instead of the dropdown when the list is empty. */
  emptyState?: ReactNode;
}

export function GroupCourseSelect({
  value,
  onChange,
  courses,
  error,
  emptyState,
}: GroupCourseSelectProps) {
  const t = useT();
  return (
    <div className="space-y-2">
      <Label htmlFor="courseId">{t("Kurs")}</Label>
      {courses.length === 0 && emptyState ? (
        emptyState
      ) : (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger id="courseId" className="w-full">
            <SelectValue placeholder={t("Kursni tanlang")} />
          </SelectTrigger>
          <SelectContent
            position="popper"
            className="w-(--radix-select-trigger-width)"
          >
            {courses.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}
