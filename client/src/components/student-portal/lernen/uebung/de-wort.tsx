import { cn } from "@/lib/utils";
import { artikelKlasse, artikelTeilen } from "./artikel-farbe";

/**
 * A German word with its article in the article's colour. The article is
 * always written out: the colour only adds to it, so a colour-blind
 * student loses nothing. Text that is not "article + noun" renders as is.
 */
export function DeWort({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const { artikel, rest } = artikelTeilen(text);
  if (!artikel) return <span className={className}>{text}</span>;
  return (
    <span className={className} lang="de">
      <span className={cn("font-bold", artikelKlasse(artikel))}>{artikel}</span>
      {rest ? <> {rest}</> : null}
    </span>
  );
}
