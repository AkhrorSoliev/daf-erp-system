"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import toast from "react-hot-toast";
import { HelpCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { PriceInput } from "@/components/ui/price-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useEditCourse } from "@/hooks/use-edit-course";
import type { Course } from "@/hooks/use-edit-course";
import { useAuth } from "@/hooks/use-auth";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { PAYMENT_MODEL_LABELS, type PaymentModel } from "@/lib/payment-model";
import { coursePriceLabel } from "@/lib/course-terms";

interface EditCourseFormProps {
  course: Course | null;
  onClose: () => void;
  onSaved?: (course: Course) => void;
  formId: string;
  isAdd?: boolean;
}

// Yangi kurs qo'shishda "aniq belgilamayman, sozlamadan olsin" tanlovi —
// backend `CreateCourseDto.paymentModel` optional, berilmasa
// `payment.defaultModel` sozlamasi ishlatiladi (`CoursesService.create`).
const AUTO_MODEL = "AUTO" as const;
type PaymentModelChoice = PaymentModel | typeof AUTO_MODEL;

interface FormValues {
  name: string;
  description: string;
  lessonPaymentCount: number;
  lessonMinutes: number;
  price: string;
  isActive: boolean;
  paymentModel: PaymentModelChoice;
}

function courseFromResponse(data: {
  id: string;
  name: string;
  description: string | null;
  lessonDuration: number | null;
  lessonMinutes: number | null;
  courseDuration: number | null;
  lessonPaymentCount: number | null;
  price: number;
  isActive: boolean;
  branchId: number | null;
  paymentModel: PaymentModel;
}): Course {
  return {
    id: data.id,
    name: data.name,
    description: data.description,
    lessonDuration: data.lessonDuration,
    lessonMinutes: data.lessonMinutes,
    courseDuration: data.courseDuration,
    lessonPaymentCount: data.lessonPaymentCount,
    price: data.price,
    isActive: data.isActive,
    branchId: data.branchId,
    paymentModel: data.paymentModel,
  };
}

export function EditCourseForm({
  course,
  onClose,
  onSaved,
  formId,
  isAdd,
}: EditCourseFormProps) {
  const setSubmitting = useEditCourse((s) => s.setSubmitting);
  const submitting = useEditCourse((s) => s.submitting);
  // Backend `PATCH /courses/:id` Administratorga BOSHQA maydonlarni
  // (nomi, narxi...) tahrirlashga ruxsat beradi, lekin `paymentModel`ni
  // faqat CEO/Filial direktoridan qabul qiladi (kursning har bir guruhini
  // birdan boshqa hisob-kitob qoidasiga o'tkazadigan pul qarori). Shu
  // sabab bu boshqaruv Administrator uchun butunlay YASHIRILADI — nafaqat
  // o'chirilgan, chunki ko'rinib turgan-lekin-bosilmaydigan tugma "nega
  // ishlamayapti" degan savol tug'diradi (backend guardiga mos: `server/
  // src/courses/courses.controller.ts`, PAYMENT_MODEL_ROLES).
  const authUser = useAuth((s) => s.user);
  const canEditPaymentModel =
    authUser?.roles.some((r) => [1, 2].includes(r.id)) ?? false;

  // Guruhlar soni — to'lov modelini almashtirish tasdig'ida "bu N ta
  // guruhga ta'sir qiladi" deb aniq aytish uchun. Ro'yxat sahifasida bu son
  // yo'q (backend uni /courses ro'yxatida qaytarmaydi — sanash har bir
  // qatorda qo'shimcha so'rov bo'lardi), shuning uchun tahrirlash oynasi
  // ochilganda o'zi so'raydi.
  const [groupCount, setGroupCount] = useState<number | null>(null);

  useEffect(() => {
    if (isAdd || !course) return;
    let cancelled = false;
    api
      .get(`/courses/${course.id}`)
      .then(({ data }) => {
        if (!cancelled) setGroupCount(data._count?.groups ?? 0);
      })
      .catch(() => {
        // Jim o'tkazib yuboriladi — tasdiq oynasi son bilmasa ham ochiladi,
        // faqat "guruhlarga ta'sir qiladi" deb umumiy ogohlantiradi.
      });
    return () => {
      cancelled = true;
    };
  }, [isAdd, course]);

  const form = useForm<FormValues>({
    defaultValues: {
      name: course?.name ?? "",
      description: course?.description ?? "",
      lessonPaymentCount: course?.lessonPaymentCount ?? 12,
      lessonMinutes: course?.lessonMinutes ?? 90,
      price: course ? String(course.price) : "",
      isActive: course?.isActive ?? true,
      paymentModel: course?.paymentModel ?? AUTO_MODEL,
    },
  });

  // «Standart sozlama bo'yicha» tanlanganda forma tizimdagi standart
  // modelga moslashadi. Sozlamani faqat CEO/Filial direktori o'qiy oladi
  // (`GET /settings/payment`); Administrator uchun model noma'lum bo'lib
  // qoladi va forma betaraf ko'rinadi.
  const [defaultModel, setDefaultModel] = useState<PaymentModel | null>(null);
  useEffect(() => {
    if (!isAdd || !canEditPaymentModel) return;
    let cancelled = false;
    api
      .get("/settings/payment")
      .then(({ data }) => {
        if (!cancelled) setDefaultModel(data["payment.defaultModel"] ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAdd, canEditPaymentModel]);
  const chosenModel = form.watch("paymentModel");
  const effectiveModel: PaymentModel | null =
    chosenModel === AUTO_MODEL ? defaultModel : chosenModel;
  const isMonthly = effectiveModel === "MONTHLY";

  // To'lov modelini almashtirish pul bilan bog'liq qaror — jim ichki
  // o'zgarish emas. Model haqiqatan ham o'zgargan bo'lsa, submit to'g'ridan
  // to'g'ri saqlamaydi: tasdiq oynasini ochadi va aniq shu qiymatlarni
  // ushlab turadi, "Ha" bosilgach saqlaydi.
  const [pendingValues, setPendingValues] = useState<FormValues | null>(null);

  const performSave = async (values: FormValues) => {
    setSubmitting(true);
    try {
      const priceNum = Number(String(values.price).replace(/\D/g, ""));

      if (isAdd) {
        const branchId = useBranchSwitcher.getState().selectedBranch?.id;
        const companyId = localStorage.getItem("companyId");

        const { data } = await api.post("/courses", {
          name: values.name,
          description: values.description || undefined,
          lessonPaymentCount: values.lessonPaymentCount || undefined,
          lessonMinutes: values.lessonMinutes || undefined,
          price: priceNum,
          branchId,
          companyId: companyId ? Number(companyId) : undefined,
          paymentModel:
            values.paymentModel === AUTO_MODEL
              ? undefined
              : values.paymentModel,
        });

        toast.success("Yangi kurs muvaffaqiyatli qo'shildi");
        onSaved?.(courseFromResponse(data));
      } else {
        if (!course) return;
        const { data } = await api.patch(`/courses/${course.id}`, {
          name: values.name,
          description: values.description || undefined,
          lessonPaymentCount: values.lessonPaymentCount || undefined,
          lessonMinutes: values.lessonMinutes || undefined,
          price: priceNum,
          isActive: values.isActive,
          // Administrator uchun bu maydon formada ko'rinmaydi (yuqoridagi
          // `canEditPaymentModel`) — shuning uchun payloadga ham
          // qo'shilmaydi. Aks holda o'zgarmagan qiymat ham yuborilib,
          // backend `paymentModel !== undefined` tekshiruviga ilinib
          // qolardi va oddiy nom/narx tahrirlashini ham 403 qilardi.
          paymentModel: canEditPaymentModel ? values.paymentModel : undefined,
        });

        toast.success("Kurs muvaffaqiyatli yangilandi");
        onSaved?.(courseFromResponse(data));
      }
      onClose();
    } catch (error) {
      toast.error(
        getErrorMessage(
          error,
          isAdd
            ? "Kurs qo'shishda xatolik yuz berdi"
            : "Kursni yangilashda xatolik yuz berdi",
        ),
      );
    } finally {
      setSubmitting(false);
      setPendingValues(null);
    }
  };

  const onSubmit = (values: FormValues) => {
    const modelChanged =
      !isAdd && course && values.paymentModel !== course.paymentModel;
    if (modelChanged) {
      setPendingValues(values);
      return;
    }
    performSave(values);
  };

  const handleConfirmModelChange = () => {
    if (!pendingValues) return;
    performSave(pendingValues);
  };

  const handleCancelModelChange = () => {
    if (course) form.setValue("paymentModel", course.paymentModel);
    setPendingValues(null);
  };

  return (
    <>
      <form
        id={formId}
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col"
      >
        <section className="space-y-5 px-6 py-5">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Kurs ma&apos;lumotlari
          </h3>

          <div className="space-y-1.5">
            <Label htmlFor="name">Kurs nomi</Label>
            <Input
              id="name"
              placeholder="Kurs nomi"
              {...form.register("name", {
                required: "Kurs nomi kiritilishi shart",
              })}
            />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Tavsif</Label>
            <Textarea
              id="description"
              placeholder="Kurs haqida qisqacha ma'lumot"
              rows={3}
              {...form.register("description")}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Oylik to'lovda sikl hajmi o'qilmaydi — ko'rsatilmaydi. */}
            {!isMonthly && (
              <div className="space-y-1.5">
                <Label
                  htmlFor="lessonPaymentCount"
                  className="flex items-center gap-1.5"
                >
                  Sikl darslari
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="size-3.5 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      Bitta to&apos;lov sikli necha darsni qoplaydi (odatda 12,
                      intensiv kurslar uchun 20)
                    </TooltipContent>
                  </Tooltip>
                </Label>
                <Input
                  id="lessonPaymentCount"
                  type="number"
                  min={1}
                  max={50}
                  placeholder="12"
                  {...form.register("lessonPaymentCount", {
                    valueAsNumber: true,
                  })}
                />
                {/* Yumshoq ogohlantirish — bloklamaydi, faqat odatiy bo'lmagan
                  qiymat (12/20 emas) kiritilganda diqqatni tortadi. */}
                {(() => {
                  const v = form.watch("lessonPaymentCount");
                  return typeof v === "number" &&
                    v > 0 &&
                    v !== 12 &&
                    v !== 20 ? (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      Odatiy emas — odatda 12 yoki 20. Tekshiring.
                    </p>
                  ) : null;
                })()}
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="lessonMinutes">Dars davomiyligi (daq)</Label>
              <Input
                id="lessonMinutes"
                type="number"
                min={1}
                placeholder="90"
                {...form.register("lessonMinutes", { valueAsNumber: true })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{coursePriceLabel(effectiveModel)}</Label>
            <Controller
              control={form.control}
              name="price"
              render={({ field }) => (
                <PriceInput
                  value={field.value}
                  onChange={field.onChange}
                  name={field.name}
                />
              )}
            />
            {isMonthly && (
              <p className="text-xs text-muted-foreground">
                Bitta dars narxi har oy guruh jadvalidan chiqadi: oylik narx ÷
                o&apos;sha oydagi darslar soni.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="paymentModel" className="flex items-center gap-1.5">
              To&apos;lov modeli
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="size-3.5 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  &laquo;Sikl&raquo; — belgilangan son dars uchun bir marta
                  to&apos;lanadi. &laquo;Oylik&raquo; — har kalendar oy uchun
                  alohida hisob-kitob yaratiladi.
                </TooltipContent>
              </Tooltip>
            </Label>
            <Controller
              control={form.control}
              name="paymentModel"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="paymentModel" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {isAdd && (
                      <SelectItem value={AUTO_MODEL}>
                        Standart sozlama bo&apos;yicha (tavsiya etiladi)
                      </SelectItem>
                    )}
                    <SelectItem value="LESSON_PACK">
                      {PAYMENT_MODEL_LABELS.LESSON_PACK}
                    </SelectItem>
                    <SelectItem value="MONTHLY">
                      {PAYMENT_MODEL_LABELS.MONTHLY}
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
            {!isAdd && (
              <p className="text-xs text-muted-foreground">
                Bu kursdagi barcha guruhlarga tegishli — almashtirsangiz,
                saqlashdan oldin tasdiqlash so&apos;raladi.
              </p>
            )}
          </div>

          {!isAdd && (
            <div className="flex items-center justify-between rounded-lg border px-4 py-3">
              <div>
                <p className="text-sm font-medium">Holati</p>
                <p className="text-xs text-muted-foreground">
                  Kurs faol yoki nofaol
                </p>
              </div>
              <Switch
                checked={form.watch("isActive")}
                onCheckedChange={(checked) =>
                  form.setValue("isActive", checked)
                }
              />
            </div>
          )}
        </section>
      </form>

      <AlertDialog
        open={!!pendingValues}
        onOpenChange={(open) => !open && handleCancelModelChange()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              To&apos;lov modelini almashtirish
            </AlertDialogTitle>
            <AlertDialogDescription>
              {course && pendingValues && (
                <>
                  &laquo;{course.name}&raquo; kursini{" "}
                  <strong>{PAYMENT_MODEL_LABELS[course.paymentModel]}</strong>
                  dan{" "}
                  <strong>
                    {
                      PAYMENT_MODEL_LABELS[
                        pendingValues.paymentModel as PaymentModel
                      ]
                    }
                  </strong>
                  ga o&apos;tkazasiz.{" "}
                  {groupCount === 0 ? (
                    <>
                      Bu kursda hozircha guruh yo&apos;q — hech kimga
                      ta&apos;sir qilmaydi.
                    </>
                  ) : groupCount !== null ? (
                    <>
                      Bu kursdagi{" "}
                      <strong>{groupCount} ta guruhning barchasi</strong> darhol
                      yangi to&apos;lov qoidasiga o&apos;tadi — bu pul bilan
                      bog&apos;liq qaror, ehtiyot bo&apos;ling.
                    </>
                  ) : (
                    <>
                      Bu kursdan foydalanadigan barcha guruhlar darhol yangi
                      to&apos;lov qoidasiga o&apos;tadi — bu pul bilan
                      bog&apos;liq qaror, ehtiyot bo&apos;ling.
                    </>
                  )}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={submitting}
              onClick={handleCancelModelChange}
            >
              Bekor qilish
            </AlertDialogCancel>
            {/* Oddiy Button — AlertDialogAction emas: bu amal asinxron
                (PATCH so'rovi), Radixning o'z-o'zidan yopish xatti-harakati
                bilan to'qnashadi (`onOpenChange` cancel oqimini ham
                chaqirib yuboradi). Xuddi shu naqsh: leads/delete-confirm-dialog.tsx. */}
            <Button
              type="button"
              disabled={submitting}
              onClick={handleConfirmModelChange}
            >
              {submitting && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              Ha, o&apos;zgartirilsin
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
