"use client";

import { useCallback, useMemo } from "react";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { format } from "date-fns";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  StudentPaymentsFilterBar,
  type StudentPaymentsFilter,
  type FilterOptions,
  type PaymentMethod,
} from "./student-payments-filter-bar";
import {
  StudentPaymentsTable,
  type StudentPaymentRow,
} from "./student-payments-table";

interface ReportResponse {
  data: StudentPaymentRow[];
  total: number;
  page: number;
  pageSize: number;
}

const PAGE_SIZES = [10, 20, 30, 40, 50];
const VALID_METHODS: readonly PaymentMethod[] = [
  "CASH",
  "PAYME",
  "CLICK",
  "UZUM",
  "TRANSFER",
];

function parseDate(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

function formatDate(d: Date | null): string | undefined {
  return d ? format(d, "yyyy-MM-dd") : undefined;
}

export function StudentPaymentsClient() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const filter = useMemo<StudentPaymentsFilter>(() => {
    const branchIdRaw = searchParams.get("branchId");
    const branchId = branchIdRaw ? Number(branchIdRaw) : null;
    return {
      branchId: branchId && !Number.isNaN(branchId) ? branchId : null,
      groupIds:
        searchParams.get("groupIds")?.split(",").filter(Boolean) ?? [],
      teacherIds:
        searchParams
          .get("teacherIds")
          ?.split(",")
          .map((v) => Number(v))
          .filter((n) => !Number.isNaN(n)) ?? [],
      methods: (
        searchParams.get("methods")?.split(",").filter(Boolean) ?? []
      ).filter((m): m is PaymentMethod =>
        VALID_METHODS.includes(m as PaymentMethod),
      ),
      courseId: searchParams.get("courseId") || null,
      rangeStart: parseDate(searchParams.get("startDate")),
      rangeEnd: parseDate(searchParams.get("endDate")),
    };
  }, [searchParams]);

  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = (() => {
    const raw = Number(searchParams.get("pageSize"));
    return PAGE_SIZES.includes(raw) ? raw : 10;
  })();

  const writeParams = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || value === "") params.delete(key);
        else params.set(key, value);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [searchParams, pathname, router],
  );

  const handleFilterChange = (next: StudentPaymentsFilter) => {
    writeParams({
      branchId: next.branchId !== null ? String(next.branchId) : undefined,
      groupIds: next.groupIds.length > 0 ? next.groupIds.join(",") : undefined,
      teacherIds:
        next.teacherIds.length > 0 ? next.teacherIds.join(",") : undefined,
      methods: next.methods.length > 0 ? next.methods.join(",") : undefined,
      courseId: next.courseId ?? undefined,
      startDate: formatDate(next.rangeStart),
      endDate: formatDate(next.rangeEnd),
      page: undefined,
    });
  };

  const handlePageSizeChange = (size: number) => {
    writeParams({
      pageSize: size === 10 ? undefined : String(size),
      page: undefined,
    });
  };

  const handlePageChange = (nextPage: number) => {
    writeParams({ page: nextPage === 1 ? undefined : String(nextPage) });
  };

  const { data: options } = useQuery<FilterOptions>({
    queryKey: ["student-payments-filter-options"],
    queryFn: () =>
      api
        .get<FilterOptions>("/reports/student-payments/filter-options")
        .then((r) => r.data),
  });

  const queryParams = {
    branchId: filter.branchId ?? undefined,
    groupIds: filter.groupIds.length > 0 ? filter.groupIds.join(",") : undefined,
    teacherIds:
      filter.teacherIds.length > 0 ? filter.teacherIds.join(",") : undefined,
    methods: filter.methods.length > 0 ? filter.methods.join(",") : undefined,
    courseId: filter.courseId ?? undefined,
    startDate: formatDate(filter.rangeStart),
    endDate: formatDate(filter.rangeEnd),
    page,
    pageSize,
  };

  const { data, isLoading, isFetching } = useQuery<ReportResponse>({
    queryKey: ["student-payments-report", queryParams],
    queryFn: () =>
      api
        .get<ReportResponse>("/reports/student-payments", {
          params: queryParams,
        })
        .then((r) => r.data),
    staleTime: 0,
  });

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(page, totalPages);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading text-xl font-bold tracking-tight">
          O&apos;quvchi to&apos;lovi
        </h2>
        <p className="text-sm text-muted-foreground">
          O&apos;quvchilar bo&apos;yicha to&apos;lov tafsilotlari
        </p>
      </div>

      <div className="flex items-center justify-between gap-2">
        <StudentPaymentsFilterBar
          value={filter}
          onChange={handleFilterChange}
          options={options}
        />
        {isFetching && !isLoading && (
          <Loader2 className="size-4 animate-spin text-muted-foreground shrink-0" />
        )}
      </div>

      <StudentPaymentsTable
        data={data?.data}
        isLoading={isLoading}
        page={clampedPage}
        pageSize={pageSize}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Sahifada:</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => handlePageSizeChange(Number(v))}
          >
            <SelectTrigger className="h-8 w-[80px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span>
            Jami:{" "}
            <span className="tabular-nums">
              {total.toLocaleString("uz-UZ")}
            </span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground tabular-nums">
            {clampedPage} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={clampedPage <= 1}
            onClick={() => handlePageChange(clampedPage - 1)}
            aria-label="Oldingi"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={clampedPage >= totalPages}
            onClick={() => handlePageChange(clampedPage + 1)}
            aria-label="Keyingi"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
