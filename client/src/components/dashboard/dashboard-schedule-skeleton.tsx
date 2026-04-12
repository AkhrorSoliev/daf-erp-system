import { Skeleton } from "@/components/ui/skeleton";

export function DashboardScheduleSkeleton() {
  return (
    <div className="space-y-6">
      {/* Stats skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="bg-card flex items-center gap-2 sm:gap-3 rounded-lg border px-2.5 py-2 sm:p-3"
          >
            <Skeleton className="size-4 shrink-0 rounded" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-3 w-12 mb-1" />
              <Skeleton className="h-6 w-8" />
            </div>
          </div>
        ))}
      </div>

      {/* Daily schedule skeleton */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-36" />
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-lg border bg-card p-3">
            <div className="flex items-center justify-between">
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          </div>
        ))}
      </div>

      {/* Room occupancy skeleton */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-40" />
        <div className="rounded-lg border bg-card p-4">
          <div className="flex gap-3">
            <Skeleton className="h-4 w-12" />
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-4 w-20" />
            ))}
          </div>
          <div className="mt-3 space-y-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-4 w-12" />
                {[1, 2, 3, 4].map((j) => (
                  <Skeleton key={j} className="h-4 w-20" />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
