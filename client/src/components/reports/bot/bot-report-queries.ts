"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type { BotList, BotSummary } from "./bot-report-types";
import type { listParams } from "./bot-report-url";

/** Cards and the standing figures; a month change keeps the old answer on screen until the new one lands. The channel is one for the whole company, so the header branch is not in the key. */
export function useBotSummary(month: string) {
  return useQuery({
    queryKey: ["bot-report-summary", month],
    queryFn: () => api.get<BotSummary>("/telegram/channel-report/summary", { params: { month } }).then((r) => r.data),
    staleTime: 0,
    placeholderData: keepPreviousData,
  });
}

/** The month's cohort, one page. */
export function useBotList(params: ReturnType<typeof listParams>) {
  return useQuery({
    queryKey: ["bot-report-list", params],
    queryFn: () => api.get<BotList>("/telegram/channel-report/list", { params }).then((r) => r.data),
    staleTime: 0,
  });
}
