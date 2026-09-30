"use client";

import { useEffect, useId, useState } from "react";
import { useTheme } from "next-themes";
import { Skeleton } from "@/components/ui/skeleton";

interface Natija {
  kalit: string;
  svg: string | null;
}

/** ```mermaid bloki. mermaid faqat shu komponent ochilganda yuklanadi. */
export function Diagramma({ kod }: { kod: string }) {
  const id = `qollanma-diagramma-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;
  const { resolvedTheme } = useTheme();
  const kalit = `${resolvedTheme ?? "light"}\n${kod}`;
  const [natija, setNatija] = useState<Natija | null>(null);

  useEffect(() => {
    let bekor = false;
    import("mermaid")
      .then(async ({ default: mermaid }) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: resolvedTheme === "dark" ? "dark" : "default",
          fontFamily: "inherit",
        });
        const { svg } = await mermaid.render(id, kod);
        if (!bekor) setNatija({ kalit, svg });
      })
      .catch(() => {
        if (!bekor) setNatija({ kalit, svg: null });
      });
    return () => {
      bekor = true;
    };
  }, [id, kalit, kod, resolvedTheme]);

  const joriy = natija?.kalit === kalit ? natija : null;
  if (!joriy) return <Skeleton className="my-6 h-48 w-full" />;
  if (joriy.svg === null) {
    return <pre className="my-6 overflow-x-auto rounded-lg border bg-muted/40 p-4 text-sm">{kod}</pre>;
  }
  return (
    <div
      className="my-6 flex justify-center overflow-x-auto rounded-lg border bg-background p-4"
      // mermaid securityLevel "strict" chiqishni tozalaydi; matn — o'zimizniki.
      dangerouslySetInnerHTML={{ __html: joriy.svg }}
    />
  );
}
