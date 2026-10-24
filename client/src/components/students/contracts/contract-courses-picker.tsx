"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { formatPrice } from "@/lib/format-utils";
import { useT } from "@/i18n/context";
import { LINK_STATE_LABEL } from "./contract-rules";
import type { PrefillCourse } from "./contract-types";

interface Props {
  courses: PrefillCourse[];
  value: string[];
  onChange: (ids: string[]) => void;
}

export function ContractCoursesPicker({ courses, value, onChange }: Props) {
  const t = useT();
  if (courses.length === 0) {
    return (
      <p className="rounded-md border px-4 py-3 text-sm text-muted-foreground">
        {t("O'quvchining faol oylik kursi yo'q — shartnoma tuzib bo'lmaydi.")}
      </p>
    );
  }
  const toggle = (id: string, on: boolean) =>
    onChange(on ? [...value, id] : value.filter((x) => x !== id));
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">{t("Kurslar")}</h3>
      <p className="text-xs text-muted-foreground">
        {t(
          "Bitta kurs belgilansa — shu kurs uchun alohida shartnoma. Bir nechtasi belgilansa — hammasi bitta shartnomada.",
        )}
      </p>
      <ul className="divide-y rounded-md border">
        {courses.map((c) => {
          const taken = c.contractNumber !== null;
          const id = `contract-course-${c.enrollmentId}`;
          const stateLabel = LINK_STATE_LABEL[c.status];
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
                  · {t("{price} so'm/oy", { price: formatPrice(c.monthlyPrice) })} · {t(stateLabel)}
                </span>
              </label>
              {taken && (
                <span className="text-xs text-muted-foreground">
                  {t("№ {number} da bor", { number: c.contractNumber ?? "" })}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
