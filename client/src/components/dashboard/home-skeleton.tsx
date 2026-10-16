import { Skeleton } from "@/components/ui/skeleton";

export function HomeSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <Skeleton className="h-[104px] rounded-lg" />
      <div className="flex flex-wrap gap-x-6 gap-y-2 px-1">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-5 w-36 rounded-sm" />
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-5">
        <Skeleton className="h-64 rounded-lg lg:col-span-3" />
        <Skeleton className="h-64 rounded-lg lg:col-span-2" />
      </div>
    </div>
  );
}
