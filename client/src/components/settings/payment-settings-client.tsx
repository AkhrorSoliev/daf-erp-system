"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Lock } from "lucide-react";
import toast from "react-hot-toast";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingsPageHeader } from "./settings-page-header";
import {
  NumberSetting,
  SettingRow,
  SettingsSection,
} from "./payment-settings-parts";
import { useAuth } from "@/hooks/use-auth";
import { useCan, usePermissionsReady } from "@/hooks/use-permissions";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useT } from "@/i18n/context";
import { msg } from "@/i18n/msg";
import { PAYMENT_MODEL_LABELS, type PaymentModel } from "@/lib/payment-model";

interface PaymentSettingsValues {
  "payment.defaultModel": PaymentModel;
  "payment.excusedCreditEnabled": boolean;
  "payment.excusedCreditMonthlyCap": number | null;
  "payment.chargeDayOfMonth": number;
  "payment.debtWriteOffEnabled": boolean;
  "payment.monthlyNoticesEnabled": boolean;
  "payment.noRefundAfterPercent": number;
  // The lesson rules of ADR-0047/0048/0064.
  "payment.admissionRuleEnabled": boolean;
  "payment.trialLessonEnabled": boolean;
  "payment.attendanceOpensMinutesBefore": number;
  "payment.admissionMinPaidPercent": number;
  "payment.paidThroughReminderDays": number;
}

/** Har bir sozlama kaliti uchun — o'ziga xos qiymatga ega filiallar ro'yxati. */
type BranchOverrides = Record<keyof PaymentSettingsValues, number[]>;

/** 1–28: every month has these days, February included. */
const CHARGE_DAYS = Array.from({ length: 28 }, (_, i) => String(i + 1));

const TITLE = msg("To'lov");
const DESCRIPTION = msg("To'lov va darsga qo'yish qoidalari. O'zgarish darhol kuchga kiradi.");

export function PaymentSettingsClient() {
  const t = useT();
  // The settings load once; a language switch must not refetch (ref copy, not a dep).
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  });
  const authUser = useAuth((s) => s.user);
  const canEdit = useCan("settings.payment");
  // The "read only" note below waits for the list, so it never flashes at an editor.
  const permissionsReady = usePermissionsReady();
  // Company-level settings stay with the CEO by identity (see the lock below).
  const isCeo = authUser?.roles.some((r) => r.id === 1) ?? false;
  // Most of this page is company-level: the backend (`SettingsService.set`)
  // refuses a branch director's write to those keys. The director still SEES
  // them, with a lock and one banner saying why, rather than a hidden control
  // or a switch that never saves.

  const [settings, setSettings] = useState<PaymentSettingsValues | null>(null);
  // CEO kompaniya darajasida ko'rayotganda backend qaysi filiallar o'z
  // override'iga ega ekanini ham qaytaradi (`GET /settings/payment` —
  // faqat `branchId` so'ralmaganda). Filial direktori buni hech qachon
  // olmaydi — ular har doim o'z filialiga qulflanadi.
  const [branchOverrides, setBranchOverrides] =
    useState<BranchOverrides | null>(null);
  const branches = useBranchSwitcher((s) => s.branches);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function fetchSettings() {
      try {
        const { data } = await api.get("/settings/payment");
        setSettings(data.settings);
        setBranchOverrides(data.branchOverrides ?? null);
      } catch (error) {
        toast.error(
          getErrorMessage(error, tRef.current(msg("Sozlamalarni yuklashda xatolik yuz berdi"))),
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
      toast.success(t("Sozlama saqlandi"));
    } catch (error) {
      toast.error(getErrorMessage(error, t("Saqlashda xatolik yuz berdi")));
    } finally {
      setSaving(false);
    }
  }

  /**
   * Bu ekran faqat kompaniya darajasini o'qiydi/yozadi, shuning uchun
   * filialda BOSHQACHA qiymat saqlangani ko'rinib turishi kerak — aks holda
   * CEO bitta "umumiy" qiymatni ko'rib, bir filialda boshqacha ishlayotganidan
   * bexabar qoladi. Faqat filial bo'yicha yozilishi mumkin bo'lgan kalitlar
   * uchun chaqiriladi.
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
        {t("Bu filiallarda boshqa qiymat turibdi: {names}.", { names: names.join(", ") })}
      </p>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <SettingsPageHeader title={t(TITLE)} description={t(DESCRIPTION)} />
        {[3, 2, 4].map((rows, i) => (
          <Skeleton key={i} className="w-full rounded-xl" style={{ height: rows * 72 }} />
        ))}
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="space-y-6">
        <SettingsPageHeader title={t(TITLE)} description={t(DESCRIPTION)} />
        <p className="text-sm text-muted-foreground">
          {t("Sozlamalarni yuklab bo'lmadi. Sahifani qayta yuklab ko'ring.")}
        </p>
      </div>
    );
  }

  const admissionOn = settings["payment.admissionRuleEnabled"];
  const creditOn = settings["payment.excusedCreditEnabled"];

  return (
    <div className="max-w-3xl space-y-4">
      <SettingsPageHeader
        title={t(TITLE)}
        description={t(DESCRIPTION)}
        action={
          saving && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              {t("Saqlanmoqda...")}
            </span>
          )
        }
      />

      {permissionsReady && !canEdit && (
        <p className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
          {t("Bu bo'limni faqat markaz rahbari va filial direktori tahrirlashi mumkin.")}
        </p>
      )}
      {!isCeo && canEdit && (
        <p className="flex items-start gap-2 rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
          <Lock className="mt-0.5 size-4 shrink-0" />
          <span>
            {t(
              "Qulf belgili sozlamalar filial bo'yicha emas, butun kompaniya uchun bitta, shuning uchun faqat markaz rahbari o'zgartira oladi.",
            )}
          </span>
        </p>
      )}

      <SettingsSection title={t("Hisob-kitob")}>
        <SettingRow
          label={t("Standart to'lov modeli")}
          htmlFor="defaultModel"
          hint={t("Yangi kursda model tanlanmasa, shu ishlatiladi. Mavjud kurslarga ta'sir qilmaydi.")}
          note={renderOverrideNote("payment.defaultModel")}
          control={
            <Select
              value={settings["payment.defaultModel"]}
              disabled={!canEdit || saving}
              onValueChange={(v) => saveField({ defaultModel: v })}
            >
              <SelectTrigger id="defaultModel" className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PAYMENT_MODEL_LABELS) as PaymentModel[]).map(
                  (model) => {
                    const label = PAYMENT_MODEL_LABELS[model];
                    return (
                      <SelectItem key={model} value={model}>
                        {t(label)}
                      </SelectItem>
                    );
                  },
                )}
              </SelectContent>
            </Select>
          }
        />
        {/* chargeDayOfMonth companyLevelOnly — oylik hisob croni uni hech
            qachon filial bo'yicha o'qimaydi, backend filial yozuvini rad
            etadi; shuning uchun override eslatmasi yo'q. */}
        <SettingRow
          label={t("Oylik hisob kuni")}
          htmlFor="chargeDayOfMonth"
          hint={t("«Oylik» kurslarda har oy shu kuni yangi to'lov hisobi yoziladi.")}
          details={t("1 dan 28 gacha tanlanadi, chunki fevralda 28 kun bor.")}
          locked={!isCeo}
          control={
            <Select
              value={String(settings["payment.chargeDayOfMonth"])}
              disabled={!isCeo || saving}
              onValueChange={(v) => saveField({ chargeDayOfMonth: Number(v) })}
            >
              <SelectTrigger id="chargeDayOfMonth" className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {CHARGE_DAYS.map((day) => (
                  <SelectItem key={day} value={day}>
                    {t("{n}-kun", { n: day })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
      </SettingsSection>

      <SettingsSection title={t("Sababli darslar")}>
        <SettingRow
          label={t("Sababli dars puli keyingi oyga o'tsin")}
          hint={t("Sababli qoldirilgan darsning puli keyingi oy to'lovidan ayiriladi.")}
          details={t("O'chirilsa, sababli dars ham oddiy dars kabi hisoblanadi.")}
          note={renderOverrideNote("payment.excusedCreditEnabled")}
          control={
            <Switch
              checked={creditOn}
              aria-label={t("Sababli dars puli keyingi oyga o'tsin")}
              disabled={!canEdit || saving}
              onCheckedChange={(checked) =>
                saveField({ excusedCreditEnabled: checked })
              }
            />
          }
        >
          <SettingRow
            label={t("Oyiga eng ko'pi bilan")}
            htmlFor="excusedCreditMonthlyCap"
            hint={t("Bo'sh qoldirilsa, cheklov yo'q.")}
            note={renderOverrideNote("payment.excusedCreditMonthlyCap")}
            control={
              <NumberSetting
                id="excusedCreditMonthlyCap"
                saved={settings["payment.excusedCreditMonthlyCap"]}
                unit={t("dars")}
                allowEmpty
                placeholder={t("Cheklovsiz")}
                rangeError={t("Limit manfiy bo'lmagan butun son yoki bo'sh bo'lishi kerak")}
                disabled={!canEdit || saving || !creditOn}
                onSave={(v) => saveField({ excusedCreditMonthlyCap: v })}
              />
            }
          />
        </SettingRow>
      </SettingsSection>

      {/* Shartnoma 3.2 va 3.7 (ADR-0047, ADR-0064) hamda oylik xabar
          (ADR-0042) — hammasi companyLevelOnly, faqat CEO. */}
      <SettingsSection title={t("To'lamagan o'quvchilar")}>
        <SettingRow
          label={t("To'lamagan o'quvchi 2-darsdan qo'yilmasin")}
          hint={t("1-darsga to'lovsiz kelish mumkin, keyin faqat puli yetgan darslarga qo'yiladi.")}
          details={t("To'lamaganlar davomatda qulf bilan ko'rinadi va ularni belgilab bo'lmaydi. O'chirilsa, hamma o'quvchi darsga qo'yiladi va to'lov oynasida «qaysi darsgacha yetadi» ko'rinmaydi. Standart holat: yoqilgan. Shartnoma 3.2.")}
          locked={!isCeo}
          control={
            <Switch
              checked={admissionOn}
              aria-label={t("To'lamagan o'quvchi 2-darsdan qo'yilmasin")}
              disabled={!isCeo || saving}
              onCheckedChange={(checked) =>
                saveField({ admissionRuleEnabled: checked })
              }
            />
          }
        >
          <SettingRow
            label={t("Darsga kirish uchun eng kam to'lov")}
            htmlFor="admissionMinPaidPercent"
            hint={t("2-darsdan boshlab darsga kirish uchun oy to'lovining kamida shu qismi to'langan bo'lishi kerak.")}
            details={t("Har guruhda o'sha guruhning 2-darsidan hisoblanadi. 0 qo'yilsa, faqat o'tilgan darslar puli so'raladi. Standart: 50%. 01.11.2026 dan ishlaydi. Shartnoma 3.2.")}
            locked={!isCeo}
            control={
              <NumberSetting
                id="admissionMinPaidPercent"
                saved={settings["payment.admissionMinPaidPercent"] ?? 50}
                max={100}
                unit="%"
                rangeError={t("Foiz 0 dan 100 gacha bo'lgan butun son bo'lishi kerak")}
                disabled={!isCeo || saving || !admissionOn}
                onSave={(v) => saveField({ admissionMinPaidPercent: v })}
              />
            }
          />
          <SettingRow
            label={t("To'lov tugashidan oldin eslatma")}
            htmlFor="paidThroughReminderDays"
            hint={t("Puli yetmaydigan birinchi darsdan shuncha kun oldin har kuni 20:00 da Telegram'da eslatma boradi.")}
            details={t("To'lov kelsa, eslatma to'xtaydi. 0 qo'yilsa, eslatma yuborilmaydi. Standart: 3 kun. Shartnoma 3.7.")}
            locked={!isCeo}
            control={
              <NumberSetting
                id="paidThroughReminderDays"
                saved={settings["payment.paidThroughReminderDays"] ?? 3}
                max={10}
                unit={t("kun")}
                rangeError={t("Kun 0 dan 10 gacha bo'lgan butun son bo'lishi kerak")}
                disabled={!isCeo || saving || !admissionOn}
                onSave={(v) => saveField({ paidThroughReminderDays: v })}
              />
            }
          />
        </SettingRow>
        <SettingRow
          label={t("O'quvchiga oylik to'lov xabari")}
          hint={t("Hisob kuni o'quvchiga Telegram'da shu oy uchun qancha to'lash kerakligi yuboriladi.")}
          details={t("To'lamaganlarga oyning 2-darsidan bir kun oldin eslatma ham boradi. Ikkalasi soat 20:00 dagi kunlik xabar bilan keladi. O'chirilsa, bu ikki xabar yuborilmaydi. Standart holat: yoqilgan.")}
          locked={!isCeo}
          control={
            <Switch
              checked={settings["payment.monthlyNoticesEnabled"]}
              disabled={!isCeo || saving}
              aria-label={t("O'quvchiga oylik to'lov xabari")}
              onCheckedChange={(checked) =>
                saveField({ monthlyNoticesEnabled: checked })
              }
            />
          }
        />
      </SettingsSection>

      {/* Shartnoma 6.2 (ADR-0043), sinov darsi 3.5 (ADR-0048) va qarz
          kechirish — hammasi companyLevelOnly, faqat CEO. Qulflangan tugma
          `isCeo` bilan (`canEdit` emas): direktorning yozuvini backend rad
          etadi, `canEdit` u bosadigan-u saqlanmaydigan tugma berardi. */}
      <SettingsSection title={t("O'quvchi ketganda")}>
        <SettingRow
          label={t("Pul qaytarilmaydigan chegara")}
          htmlFor="noRefundAfterPercent"
          hint={t("O'quvchi ketganda oy darslarining shu qismidan ko'pi o'tgan bo'lsa, oy puli qaytarilmaydi.")}
          details={t("Kamroq o'tgan bo'lsa, o'tilmagan darslar puli qaytadi. Guruhdan chiqarish va chetlatishga tegishli. 01.10.2026 dan chiqqanlarga qo'llanadi. Shartnoma 6.2.")}
          locked={!isCeo}
          control={
            <NumberSetting
              id="noRefundAfterPercent"
              saved={settings["payment.noRefundAfterPercent"]}
              max={100}
              unit="%"
              rangeError={t("Foiz 0 dan 100 gacha bo'lgan butun son bo'lishi kerak")}
              disabled={!isCeo || saving}
              onSave={(v) => saveField({ noRefundAfterPercent: v })}
            />
          }
        />
        <SettingRow
          label={t("Sinov darsi")}
          hint={t("1 tadan ko'p darsga kelmagan o'quvchi ketsa, oy puli to'liq qaytadi.")}
          details={t("«Keldi» va «Kechikdi» belgilari sanaladi. Qarzi 0 bo'ladi, ustozga o'sha oy darslari uchun haq yozilmaydi. O'chirilsa, yuqoridagi foiz qoidasi ishlaydi. Standart holat: yoqilgan. Shartnoma 3.5.")}
          locked={!isCeo}
          control={
            <Switch
              checked={settings["payment.trialLessonEnabled"]}
              aria-label={t("Sinov darsi")}
              disabled={!isCeo || saving}
              onCheckedChange={(checked) =>
                saveField({ trialLessonEnabled: checked })
              }
            />
          }
        />
        <SettingRow
          label={t("Qarz kechirishga ruxsat")}
          hint={t("O'chiq bo'lsa, qarzni hech kim kechira olmaydi. Yoqilsa, administrator sabab yozib kechiradi.")}
          details={t("O'chiq (standart holat) bo'lsa, qarz hech qachon kechirilmaydi: guruhdan chiqarish oynasidagi va profildagi kechirish tugmasi ishlamaydi, qarz butun tarixi bilan joyida qoladi. Yoqilsa, administrator sabab yozib va summani qayta terib kechiradi.")}
          locked={!isCeo}
          control={
            <Switch
              checked={settings["payment.debtWriteOffEnabled"]}
              disabled={!isCeo || saving}
              aria-label={t("Qarz kechirishga ruxsat")}
              onCheckedChange={(checked) =>
                saveField({ debtWriteOffEnabled: checked })
              }
            />
          }
        />
      </SettingsSection>

      {/* Davomat oynasi (ADR-0047) — companyLevelOnly. */}
      <SettingsSection title={t("Davomat")}>
        <SettingRow
          label={t("Davomat ochilish vaqti")}
          htmlFor="attendanceOpensMinutesBefore"
          hint={t("Yangi davomat dars boshlanishidan shuncha oldin ochiladi va dars tugashi bilan yopiladi.")}
          details={t("Barcha rollar uchun bir xil. Olingan davomatni markaz rahbari, filial direktori va administrator dars tugagach ham tuzata oladi. Standart: 10 daqiqa.")}
          locked={!isCeo}
          control={
            <NumberSetting
              id="attendanceOpensMinutesBefore"
              saved={settings["payment.attendanceOpensMinutesBefore"]}
              max={60}
              unit={t("daqiqa")}
              rangeError={t("Daqiqa 0 dan 60 gacha bo'lgan butun son bo'lishi kerak")}
              disabled={!isCeo || saving}
              onSave={(v) => saveField({ attendanceOpensMinutesBefore: v })}
            />
          }
        />
      </SettingsSection>
    </div>
  );
}
