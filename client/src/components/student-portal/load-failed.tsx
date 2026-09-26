"use client";

import { CloudSlash, WifiSlash } from "@phosphor-icons/react";
import { Button, EmptyState } from "./lumio";

/**
 * What a portal screen shows when its query has no data and cannot get any
 * right now; `loadState` in `lib/load-state.ts` decides when that is. Never
 * the screen's empty state: until 2026-09 a failed request on Jadval, Davomat
 * and To'lovlar read as "no lessons this week" / "no attendance yet" / "no
 * transactions yet", so a student offline was told they had a free week.
 */
export function LoadFailed({
  query,
  className,
}: {
  query: {
    /** Waiting for a connection; React Query resumes it by itself. */
    isPaused: boolean;
    refetch: () => unknown;
  };
  className?: string;
}) {
  if (query.isPaused) {
    return (
      <EmptyState
        className={className}
        icon={<WifiSlash weight="bold" />}
        title="Internet aloqasi yo'q"
        description="Internetga ulanganingizda ma'lumot o'zi yuklanadi."
      />
    );
  }

  // No loading state on the button: refetching a query that has no data puts
  // it back to pending, so the screen shows its skeleton while the retry runs.
  return (
    <EmptyState
      className={className}
      icon={<CloudSlash weight="bold" />}
      title="Ma'lumotni yuklab bo'lmadi"
      description="Internet aloqasini tekshirib, qayta urinib ko'ring."
      action={
        <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
          Qayta urinish
        </Button>
      }
    />
  );
}
