"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { ContractClauseLink } from "@/components/shared/contract-clause-link";
import { isCeoUser, useAuth } from "@/hooks/use-auth";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useT } from "@/i18n/context";
import { SettingsCard } from "./settings-form-parts";
import {
  BARRED_ITEMS,
  canTurnOn,
  flagsFromSettings,
  patchFor,
  toggled,
  type BarredFlagId,
  type BarredFlags,
} from "./barred-lessons-model";

/**
 * «To'lov yo'qligi uchun davomat olib bo'lmagan darslar» (ADR-0142): yetti
 * mustaqil katak. Faqat CEO o'zgartiradi (kalitlar kompaniya darajasida).
 * Har bosish darrov saqlanadi; talabi bajarilmagan katak bosilmaydi va nima
 * kerakligi yoziladi.
 */
export function BarredLessonsSettingsClient() {
  const t = useT();
  const isCeo = isCeoUser(useAuth((s) => s.user));
  const [flags, setFlags] = useState<BarredFlags | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isCeo) return;
    api
      .get("/settings/payment")
      .then(({ data }) => setFlags(flagsFromSettings(data.settings)))
      .catch((error) =>
        toast.error(getErrorMessage(error, t("Sozlamalarni yuklashda xatolik yuz berdi"))),
      );
    // Bir marta yuklanadi; til almashsa qayta so'ralmaydi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCeo]);

  if (!isCeo) return null;

  const toggle = async (id: BarredFlagId) => {
    if (!flags || saving) return;
    const next = toggled(flags, id);
    const patch = patchFor(flags, next);
    if (Object.keys(patch).length === 0) return;
    setSaving(true);
    try {
      const { data } = await api.patch("/settings/payment", patch);
      setFlags(flagsFromSettings(data.settings));
      toast.success(t("Sozlama saqlandi"));
    } catch (error) {
      toast.error(getErrorMessage(error, t("Saqlashda xatolik yuz berdi")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsCard>
      <div className="space-y-1">
        <h2 className="font-heading text-lg font-semibold">
          {t("To'lov yo'qligi uchun davomat olib bo'lmagan darslar")}
        </h2>
        <p className="text-muted-foreground text-sm">
          {t("Faqat CEO o'zgartiradi. Har qism alohida yoqiladi.")}{" "}
          {t("Qoida asosi:")} <ContractClauseLink no="3.2" />
        </p>
      </div>
      {!flags ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <ul className="space-y-1">
          {BARRED_ITEMS.map((item) => {
            const checked = flags[item.id];
            const blocked = !checked && !canTurnOn(flags, item.id);
            const needed = item.requires
              ? BARRED_ITEMS.find((i) => i.id === item.requires)!
              : null;
            return (
              <li
                key={item.id}
                style={{ paddingLeft: `${item.level * 1.5}rem` }}
              >
                <label
                  className={`flex items-start gap-3 rounded-lg px-3 py-2.5 ${
                    checked ? "bg-muted/60" : ""
                  } ${blocked ? "opacity-60" : "cursor-pointer"}`}
                >
                  <Checkbox
                    className="mt-1"
                    checked={checked}
                    disabled={blocked || saving}
                    onCheckedChange={() => toggle(item.id)}
                  />
                  <span className="space-y-0.5">
                    <span className="block text-sm font-semibold">
                      {t(item.title)}
                    </span>
                    <span className="text-muted-foreground block text-sm">
                      {t(item.text)}
                    </span>
                    {blocked && needed && (
                      <span className="block text-xs text-amber-700 dark:text-amber-400">
                        {t("Avval «{title}» ni yoqing.", {
                          title: t(needed.title),
                        })}
                      </span>
                    )}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </SettingsCard>
  );
}
