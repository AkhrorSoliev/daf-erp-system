"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PriceInput } from "@/components/ui/price-input";
import { INCLUDES, INCLUDE_LABEL, dateValue, dayString, type CourseDraft } from "./contract-rules";

interface Props {
  idPrefix: string;
  title: string;
  subtitle: string;
  discountPercent: number;
  value: CourseDraft;
  onChange: (next: CourseDraft) => void;
}

export function ContractCourseExtras({
  idPrefix,
  title,
  subtitle,
  discountPercent,
  value,
  onChange,
}: Props) {
  const set = <K extends keyof CourseDraft>(key: K, v: CourseDraft[K]) =>
    onChange({ ...value, [key]: v });
  const from = dateValue(value.discountFrom);
  const to = dateValue(value.discountTo);

  return (
    <section className="space-y-3 rounded-md border p-4">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-first`}>Dastlabki to&apos;lov</Label>
          <PriceInput
            id={`${idPrefix}-first`}
            value={value.firstPaymentAmount}
            onChange={(e) => set("firstPaymentAmount", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>To&apos;lov sanasi</Label>
          <DatePicker
            value={dateValue(value.firstPaymentDate)}
            onChange={(d) => set("firstPaymentDate", dayString(d))}
          />
        </div>
        {discountPercent > 0 && (
          <>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={`${idPrefix}-reason`}>Chegirma sababi ({discountPercent} %)</Label>
              <Input
                id={`${idPrefix}-reason`}
                value={value.discountReason}
                onChange={(e) => set("discountReason", e.target.value)}
                maxLength={200}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Chegirma boshlanishi</Label>
              <DatePicker
                value={from}
                onChange={(d) => set("discountFrom", dayString(d))}
                maxDate={to}
                defaultMonth={to}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Chegirma tugashi</Label>
              <DatePicker
                value={to}
                onChange={(d) => set("discountTo", dayString(d))}
                minDate={from}
                defaultMonth={from}
              />
            </div>
          </>
        )}
      </div>
      <div className="space-y-1.5">
        <Label>Kurs ichiga kiradigan narsa</Label>
        <div className="flex flex-wrap gap-4">
          {INCLUDES.map((item) => {
            const id = `${idPrefix}-${item}`;
            return (
              <label key={item} htmlFor={id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  id={id}
                  checked={value.includes.includes(item)}
                  onCheckedChange={(on) =>
                    set(
                      "includes",
                      on === true
                        ? [...value.includes, item]
                        : value.includes.filter((x) => x !== item),
                    )
                  }
                />
                {INCLUDE_LABEL[item]}
              </label>
            );
          })}
        </div>
      </div>
      {discountPercent > 0 && (
        <p className="text-xs text-muted-foreground">
          Chegirma muddati tugaganda tizim chegirmani o&apos;zi olib tashlamaydi — profildagi
          chegirmani qo&apos;lda o&apos;zgartiring.
        </p>
      )}
    </section>
  );
}
