"use client";

import { useEffect, useState } from "react";
import { Info, Lock } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  InfoDialog,
  NumberSetting,
  SettingRow,
  SettingsSection,
} from "./payment-settings-parts";
import { useAuth } from "@/hooks/use-auth";
import { useCan, usePermissionsReady } from "@/hooks/use-permissions";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
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

const TITLE = "To'lov";
const DESCRIPTION = "To'lov va darsga qo'yish qoidalari.";

/** Shown in the «saved» toast, so it says WHICH setting was saved. */
const SAVED_NAMES: Record<string, string> = {
  defaultModel: "Standart to'lov modeli",
  excusedCreditEnabled: "Sababli dars puli",
  excusedCreditMonthlyCap: "Oylik limit",
  chargeDayOfMonth: "Oylik hisob kuni",
  debtWriteOffEnabled: "Qarz kechirishga ruxsat",
  monthlyNoticesEnabled: "Oylik to'lov xabari",
  noRefundAfterPercent: "Pul qaytarilmaydigan chegara",
  admissionRuleEnabled: "2-darsdan qo'yish qoidasi",
  trialLessonEnabled: "Sinov darsi",
  attendanceOpensMinutesBefore: "Davomat ochilish vaqti",
  admissionMinPaidPercent: "Eng kam to'lov",
  paidThroughReminderDays: "To'lov eslatmasi",
};

/** A change that moves money or lets a student in: asked once more before it saves. */
interface PendingConfirm {
  title: string;
  lines: string[];
  action: string;
  run: () => void;
}

export function PaymentSettingsClient() {
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
  // The key being saved. One save at a time: the server answers with the whole
  // list, so two in flight could put an older answer over a newer one.
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const saving = savingKey !== null;
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);

  useEffect(() => {
    async function fetchSettings() {
      try {
        const { data } = await api.get("/settings/payment");
        setSettings(data.settings);
        setBranchOverrides(data.branchOverrides ?? null);
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
    const key = Object.keys(patch)[0];
    setSavingKey(key);
    try {
      const { data } = await api.patch("/settings/payment", patch);
      setSettings(data.settings);
      toast.success(`${SAVED_NAMES[key] ?? "Sozlama"} saqlandi`);
    } catch (error) {
      toast.error(getErrorMessage(error, "Saqlashda xatolik yuz berdi"));
    } finally {
      setSavingKey(null);
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
        Bu filiallarda boshqa qiymat turibdi: {names.join(", ")}.
      </p>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <SettingsPageHeader title={TITLE} description={DESCRIPTION} />
        {[3, 2, 4].map((rows, i) => (
          <Skeleton key={i} className="w-full rounded-xl" style={{ height: rows * 72 }} />
        ))}
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="space-y-6">
        <SettingsPageHeader title={TITLE} description={DESCRIPTION} />
        <p className="text-sm text-muted-foreground">
          Sozlamalarni yuklab bo&apos;lmadi. Sahifani qayta yuklab ko&apos;ring.
        </p>
      </div>
    );
  }

  const admissionOn = settings["payment.admissionRuleEnabled"];
  const creditOn = settings["payment.excusedCreditEnabled"];

  return (
    <div className="max-w-3xl space-y-4">
      <SettingsPageHeader
        title={TITLE}
        description={DESCRIPTION}
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAboutOpen(true)}
          >
            <Info className="size-4" />
            Bu sahifa nima qiladi?
          </Button>
        }
      />

      {permissionsReady && !canEdit && (
        <p className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
          Bu bo&apos;limni faqat markaz rahbari va filial direktori tahrirlashi
          mumkin.
        </p>
      )}
      {!isCeo && canEdit && (
        <p className="flex items-start gap-2 rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
          <Lock className="mt-0.5 size-4 shrink-0" />
          <span>
            Qulf belgili sozlamalar filial bo&apos;yicha emas, butun kompaniya
            uchun bitta, shuning uchun faqat markaz rahbari o&apos;zgartira
            oladi.
          </span>
        </p>
      )}

      <SettingsSection title="Hisob-kitob">
        <SettingRow
          label="Standart to'lov modeli"
          saving={savingKey === "defaultModel"}
          htmlFor="defaultModel"
          hint="Yangi kursda model tanlanmasa, shu ishlatiladi. Mavjud kurslarga ta'sir qilmaydi."
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
                  (model) => (
                    <SelectItem key={model} value={model}>
                      {PAYMENT_MODEL_LABELS[model]}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          }
        />
        {/* chargeDayOfMonth companyLevelOnly — oylik hisob croni uni hech
            qachon filial bo'yicha o'qimaydi, backend filial yozuvini rad
            etadi; shuning uchun override eslatmasi yo'q. */}
        <SettingRow
          label="Oylik hisob kuni"
          saving={savingKey === "chargeDayOfMonth"}
          htmlFor="chargeDayOfMonth"
          hint="«Oylik» kurslarda har oy shu kuni yangi to'lov hisobi yoziladi."
          details="1 dan 28 gacha tanlanadi, chunki fevralda 28 kun bor. O'zgarsa, keyingi oylik hisob yangi kunda yoziladi; yozilgan hisoblar o'zgarmaydi."
          locked={!isCeo}
          control={
            <Select
              value={String(settings["payment.chargeDayOfMonth"])}
              disabled={!isCeo || saving}
              onValueChange={(v) =>
                setConfirm({
                  title: "Oylik hisob kunini o'zgartirasizmi?",
                  lines: [
                    `Yangi kun: ${v}-kun.`,
                    "Keyingi oylik hisob shu kuni yoziladi. Yozilgan hisoblar o'zgarmaydi.",
                  ],
                  action: "O'zgartirish",
                  run: () => saveField({ chargeDayOfMonth: Number(v) }),
                })
              }
            >
              <SelectTrigger id="chargeDayOfMonth" className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {CHARGE_DAYS.map((day) => (
                  <SelectItem key={day} value={day}>
                    {day}-kun
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
      </SettingsSection>

      <SettingsSection title="Sababli darslar">
        <SettingRow
          label="Sababli dars puli keyingi oyga o'tsin"
          saving={savingKey === "excusedCreditEnabled"}
          hint="Sababli qoldirilgan darsning puli keyingi oy to'lovidan ayiriladi."
          details="O'chirilsa, sababli dars ham oddiy dars kabi hisoblanadi."
          note={renderOverrideNote("payment.excusedCreditEnabled")}
          control={
            <Switch
              checked={creditOn}
              aria-label="Sababli dars puli keyingi oyga o'tsin"
              disabled={!canEdit || saving}
              onCheckedChange={(checked) =>
                saveField({ excusedCreditEnabled: checked })
              }
            />
          }
        >
          <SettingRow
            label="Oyiga eng ko'pi bilan"
            saving={savingKey === "excusedCreditMonthlyCap"}
            htmlFor="excusedCreditMonthlyCap"
            hint="Bo'sh qoldirilsa, cheklov yo'q."
            note={renderOverrideNote("payment.excusedCreditMonthlyCap")}
            control={
              <NumberSetting
                id="excusedCreditMonthlyCap"
                saved={settings["payment.excusedCreditMonthlyCap"]}
                unit="dars"
                allowEmpty
                placeholder="Cheklovsiz"
                rangeError="Limit manfiy bo'lmagan butun son yoki bo'sh bo'lishi kerak"
                disabled={!canEdit || saving || !creditOn}
                onSave={(v) => saveField({ excusedCreditMonthlyCap: v })}
              />
            }
          />
        </SettingRow>
      </SettingsSection>

      {/* Shartnoma 3.2 va 3.7 (ADR-0047, ADR-0064) hamda oylik xabar
          (ADR-0042) — hammasi companyLevelOnly, faqat CEO. */}
      <SettingsSection title="To'lamagan o'quvchilar">
        <SettingRow
          label="To'lamagan o'quvchi 2-darsdan qo'yilmasin"
          saving={savingKey === "admissionRuleEnabled"}
          hint="1-darsga to'lovsiz kelish mumkin, keyin faqat puli yetgan darslarga qo'yiladi."
          details="To'lamaganlar davomatda qulf bilan ko'rinadi va ularni belgilab bo'lmaydi. O'chirilsa, hamma o'quvchi darsga qo'yiladi va to'lov oynasida «qaysi darsgacha yetadi» ko'rinmaydi. Standart holat: yoqilgan. Shartnoma 3.2."
          locked={!isCeo}
          control={
            <Switch
              checked={admissionOn}
              aria-label="To'lamagan o'quvchi 2-darsdan qo'yilmasin"
              disabled={!isCeo || saving}
              onCheckedChange={(checked) =>
                setConfirm({
                  title: checked
                    ? "2-darsdan qo'yish qoidasini yoqasizmi?"
                    : "2-darsdan qo'yish qoidasini o'chirasizmi?",
                  lines: checked
                    ? [
                        "To'lamagan o'quvchi 1-darsdan keyin faqat puli yetgan darslarga qo'yiladi.",
                        "Davomatda to'lamaganlar qulf bilan ko'rinadi.",
                      ]
                    : [
                        "Hamma o'quvchi darsga qo'yiladi, to'lagan-to'lamagani tekshirilmaydi.",
                        "To'lov oynasida «qaysi darsgacha yetadi» ko'rinmaydi.",
                      ],
                  action: checked ? "Yoqish" : "O'chirish",
                  run: () => saveField({ admissionRuleEnabled: checked }),
                })
              }
            />
          }
        >
          <SettingRow
            label="Darsga kirish uchun eng kam to'lov"
            saving={savingKey === "admissionMinPaidPercent"}
            htmlFor="admissionMinPaidPercent"
            hint="2-darsdan boshlab darsga kirish uchun oy to'lovining kamida shu qismi to'langan bo'lishi kerak."
            details="Har guruhda o'sha guruhning 2-darsidan hisoblanadi. 0 qo'yilsa, faqat o'tilgan darslar puli so'raladi. Standart: 50%. 01.11.2026 dan ishlaydi. Shartnoma 3.2."
            locked={!isCeo}
            control={
              <NumberSetting
                id="admissionMinPaidPercent"
                saved={settings["payment.admissionMinPaidPercent"] ?? 50}
                max={100}
                unit="%"
                rangeError="Foiz 0 dan 100 gacha bo'lgan butun son bo'lishi kerak"
                disabled={!isCeo || saving || !admissionOn}
                onSave={(v) => saveField({ admissionMinPaidPercent: v })}
              />
            }
          />
          <SettingRow
            label="To'lov tugashidan oldin eslatma"
            saving={savingKey === "paidThroughReminderDays"}
            htmlFor="paidThroughReminderDays"
            hint="Puli yetmaydigan birinchi darsdan shuncha kun oldin har kuni 20:00 da Telegram'da eslatma boradi."
            details="To'lov kelsa, eslatma to'xtaydi. 0 qo'yilsa, eslatma yuborilmaydi. Standart: 3 kun. Shartnoma 3.7."
            locked={!isCeo}
            control={
              <NumberSetting
                id="paidThroughReminderDays"
                saved={settings["payment.paidThroughReminderDays"] ?? 3}
                max={10}
                unit="kun"
                rangeError="Kun 0 dan 10 gacha bo'lgan butun son bo'lishi kerak"
                disabled={!isCeo || saving || !admissionOn}
                onSave={(v) => saveField({ paidThroughReminderDays: v })}
              />
            }
          />
        </SettingRow>
        <SettingRow
          label="O'quvchiga oylik to'lov xabari"
          saving={savingKey === "monthlyNoticesEnabled"}
          hint="Hisob kuni o'quvchiga Telegram'da shu oy uchun qancha to'lash kerakligi yuboriladi."
          details="To'lamaganlarga oyning 2-darsidan bir kun oldin eslatma ham boradi. Ikkalasi soat 20:00 dagi kunlik xabar bilan keladi. O'chirilsa, bu ikki xabar yuborilmaydi. Standart holat: yoqilgan."
          locked={!isCeo}
          control={
            <Switch
              checked={settings["payment.monthlyNoticesEnabled"]}
              disabled={!isCeo || saving}
              aria-label="O'quvchiga oylik to'lov xabari"
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
      <SettingsSection title="O'quvchi ketganda">
        <SettingRow
          label="Pul qaytarilmaydigan chegara"
          saving={savingKey === "noRefundAfterPercent"}
          htmlFor="noRefundAfterPercent"
          hint="O'quvchi ketganda oy darslarining shu qismidan ko'pi o'tgan bo'lsa, oy puli qaytarilmaydi."
          details="Kamroq o'tgan bo'lsa, o'tilmagan darslar puli qaytadi. Guruhdan chiqarish va chetlatishga tegishli. 01.10.2026 dan chiqqanlarga qo'llanadi. Shartnoma 6.2."
          locked={!isCeo}
          control={
            <NumberSetting
              id="noRefundAfterPercent"
              saved={settings["payment.noRefundAfterPercent"]}
              max={100}
              unit="%"
              rangeError="Foiz 0 dan 100 gacha bo'lgan butun son bo'lishi kerak"
              disabled={!isCeo || saving}
              onSave={(v) =>
                setConfirm({
                  title: "Pul qaytarilmaydigan chegarani o'zgartirasizmi?",
                  lines: [
                    `Yangi chegara: ${v}%.`,
                    "O'quvchi ketganda qancha pul qaytishi shunga qarab hisoblanadi. 01.10.2026 dan chiqqanlarga qo'llanadi.",
                  ],
                  action: "O'zgartirish",
                  run: () => saveField({ noRefundAfterPercent: v }),
                })
              }
            />
          }
        />
        <SettingRow
          label="Sinov darsi"
          saving={savingKey === "trialLessonEnabled"}
          hint="1 tadan ko'p darsga kelmagan o'quvchi ketsa, oy puli to'liq qaytadi."
          details="«Keldi» va «Kechikdi» belgilari sanaladi. Qarzi 0 bo'ladi, ustozga o'sha oy darslari uchun haq yozilmaydi. O'chirilsa, yuqoridagi foiz qoidasi ishlaydi. Standart holat: yoqilgan. Shartnoma 3.5."
          locked={!isCeo}
          control={
            <Switch
              checked={settings["payment.trialLessonEnabled"]}
              aria-label="Sinov darsi"
              disabled={!isCeo || saving}
              onCheckedChange={(checked) =>
                saveField({ trialLessonEnabled: checked })
              }
            />
          }
        />
        <SettingRow
          label="Qarz kechirishga ruxsat"
          saving={savingKey === "debtWriteOffEnabled"}
          hint="O'chiq bo'lsa, qarzni hech kim kechira olmaydi. Yoqilsa, administrator sabab yozib kechiradi."
          details="O'chiq (standart holat) bo'lsa, qarz hech qachon kechirilmaydi: guruhdan chiqarish oynasidagi va profildagi kechirish tugmasi ishlamaydi, qarz butun tarixi bilan joyida qoladi. Yoqilsa, administrator sabab yozib va summani qayta terib kechiradi."
          locked={!isCeo}
          control={
            <Switch
              checked={settings["payment.debtWriteOffEnabled"]}
              disabled={!isCeo || saving}
              aria-label="Qarz kechirishga ruxsat"
              onCheckedChange={(checked) =>
                setConfirm({
                  title: checked
                    ? "Qarz kechirishni yoqasizmi?"
                    : "Qarz kechirishni o'chirasizmi?",
                  lines: checked
                    ? [
                        "Administrator sabab yozib va summani qayta terib, o'quvchi qarzini kechira oladi.",
                        "Kechirilgan qarz qaytarilmaydi.",
                      ]
                    : [
                        "Qarzni hech kim kechira olmaydi. Kechirish tugmalari ishlamaydi.",
                      ],
                  action: checked ? "Yoqish" : "O'chirish",
                  run: () => saveField({ debtWriteOffEnabled: checked }),
                })
              }
            />
          }
        />
      </SettingsSection>

      {/* Davomat oynasi (ADR-0047) — companyLevelOnly. */}
      <SettingsSection title="Davomat">
        <SettingRow
          label="Davomat ochilish vaqti"
          saving={savingKey === "attendanceOpensMinutesBefore"}
          htmlFor="attendanceOpensMinutesBefore"
          hint="Yangi davomat dars boshlanishidan shuncha oldin ochiladi va dars tugashi bilan yopiladi."
          details="Barcha rollar uchun bir xil. Olingan davomatni markaz rahbari, filial direktori va administrator dars tugagach ham tuzata oladi. Standart: 10 daqiqa."
          locked={!isCeo}
          control={
            <NumberSetting
              id="attendanceOpensMinutesBefore"
              saved={settings["payment.attendanceOpensMinutesBefore"]}
              max={60}
              unit="daqiqa"
              rangeError="Daqiqa 0 dan 60 gacha bo'lgan butun son bo'lishi kerak"
              disabled={!isCeo || saving}
              onSave={(v) => saveField({ attendanceOpensMinutesBefore: v })}
            />
          }
        />
      </SettingsSection>

      <InfoDialog
        open={aboutOpen}
        onOpenChange={setAboutOpen}
        title="Bu sahifa nima qiladi?"
      >
        <p>
          Bu yerda to&apos;lov hisobi va darsga qo&apos;yish qoidalari
          boshqariladi: oylik hisob kuni, sababli darslar, to&apos;lamagan
          o&apos;quvchilar, o&apos;quvchi ketganda pulni qaytarish va davomat
          vaqti.
        </p>
        <p>
          Qulf belgili sozlamalar butun kompaniya uchun bitta, ularni faqat
          markaz rahbari o&apos;zgartiradi.
        </p>
        <p>
          Raqam yozilsa, «Saqlash» bosilmaguncha hech narsa o&apos;zgarmaydi.
          Yoqish va o&apos;chirish tugmalari darhol saqlanadi. Pulga ta&apos;sir
          qiladigan o&apos;zgarishlar oldin so&apos;raladi.
        </p>
        <p>Har qatordagi «i» tugmasi sozlama haqida batafsil aytadi.</p>
      </InfoDialog>

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {confirm?.lines.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirm?.run()}>
              {confirm?.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
