import { Suspense } from "react";
import { GroupsClient } from "@/components/groups/groups-client";
import { GroupsHeading } from "@/components/groups/groups-heading";

export default function GroupsPage() {
  return (
    <div className="space-y-6">
      <GroupsHeading />
      <Suspense>
        <GroupsClient />
      </Suspense>
    </div>
  );
}
