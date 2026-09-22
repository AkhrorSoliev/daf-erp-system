import { Suspense } from "react";
import { FormResponsesClient } from "@/components/forms/responses/form-responses-client";

export default async function FormResponsesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense>
      <FormResponsesClient formId={id} />
    </Suspense>
  );
}
