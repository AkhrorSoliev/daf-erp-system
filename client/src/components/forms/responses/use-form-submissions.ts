"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useAuth } from "@/hooks/use-auth";
import { listParam, useUrlFilters } from "@/hooks/use-url-filters";
import {
  buildSubmissionsCsv,
  submissionsCsvFileName,
  withCalled,
} from "./submission-format";
import type { SubmissionsExport, SubmissionsResponse } from "./types";

export const SUBMISSION_FILTER_SCHEMA = {
  stage: { type: "string" as const, defaultValue: "" },
  source: { type: "array" as const, defaultValue: [] as string[] },
  search: { type: "string" as const, defaultValue: "" },
  startDate: { type: "string" as const, defaultValue: "" },
  endDate: { type: "string" as const, defaultValue: "" },
  page: { type: "number" as const, defaultValue: 1 },
  pageSize: { type: "number" as const, defaultValue: 10 },
};

export function useFormSubmissions(formId: string) {
  const { filters, setFilters, resetFilters } = useUrlFilters(
    SUBMISSION_FILTER_SCHEMA,
  );
  const user = useAuth((s) => s.user);
  const [result, setResult] = useState<SubmissionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // «Bekor qilish» toast'i qator o'zgarganidan keyin chaqiriladi — eng oxirgi
  // holatni o'qish uchun.
  const latest = useRef<SubmissionsResponse | null>(null);
  useEffect(() => {
    latest.current = result;
  }, [result]);

  const queryParams = useMemo(
    () => ({
      stage: filters.stage || undefined,
      source: listParam(filters.source),
      search: filters.search.trim() || undefined,
      startDate: filters.startDate || undefined,
      endDate: filters.endDate || undefined,
    }),
    [filters.stage, filters.source, filters.search, filters.startDate, filters.endDate],
  );

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<SubmissionsResponse>(
        `/custom-forms/${formId}/submissions`,
        {
          params: {
            ...queryParams,
            page: filters.page,
            pageSize: filters.pageSize,
          },
        },
      );
      setResult(data);
    } catch (error) {
      toast.error(getErrorMessage(error, "Javoblarni yuklashda xatolik"));
    } finally {
      setLoading(false);
    }
  }, [formId, queryParams, filters.page, filters.pageSize]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const toggleCalled = useCallback(
    async (rowId: string, called: boolean): Promise<boolean> => {
      const row = latest.current?.data.find((r) => r.id === rowId);
      if (!row?.lead) return false;
      const previous = { calledAt: row.lead.calledAt, calledBy: row.lead.calledBy };
      const caller = user
        ? { id: user.id, firstName: user.firstName, lastName: user.lastName }
        : null;
      const optimisticAt = called ? new Date().toISOString() : null;
      const optimisticBy = called ? caller : null;

      setResult((cur) => cur && withCalled(cur, rowId, optimisticAt, optimisticBy));
      try {
        await api.patch(`/leads/${row.lead.id}/called`, { called });
        return true;
      } catch (error) {
        setResult((cur) => {
          if (!cur) return cur;
          // A refetch (triggered by a filter/page change while this PATCH was
          // in flight) may have already replaced `cur` with a fresh server
          // payload. Roll back only if the row still shows OUR optimistic
          // write — otherwise the fresh data is newer than `previous` and
          // must not be clobbered by this stale pre-click snapshot.
          const current = cur.data.find((r) => r.id === rowId);
          if (!current?.lead || current.lead.calledAt !== optimisticAt) {
            return cur;
          }
          return withCalled(cur, rowId, previous.calledAt, previous.calledBy);
        });
        toast.error(
          getErrorMessage(error, "Qo'ng'iroq belgisini saqlashda xatolik"),
        );
        return false;
      }
    },
    [user],
  );

  const exportCsv = useCallback(
    async (title: string) => {
      setExporting(true);
      try {
        const { data } = await api.get<SubmissionsExport>(
          `/custom-forms/${formId}/submissions/export`,
          { params: queryParams },
        );
        downloadCsv(
          buildSubmissionsCsv(data),
          submissionsCsvFileName(title, new Date()),
        );
        toast.success(`${data.data.length} ta javob yuklab olindi`);
      } catch (error) {
        toast.error(getErrorMessage(error, "CSV tayyorlashda xatolik"));
      } finally {
        setExporting(false);
      }
    },
    [formId, queryParams],
  );

  return {
    filters,
    setFilters,
    resetFilters,
    result,
    loading,
    refetch,
    toggleCalled,
    exporting,
    exportCsv,
  };
}

export type FormSubmissionsState = ReturnType<typeof useFormSubmissions>;

function downloadCsv(content: string, fileName: string) {
  const url = URL.createObjectURL(
    new Blob([content], { type: "text/csv;charset=utf-8;" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
