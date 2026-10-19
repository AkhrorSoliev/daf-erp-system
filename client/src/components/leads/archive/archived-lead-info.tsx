import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { LEAD_STATUS_LABELS } from "@/hooks/use-leads-board";
import { formatPhone } from "@/lib/format-utils";
import { archiveDate } from "./archive-format";
import { deletedByName } from "./archive-table-parts";
import type { ArchivedLeadDetail } from "./archive-types";
import { ownershipLogText } from "./ownership-log-text";
import { useT } from "@/i18n/context";

/** Date only, on the Toshkent clock. */
const dayOf = (iso: string | null) => archiveDate(iso).split(",")[0];

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm">{value || "—"}</span>
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 rounded-md border p-3">
      <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      {children}
    </section>
  );
}

/** The «Ma'lumot» tab: read-only, nothing here edits the lead. */
export function ArchivedLeadInfo({ lead }: { lead: ArchivedLeadDetail }) {
  const t = useT();
  const status = LEAD_STATUS_LABELS[lead.statusEnum];
  const place = lead.section
    ? `${lead.section.column?.name ?? "—"} › ${lead.section.name}`
    : null;
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold">
          {lead.firstName} {lead.lastName}
        </h3>
        <Badge variant="secondary">{t(status)}</Badge>
      </div>

      <Row label={t("Telefon")} value={formatPhone(lead.phone)} />
      {lead.extraPhone && (
        <Row label={t("Zaxira raqam")} value={formatPhone(lead.extraPhone)} />
      )}
      <Row label={t("Manba")} value={lead.source?.name} />
      <Row label={t("Eski joyi")} value={place} />
      <Row label={t("Qo'shilgan sana")} value={dayOf(lead.createdAt)} />

      <Block title={t("Aloqa")}>
        {lead.calledAt ? (
          <p className="text-sm">
            {t("Telefon qilingan")} · {archiveDate(lead.calledAt)} ·{" "}
            {lead.calledBy ? deletedByName(lead.calledBy) : t("noma'lum xodim")}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">{t("Telefon qilinmagan")}</p>
        )}
      </Block>

      <Block title={t("Mas'ul")}>
        {lead.owner ? (
          <p className="text-sm">
            {deletedByName(lead.owner)}
            {lead.ownedAt &&
              ` · ${t("{date} dan", { date: archiveDate(lead.ownedAt) })}`}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">{t("Umumiy havza")}</p>
        )}
      </Block>

      <Block title={t("Egalik tarixi")}>
        {lead.ownershipLog.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("Egalik yozuvlari yo'q")}</p>
        ) : (
          <ul className="space-y-1.5">
            {lead.ownershipLog.map((e) => (
              <li key={e.id} className="text-sm">
                <span className="block text-xs text-muted-foreground">
                  {archiveDate(e.createdAt)}
                </span>
                {ownershipLogText(e, t)}
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block title={t("Arxivga olingan")}>
        <p className="text-sm">
          {archiveDate(lead.deletedAt)} · {deletedByName(lead.deletedBy)}
        </p>
        {lead.lostReason && (
          <Row label={t("Yo'qotilish sababi")} value={lead.lostReason} />
        )}
        {lead.statusChangeReason && (
          <Row label={t("Holat o'zgargan sabab")} value={lead.statusChangeReason} />
        )}
        {lead.notes.length > 0 && (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {lead.notes.map((n) => (
              <li key={n}>{t("Tiklansa: {note}", { note: n })}</li>
            ))}
          </ul>
        )}
      </Block>
    </div>
  );
}
