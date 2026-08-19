"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

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
}

export function GroupCourseSelect({
  value,
  onChange,
  courses,
  error,
}: GroupCourseSelectProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor="courseId">Kurs</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id="courseId" className="w-full">
          <SelectValue placeholder="Kursni tanlang" />
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
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}
