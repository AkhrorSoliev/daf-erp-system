import type { PublicFrage } from "../types";
import { DeWort } from "./de-wort";

type Lesetext = NonNullable<PublicFrage["lesetext"]>;

/**
 * `LESEN_WAHL` savolining o'qiladigan matni: chat, xat/e'lon yoki jadval.
 * Matn savol bilan birga ko'rinib turadi (o'qish mashqi); tarjimasi esa
 * faqat javobdan keyin `TranskriptBlok`da chiqadi.
 */
export function LeseBlok({ text }: { text: Lesetext }) {
  return (
    <div className="space-y-2 rounded-2xl border border-line bg-surface p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
        {text.titel}
      </p>
      {text.sahnaUz ? (
        <p className="text-sm italic text-ink-500">{text.sahnaUz}</p>
      ) : null}
      {text.art === "TABELLE" ? (
        <Jadval zeilen={text.zeilen} />
      ) : text.art === "CHAT" ? (
        <Chat zeilen={text.zeilen} />
      ) : (
        <div className="space-y-1.5">
          {text.zeilen.map((z, i) => (
            <p key={i} className="text-base leading-relaxed text-ink-900">
              <DeWort text={z.de} />
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function Chat({ zeilen }: { zeilen: Lesetext["zeilen"] }) {
  const sprecher = [...new Set(zeilen.map((z) => z.sprecher))];
  return (
    <div className="space-y-2">
      {zeilen.map((z, i) => {
        const men = sprecher.indexOf(z.sprecher) % 2 === 1;
        return (
          <div key={i} className={men ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                "max-w-[85%] rounded-2xl px-3 py-2 " +
                (men ? "bg-tint" : "bg-surface border border-line")
              }
            >
              <p className="text-xs font-semibold text-ink-500">{z.sprecher}</p>
              <p className="text-base text-ink-900">
                <DeWort text={z.de} />
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Jadval qatori — ustunlar ` | ` bilan ajratilgan (server shartnomasi). */
function Jadval({ zeilen }: { zeilen: Lesetext["zeilen"] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-base">
        <tbody>
          {zeilen.map((z, i) => (
            <tr key={i} className="border-t border-line first:border-t-0">
              {z.de.split(" | ").map((h, j) => (
                <td
                  key={j}
                  className={
                    "py-1.5 pr-3 " + (j === 0 ? "font-semibold text-ink-900" : "text-ink-700")
                  }
                >
                  {h}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
