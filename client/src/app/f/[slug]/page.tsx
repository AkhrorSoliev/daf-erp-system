import { notFound } from "next/navigation";
import { PublicFormRenderer } from "@/components/forms/public-form-renderer";
import type { FormFieldShape } from "@/lib/schemas/custom-form-schema";

interface PublicFormSchema {
  title: string;
  description: string | null;
  fields: FormFieldShape[];
}

async function fetchFormSchema(slug: string): Promise<PublicFormSchema | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
  try {
    const res = await fetch(`${apiUrl}/public/forms/${slug}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as PublicFormSchema;
  } catch {
    return null;
  }
}

export default async function PublicFormPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const schema = await fetchFormSchema(slug);
  if (!schema) notFound();
  return <PublicFormRenderer slug={slug} schema={schema} />;
}
