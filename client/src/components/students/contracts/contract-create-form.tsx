"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useT } from "@/i18n/context";
import { ContractCourseExtras } from "./contract-course-extras";
import { ContractCoursesPicker } from "./contract-courses-picker";
import { ContractCustomerFields } from "./contract-customer-fields";
import {
  profileConflicts,
  profileUpdatesBody,
  unsettled,
  type ProfileField,
} from "./contract-profile";
import {
  courseDraftFromPrefill,
  createBody,
  customerDraft,
  dateValue,
  dayString,
  formProblem,
  initialKind,
  isMinor,
  type CourseDraft,
  type CustomerDraft,
} from "./contract-rules";
import type { ContractPrefill, ContractView, CustomerKind } from "./contract-types";

interface Props {
  studentId: number;
  prefill: ContractPrefill;
  onCancel: () => void;
  onSaved: (view: ContractView, studentChanged: boolean) => void;
}

export function ContractCreateForm({ studentId, prefill, onCancel, onSaved }: Props) {
  const t = useT();
  const free = prefill.courses.filter((c) => c.contractNumber === null);
  const [enrollmentIds, setEnrollmentIds] = useState<string[]>(() =>
    free.length === 1 ? [free[0].enrollmentId] : [],
  );
  const [birthDate, setBirthDate] = useState("");
  const [customer, setCustomer] = useState<CustomerDraft>(() =>
    customerDraft(initialKind(prefill), prefill),
  );
  const [courses, setCourses] = useState<Record<string, CourseDraft>>(() =>
    Object.fromEntries(prefill.courses.map((c) => [c.enrollmentId, courseDraftFromPrefill(c)])),
  );
  const [saving, setSaving] = useState(false);
  const [profileUpdates, setProfileUpdates] = useState<ProfileField[]>([]);

  const needsBirthDate = prefill.student.birthDate === null;
  const minor = prefill.student.isMinor ?? isMinor(birthDate || null, prefill.today);
  const conflicts = profileConflicts(customer, prefill.student);
  const problem = formProblem(
    {
      enrollmentIds,
      needsBirthDate,
      birthDate,
      customer,
      minor,
      branchMissing: prefill.branch.missing,
      unsettledProfile: unsettled(conflicts, profileUpdates).length,
    },
    t,
  );

  const onBirthDate = (value: string) => {
    setBirthDate(value);
    if (isMinor(value || null, prefill.today) && customer.kind === "SELF") {
      setCustomer(customerDraft("PARENT", prefill));
    }
  };
  const onKind = (kind: CustomerKind) => setCustomer(customerDraft(kind, prefill));

  const submit = async () => {
    if (problem) return;
    setSaving(true);
    try {
      const { data } = await api.post<ContractView>(
        "/contract-documents",
        createBody({
          studentId,
          enrollmentIds,
          birthDate,
          customer,
          courses,
          profileUpdates: profileUpdatesBody(conflicts, profileUpdates),
        }),
      );
      toast.success(t("Shartnoma {number} tuzildi", { number: data.number }));
      // The contract may have filled the profile: the profile card reloads.
      onSaved(data, true);
    } catch (err) {
      toast.error(getErrorMessage(err, t("Shartnoma tuzishda xatolik yuz berdi")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-4">
        {prefill.branch.missing.length > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>
              {/* The branch name and the missing settings are data; only the sentence is translated. */}
              {t(
                "{branch} sozlamasida {fields} kiritilmagan. Sozlamalar → Filiallar bo'limida to'ldiring, keyin shartnoma tuzing.",
                { branch: prefill.branch.name, fields: prefill.branch.missing.join(", ") },
              )}
            </p>
          </div>
        )}

        <ContractCoursesPicker
          courses={prefill.courses}
          value={enrollmentIds}
          onChange={setEnrollmentIds}
        />

        {needsBirthDate && (
          <section className="space-y-1.5">
            <Label>{t("O'quvchining tug'ilgan sanasi")}</Label>
            <DatePicker
              value={dateValue(birthDate)}
              onChange={(d) => onBirthDate(dayString(d))}
              maxDate={new Date()}
            />
            <p className="text-xs text-muted-foreground">
              {t(
                "Profilda yo'q — shu yerda kiriting, profilga ham yoziladi. 18 yoshdan kichik o'quvchi uchun Buyurtmachi ota-ona yoki vasiy bo'ladi.",
              )}
            </p>
          </section>
        )}

        <ContractCustomerFields
          value={customer}
          onChange={setCustomer}
          onKindChange={onKind}
          minor={minor}
          profile={prefill.student}
          profileUpdates={profileUpdates}
          onProfileUpdatesChange={setProfileUpdates}
        />

        {enrollmentIds.map((id) => {
          const c = prefill.courses.find((x) => x.enrollmentId === id);
          if (!c) return null;
          return (
            <ContractCourseExtras
              key={id}
              idPrefix={`create-${id}`}
              title={c.courseName}
              subtitle={c.groupName}
              discountPercent={c.discountPercent}
              value={courses[id]}
              onChange={(next) => setCourses((prev) => ({ ...prev, [id]: next }))}
            />
          );
        })}
      </div>
      <DialogFooter className="items-center border-t px-6 py-4">
        {problem && <p className="mr-auto text-xs text-muted-foreground">{problem}</p>}
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          {t("Bekor qilish")}
        </Button>
        <Button onClick={submit} disabled={saving || problem !== null}>
          {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
          {t("Saqlash")}
        </Button>
      </DialogFooter>
    </>
  );
}
