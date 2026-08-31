"use client";

import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";
import {
  readFilters,
  writeFilters,
  type FilterSchema,
  type ParamConfig,
} from "@/lib/url-filter-params";

export type { FilterSchema, ParamConfig };
export { listParam } from "@/lib/url-filter-params";

type FilterValues<T extends FilterSchema> = {
  [K in keyof T]: T[K]["type"] extends "number"
    ? number
    : T[K]["type"] extends "array"
      ? string[]
      : string;
};

export type FilterValue = string | number | string[];

export function useUrlFilters<T extends FilterSchema>(schema: T) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  /**
   * Memo primitiv so'rov satriga bog'lanadi, `searchParams` obyektiga emas.
   * Massiv filtri har render'da yangi havola bo'lib qolsa, uni `useEffect`
   * bog'liqliklariga qo'ygan sahifa cheksiz qayta so'rov yuboradi; satr kalit
   * esa faqat URL haqiqatan o'zgarganda qayta hisoblatadi.
   */
  const queryString = searchParams.toString();

  const filters = useMemo(
    () =>
      readFilters(schema, new URLSearchParams(queryString)) as FilterValues<T>,
    [queryString, schema],
  );

  const buildUrl = useCallback(
    (updates: Partial<FilterValues<T>>) => {
      const params = writeFilters(schema, new URLSearchParams(queryString), {
        ...filters,
        ...updates,
      });
      const qs = params.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [queryString, pathname, schema, filters],
  );

  const setFilter = useCallback(
    (key: keyof T & string, value: FilterValue) => {
      router.replace(buildUrl({ [key]: value } as Partial<FilterValues<T>>));
    },
    [router, buildUrl],
  );

  const setFilters = useCallback(
    (updates: Partial<FilterValues<T>>) => {
      router.replace(buildUrl(updates));
    },
    [router, buildUrl],
  );

  const resetFilters = useCallback(() => {
    router.replace(pathname);
  }, [router, pathname]);

  return { filters, setFilter, setFilters, resetFilters };
}
