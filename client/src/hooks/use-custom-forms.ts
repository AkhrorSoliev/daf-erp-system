import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import type { FormFieldShape } from "@/lib/schemas/custom-form-schema";

export interface CustomFormSummary {
  id: string;
  slug: string;
  title: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  section: {
    id: string;
    name: string;
    column: { id: string; name: string };
  };
  source: { id: string; name: string } | null;
  submissionCount: number;
}

export interface CustomFormDetail extends CustomFormSummary {
  description: string | null;
  sectionId: string;
  sourceId: string | null;
  fields: FormFieldShape[];
  submissions: Array<{
    id: string;
    data: Record<string, unknown>;
    submittedAt: string;
    lead: { id: string; firstName: string; lastName: string } | null;
  }>;
}

export function useCustomForms(open: boolean) {
  const [forms, setForms] = useState<CustomFormSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<CustomFormSummary[]>("/custom-forms");
      setForms(data);
    } catch (error) {
      toast.error(getErrorMessage(error, "Formalarni yuklashda xatolik"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) refetch();
  }, [open, refetch]);

  return { forms, loading, refetch, setForms };
}
