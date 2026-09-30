import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";
import type { MDXComponents } from "mdx/types";
import { cn } from "@/lib/utils";
import { mermaidKodi } from "@/qollanma/mermaid-kodi";
import { Diagramma } from "./diagramma";
import { Eslatma } from "./eslatma";
import { Skrinshot } from "./skrinshot";

function Havola({ href = "", className, ...props }: ComponentPropsWithoutRef<"a">) {
  const klass = cn("font-medium text-primary underline underline-offset-4", className);
  if (href.startsWith("/")) return <Link href={href} className={klass} {...props} />;
  return <a href={href} className={klass} target="_blank" rel="noreferrer" {...props} />;
}

/**
 * Qo'llanma MDX elementlari. `@tailwindcss/typography` yo'q — uslub shu yerda,
 * loyihaning shadcn tokenlari bilan.
 */
export const qollanmaMdxKomponentlari: MDXComponents = {
  h2: ({ className, ...p }) => (
    <h2
      className={cn("mt-10 scroll-m-20 border-b pb-2 font-heading text-xl font-semibold first:mt-0", className)}
      {...p}
    />
  ),
  h3: ({ className, ...p }) => (
    <h3 className={cn("mt-8 scroll-m-20 font-heading text-lg font-semibold", className)} {...p} />
  ),
  p: ({ className, ...p }) => <p className={cn("leading-7 [&:not(:first-child)]:mt-4", className)} {...p} />,
  ul: ({ className, ...p }) => <ul className={cn("my-4 ml-6 list-disc [&>li]:mt-2", className)} {...p} />,
  ol: ({ className, ...p }) => <ol className={cn("my-4 ml-6 list-decimal [&>li]:mt-2", className)} {...p} />,
  a: Havola,
  strong: ({ className, ...p }) => <strong className={cn("font-semibold", className)} {...p} />,
  blockquote: ({ className, ...p }) => (
    <blockquote className={cn("mt-6 border-l-2 pl-6 text-muted-foreground", className)} {...p} />
  ),
  hr: () => <hr className="my-8" />,
  table: ({ className, ...p }) => (
    <div className="my-6 w-full overflow-x-auto rounded-lg border">
      <table className={cn("w-full text-sm", className)} {...p} />
    </div>
  ),
  thead: ({ className, ...p }) => <thead className={cn("bg-muted/40", className)} {...p} />,
  tr: ({ className, ...p }) => <tr className={cn("border-b last:border-0", className)} {...p} />,
  th: ({ className, ...p }) => <th className={cn("px-3 py-2 text-left font-medium", className)} {...p} />,
  td: ({ className, ...p }) => <td className={cn("px-3 py-2 align-top", className)} {...p} />,
  code: ({ className, ...p }) => (
    <code className={cn("rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]", className)} {...p} />
  ),
  pre: ({ children, className, ...p }) => {
    const kod = mermaidKodi(children);
    if (kod) return <Diagramma kod={kod} />;
    return (
      <pre
        className={cn(
          "my-4 overflow-x-auto rounded-lg border bg-muted/40 p-4 text-sm [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-[1em]",
          className,
        )}
        {...p}
      >
        {children}
      </pre>
    );
  },
  Eslatma,
  Skrinshot,
};
