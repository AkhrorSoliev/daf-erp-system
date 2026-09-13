import { FormBuilderClient } from "@/components/forms/form-builder-client";

export default async function EditFormPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <FormBuilderClient formId={id} />;
}
