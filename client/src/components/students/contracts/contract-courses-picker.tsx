"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { formatPrice } from "@/lib/format-utils";
import { LINK_STATE_LABEL } from "./contract-rules";
import type { PrefillCourse } from "./contract-types";

interface Props {
  courses: PrefillCourse[];
  value: string[];
  onChange: (ids: string[]) => void;
}

export function ContractCoursesPicker({ courses, value, onChange }: Props) {
  if (courses.length === 0) {
    return (
      <p className="rounded-md border px-4 py-3 text-sm text-muted-foreground">
        O&apos;quvchining faol oylik kursi yo&apos;q — shartnoma tuzib bo&apos;lmaydi.
      </p>
    );
  }
  const toggle = (id: string, on: boolean) =>
    onChange(on ? [...value, id] : value.filter((x) => x !== id));
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">Kurslar</h3>
      <p className="text-xs text-muted-foreground">
        Bitta kurs belgilansa — shu kurs uchun alohida shartnoma. Bir nechtasi belgilansa —
        hammasi bitta shartnomada.
      </p>
      <ul className="divide-y rounded-md border">
        {courses.map((c) => {
          const taken = c.contractNumber !== null;
          const id = `contract-course-${c.enrollmentId}`;
          return (
            <li key={c.enrollmentId} className="flex items-center gap-3 px-3 py-2">
              <Checkbox
                id={id}
                checked={value.includes(c.enrollmentId)}
                disabled={taken}
                onCheckedChange={(on) => toggle(c.enrollmentId, on === true)}
              />
              <label htmlFor={id} className="flex-1 text-sm">
                <span className="font-medium">{c.courseName}</span> · {c.groupName}
                <span className="text-muted-foreground">
                  {" "}
                  · {formatPrice(c.monthlyPrice)} so&apos;m/oy · {LINK_STATE_LABEL[c.status]}
                </span>
              </label>
              {taken && (
                <span className="text-xs text-muted-foreground">№ {c.contractNumber} da bor</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
