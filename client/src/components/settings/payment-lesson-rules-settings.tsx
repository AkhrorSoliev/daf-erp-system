"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

/** The lesson rules of ADR-0046/0046 the CEO can switch without a deploy. */
export interface LessonRuleSettings {
  "payment.admissionRuleEnabled": boolean;
  "payment.trialLessonEnabled": boolean;
  "payment.attendanceOpensMinutesBefore": number;
}

interface Props {
  settings: LessonRuleSettings;
  isCeo: boolean;
  canEdit: boolean;
  saving: boolean;
  saveField: (patch: Record<string, unknown>) => void;
}

const COMPANY_ONLY_NOTE =
  "Bu qiymat filial bo'yicha emas — butun kompaniya uchun bitta, shuning uchun faqat CEO o'zgartira oladi.";

/**
 * «Darsga qo'yish», «Sinov darsi» and the attendance window lead. All three
 * are company-level on the server, so only the CEO may change them — a
 * branch director sees them and is told why they are locked.
 */
export function PaymentLessonRulesSettings({
  settings,
  isCeo,
  canEdit,
  saving,
  saveField,
}: Props) {
  const saved = settings["payment.attendanceOpensMinutesBefore"];
  const [minutesInput, setMinutesInput] = useState(String(saved));
  // A saved value from the server resets the field (set during render, the
  // pattern React documents for state derived from a prop).
  const [shownSaved, setShownSaved] = useState(saved);
  if (shownSaved !== saved) {
    setShownSaved(saved);
    setMinutesInput(String(saved));
  }

  function handleMinutesBlur() {
    const v = Number(minutesInput);
    if (minutesInput.trim() === "" || !Number.isInteger(v) || v < 0 || v > 60) {
      toast.error("Daqiqa 0 dan 60 gacha bo'lgan butun son bo'lishi kerak");
      setMinutesInput(String(saved));
      return;
    }
    if (v === saved) return;
    saveField({ attendanceOpensMinutesBefore: v });
  }

  const lockedNote = !isCeo && canEdit && (
    <p className="text-xs text-muted-foreground">{COMPANY_ONLY_NOTE}</p>
  );

  return (
    <>
      <Separator />

      {/* Shartnoma 3.2 — to'lamagan o'quvchini 2-darsdan qo'ymaslik (ADR-0046) */}
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

      <Separator />

      {/* Shartnoma 3.5 — sinov darsi (ADR-0047) */}
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

      {/* Davomat oynasi (ADR-0046) */}
      <div className="space-y-1.5">
        <Label htmlFor="attendanceOpensMinutesBefore">
          Davomat dars boshlanishidan necha daqiqa oldin ochiladi
        </Label>
        <p className="text-xs text-muted-foreground">
          Davomat shu daqiqa oldin ochiladi va dars tugashi bilan yopiladi —
          barcha rollar uchun bir xil. 0 dan 60 gacha; standart 10.
        </p>
        <div className="flex items-center gap-2">
          <Input
            id="attendanceOpensMinutesBefore"
            type="number"
            min={0}
            max={60}
            step={1}
            className="w-full sm:max-w-xs"
            value={minutesInput}
            disabled={!isCeo || saving}
            onChange={(e) => setMinutesInput(e.target.value)}
            onBlur={handleMinutesBlur}
          />
          <span className="text-sm text-muted-foreground">daqiqa</span>
        </div>
        {lockedNote}
      </div>
    </>
  );
}
