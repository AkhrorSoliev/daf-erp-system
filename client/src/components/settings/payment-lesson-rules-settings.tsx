"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

/** The lesson rules of ADR-0047/0048/0064 the CEO can change without a deploy. */
export interface LessonRuleSettings {
  "payment.admissionRuleEnabled": boolean;
  "payment.trialLessonEnabled": boolean;
  "payment.attendanceOpensMinutesBefore": number;
  "payment.admissionMinPaidPercent": number;
  "payment.paidThroughReminderDays": number;
}

interface Props {
  settings: LessonRuleSettings;
  isCeo: boolean;
  canEdit: boolean;
  saving: boolean;
  saveField: (patch: Record<string, unknown>) => void;
}

const COMPANY_ONLY_NOTE =
  "Bu qiymat filial bo'yicha emas — butun kompaniya uchun bitta, shuning uchun faqat markaz rahbari o'zgartira oladi.";

interface NumberRuleProps {
  /** The PATCH field, also the input's id. */
  field: string;
  label: string;
  hint: string;
  saved: number;
  max: number;
  unit: string;
  rangeError: string;
  disabled: boolean;
  saveField: Props["saveField"];
  note: React.ReactNode;
}

/** A whole number from 0 to `max`, saved on blur; anything else is refused and put back. */
function NumberRule({
  field,
  label,
  hint,
  saved,
  max,
  unit,
  rangeError,
  disabled,
  saveField,
  note,
}: NumberRuleProps) {
  const [input, setInput] = useState(String(saved));
  // A saved value from the server resets the field (set during render, the
  // pattern React documents for state derived from a prop).
  const [shownSaved, setShownSaved] = useState(saved);
  if (shownSaved !== saved) {
    setShownSaved(saved);
    setInput(String(saved));
  }

  function handleBlur() {
    const v = Number(input);
    if (input.trim() === "" || !Number.isInteger(v) || v < 0 || v > max) {
      toast.error(rangeError);
      setInput(String(saved));
      return;
    }
    if (v === saved) return;
    saveField({ [field]: v });
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={field}>{label}</Label>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <div className="flex items-center gap-2">
        <Input
          id={field}
          type="number"
          min={0}
          max={max}
          step={1}
          className="w-full sm:max-w-xs"
          value={input}
          disabled={disabled}
          onChange={(e) => setInput(e.target.value)}
          onBlur={handleBlur}
        />
        <span className="text-sm text-muted-foreground">{unit}</span>
      </div>
      {note}
    </div>
  );
}

/**
 * «Darsga qo'yish» with its least share and reminder, «Sinov darsi» and the
 * attendance window lead. All are company-level on the server, so only the
 * CEO may change them — a branch director sees them and is told why they are
 * locked.
 */
export function PaymentLessonRulesSettings({
  settings,
  isCeo,
  canEdit,
  saving,
  saveField,
}: Props) {
  const lockedNote = !isCeo && canEdit && (
    <p className="text-xs text-muted-foreground">{COMPANY_ONLY_NOTE}</p>
  );
  const numberRule = { disabled: !isCeo || saving, saveField, note: lockedNote };

  return (
    <>
      <Separator />

      {/* Shartnoma 3.2 — to'lamagan o'quvchini 2-darsdan qo'ymaslik (ADR-0047) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between rounded-lg border px-4 py-3">
          <div className="pr-4">
            <p className="text-sm font-medium">
              To&apos;lamagan o&apos;quvchi 2-darsdan darsga qo&apos;yilmasin
            </p>
            <p className="text-xs text-muted-foreground">
              Yoqilgan bo&apos;lsa (standart holat) — oyning 1-darsiga
              to&apos;lovsiz kelish mumkin, 2-darsdan boshlab o&apos;quvchi
              faqat puli yetgan darslargacha qatnashadi: to&apos;lamaganlar
              davomatda qulf bilan ko&apos;rinadi va ularni belgilab
              bo&apos;lmaydi (shartnoma 3.2). O&apos;chirilsa — hamma
              o&apos;quvchi darsga qo&apos;yiladi, to&apos;lov oynasida
              &laquo;qaysi darsgacha yetadi&raquo; ko&apos;rinmaydi.
            </p>
          </div>
          <Switch
            checked={settings["payment.admissionRuleEnabled"]}
            disabled={!isCeo || saving}
            onCheckedChange={(checked) =>
              saveField({ admissionRuleEnabled: checked })
            }
          />
        </div>
        {lockedNote}
      </div>

      {/* Shartnoma 3.2 — oy to'lovining eng kam qismi (ADR-0064) */}
      <NumberRule
        {...numberRule}
        field="admissionMinPaidPercent"
        label="Darsga kirish uchun oy to'lovining eng kam qismi"
        hint="2-darsdan boshlab o'quvchi darsga qo'yilishi uchun oy to'lovining kamida shu qismi to'langan bo'lishi kerak (shartnoma 3.2). Har guruhda o'sha guruhning 2-darsidan hisoblanadi. 01.11.2026 dan boshlab ishlaydi. 0 dan 100 gacha; standart 50. 0 qo'yilsa — faqat o'tilgan darslar puli so'raladi. Yuqoridagi qoida o'chirilgan bo'lsa, ishlamaydi."
        saved={settings["payment.admissionMinPaidPercent"] ?? 50}
        max={100}
        unit="%"
        rangeError="Foiz 0 dan 100 gacha bo'lgan butun son bo'lishi kerak"
      />

      {/* Shartnoma 3.7 — to'langan darslar tugashidan oldingi eslatma (ADR-0064) */}
      <NumberRule
        {...numberRule}
        field="paidThroughReminderDays"
        label="To'langan darslar tugashidan necha kun oldin eslatma boshlansin"
        hint="Oy to'lovini qisman to'lagan o'quvchiga to'lovi yetmaydigan birinchi darsdan shuncha kun oldin boshlab har kuni soat 20:00 da Telegram orqali eslatma boradi (shartnoma 3.7). To'lov kelsa, eslatma to'xtaydi. 0 dan 10 gacha; standart 3. 0 qo'yilsa — eslatma yuborilmaydi. Yuqoridagi qoida o'chirilgan bo'lsa, ishlamaydi."
        saved={settings["payment.paidThroughReminderDays"] ?? 3}
        max={10}
        unit="kun"
        rangeError="Kun 0 dan 10 gacha bo'lgan butun son bo'lishi kerak"
      />

      <Separator />

      {/* Shartnoma 3.5 — sinov darsi (ADR-0048) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between rounded-lg border px-4 py-3">
          <div className="pr-4">
            <p className="text-sm font-medium">Sinov darsi (shartnoma 3.5)</p>
            <p className="text-xs text-muted-foreground">
              Yoqilgan bo&apos;lsa (standart holat) — umuman 1 tadan ko&apos;p
              darsga kelmagan (&laquo;Keldi&raquo; yoki &laquo;Kechikdi&raquo;)
              o&apos;quvchi guruhdan chiqarilsa yoki chetlatilsa, oyning puli
              to&apos;liq qaytadi va qarzi 0 bo&apos;ladi; ustozga ham
              o&apos;sha oyning darslari uchun haq yozilmaydi. O&apos;chirilsa —
              oddiy tartib (yuqoridagi foiz qoidasi) ishlaydi.
            </p>
          </div>
          <Switch
            checked={settings["payment.trialLessonEnabled"]}
            disabled={!isCeo || saving}
            onCheckedChange={(checked) =>
              saveField({ trialLessonEnabled: checked })
            }
          />
        </div>
        {lockedNote}
      </div>

      <Separator />

      {/* Davomat oynasi (ADR-0047) */}
      <NumberRule
        {...numberRule}
        field="attendanceOpensMinutesBefore"
        label="Davomat dars boshlanishidan necha daqiqa oldin ochiladi"
        hint="Yangi davomat shu daqiqa oldin ochiladi va dars tugashi bilan yopiladi — barcha rollar uchun bir xil. Olingan davomatni markaz rahbari, filial direktori va administrator dars tugagach ham tuzata oladi. 0 dan 60 gacha; standart 10."
        saved={settings["payment.attendanceOpensMinutesBefore"]}
        max={60}
        unit="daqiqa"
        rangeError="Daqiqa 0 dan 60 gacha bo'lgan butun son bo'lishi kerak"
      />
    </>
  );
}
