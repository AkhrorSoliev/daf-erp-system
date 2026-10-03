import type { MDXComponents } from "mdx/types";
import { qollanmaMdxKomponentlari } from "@/components/qollanma/mdx-komponentlar";

// `@next/mdx` App Router'da shu faylsiz ishlamaydi (Next 16 hujjati, mdx.md).
export function useMDXComponents(): MDXComponents {
  return qollanmaMdxKomponentlari;
}
