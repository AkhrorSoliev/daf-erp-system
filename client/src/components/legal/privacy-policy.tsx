import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { COMPANY } from "@/lib/company";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  LAST_UPDATED,
  INTRO,
  SCOPE,
  SECTIONS,
  type Block,
} from "./privacy-content";

// One policy, two skins. `lumio` is passed on the student portal so the page a
// student reaches from their own login matches the app they just came from;
// every other host gets the shadcn look of the admin and teacher portals.
// The words are identical either way — they come from privacy-content.ts.

interface PrivacyPolicyProps {
  lumio: boolean;
}

function Blocks({ blocks, lumio }: { blocks: Block[]; lumio: boolean }) {
  return (
    <>
      {blocks.map((block, i) =>
        block.kind === "p" ? (
          <p
            key={i}
            className={cn(
              "leading-relaxed",
              lumio
                ? "text-[15px] font-semibold text-ink-700"
                : "text-sm text-muted-foreground",
            )}
          >
            {block.text}
          </p>
        ) : (
          <ul
            key={i}
            className={cn(
              "list-disc space-y-1.5 pl-5 leading-relaxed",
              lumio
                ? "text-[15px] font-semibold text-ink-700 marker:text-coral-500"
                : "text-sm text-muted-foreground",
            )}
          >
            {block.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ),
      )}
    </>
  );
}

export function PrivacyPolicy({ lumio }: PrivacyPolicyProps) {
  return (
    <div
      className={cn(
        lumio && "lumio",
        "flex min-h-screen flex-col bg-background text-foreground",
      )}
    >
      <header className="flex items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link
          href="/login"
          className={cn(
            "inline-flex items-center gap-1.5 text-sm transition-colors",
            lumio
              ? "font-bold text-ink-500 hover:text-ink-800"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <ArrowLeft className="size-4" />
          Kirish sahifasiga
        </Link>
        <ThemeToggle />
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 pt-4 sm:px-6">
        <h1
          className={cn(
            "tracking-tight",
            lumio
              ? "font-display text-[30px] font-extrabold text-ink-900"
              : "text-3xl font-bold",
          )}
        >
          Maxfiylik siyosati
        </h1>
        <p
          className={cn(
            "mt-1 text-sm",
            lumio ? "font-semibold text-ink-500" : "text-muted-foreground",
          )}
        >
          Oxirgi yangilanish: {LAST_UPDATED}
        </p>

        <div className="mt-8 space-y-3">
          <Blocks
            lumio={lumio}
            blocks={[
              { kind: "p", text: INTRO },
              { kind: "p", text: SCOPE },
            ]}
          />
        </div>

        <div className="mt-10 space-y-9">
          {SECTIONS.map((section) => (
            <section key={section.id} id={section.id} className="space-y-3">
              <h2
                className={cn(
                  lumio
                    ? "font-display text-xl font-bold text-ink-900"
                    : "text-lg font-semibold",
                )}
              >
                {section.title}
              </h2>
              <Blocks lumio={lumio} blocks={section.blocks} />
            </section>
          ))}

          <section id="aloqa" className="space-y-3">
            <h2
              className={cn(
                lumio
                  ? "font-display text-xl font-bold text-ink-900"
                  : "text-lg font-semibold",
              )}
            >
              12. Aloqa
            </h2>
            <Blocks
              lumio={lumio}
              blocks={[
                {
                  kind: "p",
                  text: `Ushbu siyosat yoki o'z ma'lumotlaringiz yuzasidan savolingiz bo'lsa, ${COMPANY.legalName} bilan bog'laning:`,
                },
              ]}
            />
            <ul
              className={cn(
                "space-y-2",
                lumio
                  ? "text-[15px] font-semibold text-ink-700"
                  : "text-sm text-muted-foreground",
              )}
            >
              <li>
                Telefon:{" "}
                <a
                  href={COMPANY.phoneHref}
                  className={cn(
                    "underline-offset-4 hover:underline",
                    lumio ? "text-coral-600" : "text-foreground",
                  )}
                >
                  {COMPANY.phone}
                </a>
              </li>
              <li>
                Telegram:{" "}
                <a
                  href={COMPANY.telegramHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "underline-offset-4 hover:underline",
                    lumio ? "text-coral-600" : "text-foreground",
                  )}
                >
                  {COMPANY.telegram}
                </a>
              </li>
              <li>
                Veb-sayt:{" "}
                <a
                  href={COMPANY.websiteHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "underline-offset-4 hover:underline",
                    lumio ? "text-coral-600" : "text-foreground",
                  )}
                >
                  {COMPANY.website}
                </a>
              </li>
              {COMPANY.address ? <li>Manzil: {COMPANY.address}</li> : null}
              {COMPANY.taxId ? <li>STIR: {COMPANY.taxId}</li> : null}
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}
