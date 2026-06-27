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
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  // Source tag carried by the share link (?source=Instagram) — attributes the
  // lead to that channel/ad on submit.
  const raw = Array.isArray(sp.source) ? sp.source[0] : sp.source;
  const source = raw?.slice(0, 100);

  const schema = await fetchFormSchema(slug);
  if (!schema) notFound();
  return <PublicFormRenderer slug={slug} schema={schema} source={source} />;
}
