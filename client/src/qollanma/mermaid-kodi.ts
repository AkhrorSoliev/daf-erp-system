import { isValidElement, type ReactNode } from "react";

/** MDX ```mermaid blokini `<pre>` ichidan ajratadi; boshqa hollarda null. */
export function mermaidKodi(children: ReactNode): string | null {
  if (!isValidElement<{ className?: string; children?: ReactNode }>(children)) return null;
  const { className, children: ichki } = children.props;
  if (className !== "language-mermaid" || typeof ichki !== "string") return null;
  return ichki.trim();
}
