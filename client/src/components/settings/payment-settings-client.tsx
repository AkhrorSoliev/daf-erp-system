"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingsPageHeader } from "./settings-page-header";
import { useAuth } from "@/hooks/use-auth";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { PAYMENT_MODEL_LABELS, type PaymentModel } from "@/lib/payment-model";

interface PaymentSettingsValues {
  "payment.defaultModel": PaymentModel;
  "payment.excusedCreditEnabled": boolean;
  "payment.excusedCreditMonthlyCap": number | null;
  "payment.chargeDayOfMonth": number;
}

/** Har bir sozlama kaliti uchun — o'ziga xos qiymatga ega filiallar ro'yxati. */
type BranchOverrides = Record<keyof PaymentSettingsValues, number[]>;

export function PaymentSettingsClient() {
  const authUser = useAuth((s) => s.user);
  const canEdit = authUser?.roles.some((r) => [1, 2].includes(r.id)) ?? false;
  const isCeo = authUser?.roles.some((r) => r.id === 1) ?? false;
  // `payment.chargeDayOfMonth` faqat kompaniya darajasida ishlaydi — oylik
  // hisob-kitob croni va qorovul uni HECH QACHON filial bo'yicha o'qimaydi
  // (backend `SettingsService.set` buni ham majburlaydi). Shuning uchun
  // Filial direktori buni o'zgartira olmaydi — lekin ko'ra oladi va NEGA
  // o'zgartira olmasligini tushunadi, boshqaruv shunchaki yashirilmaydi.
  const canEditChargeDay = isCeo;

  const [settings, setSettings] = useState<PaymentSettingsValues | null>(null);
  // CEO kompaniya darajasida ko'rayotganda backend qaysi filiallar o'z
  // override'iga ega ekanini ham qaytaradi (`GET /settings/payment` —
  // faqat `branchId` so'ralmaganda). Filial direktori buni hech qachon
  // olmaydi — ular har doim o'z filialiga qulflanadi, "boshqa filialda
  // qanday" degan savol ularga tegishli emas.
  const [branchOverrides, setBranchOverrides] =
    useState<BranchOverrides | null>(null);
  const branches = useBranchSwitcher((s) => s.branches);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Raqamli maydonlar o'z matn holatini alohida saqlaydi — `settings` faqat
  // serverdan tasdiqlangan qiymatni ushlab turadi, shuning uchun input hech
  // qachon oraliq/noto'g'ri qiymat bilan "settings"ni buzmaydi.
  const [capInput, setCapInput] = useState("");
  const [dayInput, setDayInput] = useState("1");

  useEffect(() => {
    async function fetchSettings() {
      try {
        const { data } = await api.get("/settings/payment");
        setSettings(data.settings);
        setBranchOverrides(data.branchOverrides ?? null);
        const cap = data.settings["payment.excusedCreditMonthlyCap"];
        setCapInput(cap === null || cap === undefined ? "" : String(cap));
        setDayInput(String(data.settings["payment.chargeDayOfMonth"]));
      } catch (error) {
        toast.error(
          getErrorMessage(error, "Sozlamalarni yuklashda xatolik yuz berdi"),
        );
      } finally {
        setLoading(false);
      }
    }
    fetchSettings();
  }, []);

  async function saveField(patch: Record<string, unknown>) {
    if (!settings) return;
    setSaving(true);
    try {
      const { data } = await api.patch("/settings/payment", patch);
      setSettings(data.settings);
      const cap = data.settings["payment.excusedCreditMonthlyCap"];
      setCapInput(cap === null || cap === undefined ? "" : String(cap));
      setDayInput(String(data.settings["payment.chargeDayOfMonth"]));
      toast.success("Sozlama saqlandi");
    } catch (error) {
      toast.error(getErrorMessage(error, "Saqlashda xatolik yuz berdi"));
    } finally {
      setSaving(false);
    }
  }

  function handleCapBlur() {
    if (!settings) return;
    const trimmed = capInput.trim();
    const nextCap = trimmed === "" ? null : Number(trimmed);
    if (nextCap !== null && (!Number.isInteger(nextCap) || nextCap < 0)) {
      toast.error("Limit manfiy bo'lmagan butun son yoki bo'sh bo'lishi kerak");
      setCapInput(
        settings["payment.excusedCreditMonthlyCap"] === null
          ? ""
          : String(settings["payment.excusedCreditMonthlyCap"]),
      );
      return;
    }
    if (nextCap === settings["payment.excusedCreditMonthlyCap"]) return;
    saveField({ excusedCreditMonthlyCap: nextCap });
  }

  function handleDayBlur() {
    if (!settings) return;
    const v = Number(dayInput);
    if (!Number.isInteger(v) || v < 1 || v > 28) {
      toast.error("Hisob-kitob kuni 1 dan 28 gacha bo'lgan butun son bo'lishi kerak");
      setDayInput(String(settings["payment.chargeDayOfMonth"]));
      return;
    }
    if (v === settings["payment.chargeDayOfMonth"]) return;
    saveField({ chargeDayOfMonth: v });
  }

  /**
   * "Bu yerda ko'rsatilgan qiymat kompaniya darajasidagi — quyidagi
   * filiallarda BOSHQACHA qiymat saqlangan" eslatmasi. Bu ekran hozircha
   * filial bo'yicha tahrirlashni taklif qilmaydi (faqat kompaniya
   * darajasini o'qiydi/yozadi) — shuning uchun eng kamida override
   * borligini KO'RINADIGAN qilib qo'yamiz, aks holda CEO bitta "umumiy"
   * qiymatni ko'rib, aslida bir filialda boshqacha ishlayotganidan
   * bexabar qoladi.
   */
  function renderOverrideNote(settingKey: keyof PaymentSettingsValues) {
    if (!isCeo || !branchOverrides) return null;
    const branchIds = branchOverrides[settingKey];
    if (!branchIds || branchIds.length === 0) return null;
    const names = branchIds.map(
      (id) => branches.find((b) => b.id === id)?.name ?? `#${id}`,
    );
    return (
      <p className="text-xs text-amber-600 dark:text-amber-400">
        Filiallarda boshqacha qiymat saqlangan: {names.join(", ")}.
      </p>
    );
  }

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="space-y-6">
        <SettingsPageHeader
          title="To'lov"
          description="Kurs to'lov modeli va hisob-kitob qoidalari"
        />
        <p className="text-sm text-muted-foreground">
          Sozlamalarni yuklab bo'lmadi. Sahifani qayta yuklab ko'ring.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SettingsPageHeader
        title="To'lov"
        description="Kurs to'lov modeli va hisob-kitob qoidalari — bu yerdagi o'zgarish barcha yangi hisob-kitoblarga darhol ta'sir qiladi"
      />

      <div className="space-y-5">
        {/* Standart to'lov modeli */}
        <div className="space-y-1.5">
          <Label htmlFor="defaultModel">
            Yangi kurslar uchun standart to&apos;lov modeli
          </Label>
          <p className="text-xs text-muted-foreground">
            Yangi kurs qo&apos;shilganda, agar kurs uchun aniq model
            tanlanmasa, shu model ishlatiladi. Mavjud kurslarga ta&apos;sir
            qilmaydi.
          </p>
          <Select
            value={settings["payment.defaultModel"]}
            disabled={!canEdit || saving}
            onValueChange={(v) => saveField({ defaultModel: v })}
          >
            <SelectTrigger id="defaultModel" className="w-full sm:max-w-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PAYMENT_MODEL_LABELS) as PaymentModel[]).map(
                (model) => (
                  <SelectItem key={model} value={model}>
                    {PAYMENT_MODEL_LABELS[model]}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
          {renderOverrideNote("payment.defaultModel")}
        </div>

        <Separator />

        {/* Sababli dars krediti */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between rounded-lg border px-4 py-3">
            <div className="pr-4">
              <p className="text-sm font-medium">
                Sababli darsning krediti keyingi oyga o&apos;tsin
              </p>
              <p className="text-xs text-muted-foreground">
                Yoqilsa, o&apos;quvchi sababli sabab bilan qoldirgan darsning
                puli hisobdan chiqarilmaydi va keyingi oyning to&apos;lovidan
                ayiriladi (kredit sifatida). O&apos;chirilsa, sababli dars ham
                oddiy dars kabi hisoblanadi.
              </p>
            </div>
            <Switch
              checked={settings["payment.excusedCreditEnabled"]}
              disabled={!canEdit || saving}
              onCheckedChange={(checked) =>
                saveField({ excusedCreditEnabled: checked })
              }
            />
          </div>
          {renderOverrideNote("payment.excusedCreditEnabled")}
        </div>

        {/* Kredit oylik limiti */}
        <div className="space-y-1.5">
          <Label htmlFor="excusedCreditMonthlyCap">
            Oyiga eng ko&apos;p nechta kredit dars o&apos;tkazilishi mumkin
          </Label>
          <p className="text-xs text-muted-foreground">
            Yuqoridagi sozlama yoqilgan bo&apos;lsa ishlaydi. Bo&apos;sh
            qoldirilsa — cheklov yo&apos;q, istalgan sondagi sababli dars
            kredit sifatida keyingi oyga o&apos;tishi mumkin.
          </p>
          <Input
            id="excusedCreditMonthlyCap"
            type="number"
            min={0}
            step={1}
            placeholder="Cheklovsiz"
            className="w-full sm:max-w-xs"
            value={capInput}
            disabled={!canEdit || saving || !settings["payment.excusedCreditEnabled"]}
            onChange={(e) => setCapInput(e.target.value)}
            onBlur={handleCapBlur}
          />
          {renderOverrideNote("payment.excusedCreditMonthlyCap")}
        </div>

        <Separator />

        {/* Hisob-kitob kuni */}
        <div className="space-y-1.5">
          <Label htmlFor="chargeDayOfMonth">
            Oyning qaysi kunida oylik hisob-kitob yaratiladi
          </Label>
          <p className="text-xs text-muted-foreground">
            &laquo;Oylik&raquo; modelidagi kurslar uchun har oy shu kunda
            yangi to&apos;lov talabi (charge) hosil bo&apos;ladi. 1 dan 28
            gacha — fevral oyi uchun cheklov.
          </p>
          <Input
            id="chargeDayOfMonth"
            type="number"
            min={1}
            max={28}
            className="w-full sm:max-w-xs"
            value={dayInput}
            disabled={!canEditChargeDay || saving}
            onChange={(e) => setDayInput(e.target.value)}
            onBlur={handleDayBlur}
          />
          {!canEditChargeDay && canEdit && (
            <p className="text-xs text-muted-foreground">
              Bu qiymat filial bo&apos;yicha emas — butun kompaniya uchun
              bitta (oylik hisob-kitob croni shunday ishlaydi), shuning
              uchun faqat CEO o&apos;zgartira oladi.
            </p>
          )}
          {/* chargeDayOfMonth companyLevelOnly — filial override HECH
              QACHON bo'lmaydi (backend uni rad etadi), shuning uchun bu
              yerda override eslatmasi ko'rsatilmaydi. */}
        </div>
      </div>

      {saving && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Saqlanmoqda...
        </div>
      )}

      {!canEdit && (
        <p className="text-xs text-muted-foreground">
          Bu bo&apos;limni faqat CEO va Filial direktori tahrirlashi mumkin.
        </p>
      )}
    </div>
  );
}
