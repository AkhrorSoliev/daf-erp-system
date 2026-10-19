import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useT } from "@/i18n/context";
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
  lastSubmittedAt: string | null;
  convertedCount: number;
  awaitingCallCount: number;
}

export interface CustomFormDetail extends CustomFormSummary {
  description: string | null;
  sectionId: string;
  sourceId: string | null;
  fields: FormFieldShape[];
}

export function useCustomForms(open: boolean) {
  const [forms, setForms] = useState<CustomFormSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const translate = useT();
  // Read in the fetch through a ref, so a language switch does not refetch.
  const tRef = useRef(translate);
  useEffect(() => {
    tRef.current = translate;
  }, [translate]);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<CustomFormSummary[]>("/custom-forms");
      setForms(data);
    } catch (error) {
      const t = tRef.current;
      toast.error(getErrorMessage(error, t("Formalarni yuklashda xatolik")));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) refetch();
  }, [open, refetch]);

  return { forms, loading, refetch, setForms };
}
