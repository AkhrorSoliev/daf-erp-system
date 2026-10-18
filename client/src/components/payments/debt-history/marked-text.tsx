import type { ReactNode } from "react";

/**
 * A translated sentence with «**word**» spans: the spans come out bold, so the
 * emphasis stays inside one dictionary entry and each language places it itself.
 */
export function markedText(text: string, className?: string): ReactNode[] {
  return text
    .split("**")
    .map((part, i) =>
      i % 2 === 1 ? (
        <b key={i} className={className}>
          {part}
        </b>
      ) : (
        part
      ),
    );
}
