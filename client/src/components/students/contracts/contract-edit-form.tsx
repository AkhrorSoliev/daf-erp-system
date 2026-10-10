"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { ContractCourseExtras } from "./contract-course-extras";
import { ContractCustomerFields } from "./contract-customer-fields";
import {
  courseDraftFromFields,
  customerDraftFromFields,
  formProblem,
  updateBody,
  type CourseDraft,
  type CustomerDraft,
} from "./contract-rules";
import type { ContractView, CustomerKind } from "./contract-types";

interface Props {
  contract: ContractView;
  onCancel: () => void;
  onSaved: (view: ContractView) => void;
}

export function ContractEditForm({ contract, onCancel, onSaved }: Props) {
  const f = contract.fields;
  const [customer, setCustomer] = useState<CustomerDraft>(() =>
    customerDraftFromFields(f.customer),
  );
  const [courses, setCourses] = useState<Record<string, CourseDraft>>(() =>
    Object.fromEntries(f.courses.map((c) => [c.enrollmentId, courseDraftFromFields(c)])),
  );
  const [saving, setSaving] = useState(false);
  const problem = formProblem({ customer, minor: f.student.isMinor });

  // Switching the kind starts the block over; SELF takes the student's own name.
  const onKind = (kind: CustomerKind) =>
    setCustomer({
      ...customerDraftFromFields(f.customer),
      kind,
      kindOther: "",
      fullName: kind === "SELF" ? f.student.fullName : "",
      birthDate: kind === "SELF" ? f.student.birthDate : "",
    });

  const submit = async () => {
    if (problem) return;
    setSaving(true);
    try {
      const { data } = await api.patch<ContractView>(
        `/contract-documents/${contract.id}`,
        updateBody(customer, courses),
      );
      toast.success(`Shartnoma ${data.number} yangilandi`);
      onSaved(data);
    } catch (err) {
      toast.error(getErrorMessage(err, "Shartnomani saqlashda xatolik yuz berdi"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-4">
        <p className="text-sm text-muted-foreground">
          Kurs, guruh, narx va jadval shartnoma tuzilgan kuni muhrlangan va o&apos;zgarmaydi. Xato
          bo&apos;lsa, shartnomani bekor qilib, yangisini tuzing.
        </p>
        <ContractCustomerFields
          value={customer}
          onChange={setCustomer}
          onKindChange={onKind}
          minor={f.student.isMinor}
        />
        {f.courses.map((c) => (
          <ContractCourseExtras
            key={c.enrollmentId}
            idPrefix={`edit-${c.enrollmentId}`}
            title={c.courseName}
            subtitle={c.groupName}
            discountPercent={c.discountPercent}
            value={courses[c.enrollmentId]}
            onChange={(next) => setCourses((prev) => ({ ...prev, [c.enrollmentId]: next }))}
          />
        ))}
      </div>
      <DialogFooter className="items-center border-t px-6 py-4">
        {problem && <p className="mr-auto text-xs text-muted-foreground">{problem}</p>}
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          Bekor qilish
        </Button>
        <Button onClick={submit} disabled={saving || problem !== null}>
          {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
          Saqlash
        </Button>
      </DialogFooter>
    </>
  );
}
