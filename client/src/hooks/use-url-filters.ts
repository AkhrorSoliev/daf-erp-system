"use client";

import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";

type ParamType = "string" | "number";

interface ParamConfig {
  type: ParamType;
  defaultValue: string | number;
}

export type FilterSchema = Record<string, ParamConfig>;

type FilterValues<T extends FilterSchema> = {
  [K in keyof T]: T[K]["type"] extends "number" ? number : string;
};

export function useUrlFilters<T extends FilterSchema>(schema: T) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const filters = useMemo(() => {
    const result = {} as FilterValues<T>;
    for (const key of Object.keys(schema)) {
      const config = schema[key];
      const raw = searchParams.get(key);
      if (raw === null) {
        (result as any)[key] = config.defaultValue;
      } else if (config.type === "number") {
        const parsed = parseInt(raw, 10);
        (result as any)[key] = isNaN(parsed) ? config.defaultValue : parsed;
      } else {
        (result as any)[key] = raw;
      }
    }
    return result;
  }, [searchParams, schema]);

  const buildUrl = useCallback(
    (updates: Partial<FilterValues<T>>) => {
      const params = new URLSearchParams(searchParams.toString());
      const merged = { ...filters, ...updates };
      for (const key of Object.keys(schema)) {
        const config = schema[key];
        const value = (merged as any)[key];
        if (value === config.defaultValue || value === undefined || value === "") {
          params.delete(key);
        } else {
          params.set(key, String(value));
        }
      }
      const qs = params.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [searchParams, pathname, schema, filters],
  );

  const setFilter = useCallback(
    (key: keyof T & string, value: string | number) => {
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
