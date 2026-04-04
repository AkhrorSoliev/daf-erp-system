import { GroupsClient } from "@/components/groups/groups-client";

export default function GroupsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-xl sm:text-2xl font-bold tracking-tight">
          Guruhlar
        </h1>
        <p className="text-muted-foreground">
          Barcha guruhlarni boshqarish
        </p>
      </div>
      <GroupsClient />
    </div>
  );
}
