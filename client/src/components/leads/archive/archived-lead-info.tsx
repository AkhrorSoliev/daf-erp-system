import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { LEAD_STATUS_LABELS } from "@/hooks/use-leads-board";
import { formatPhone } from "@/lib/format-utils";
import { archiveDate } from "./archive-format";
import { deletedByName } from "./archive-table-parts";
import type { ArchivedLeadDetail } from "./archive-types";
import { ownershipLogText } from "./ownership-log-text";

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
  const place = lead.section
    ? `${lead.section.column?.name ?? "—"} › ${lead.section.name}`
    : null;
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold">
          {lead.firstName} {lead.lastName}
        </h3>
        <Badge variant="secondary">{LEAD_STATUS_LABELS[lead.statusEnum]}</Badge>
      </div>

      <Row label="Telefon" value={formatPhone(lead.phone)} />
      {lead.extraPhone && (
        <Row label="Zaxira raqam" value={formatPhone(lead.extraPhone)} />
      )}
      <Row label="Manba" value={lead.source?.name} />
      <Row label="Eski joyi" value={place} />
      <Row label="Qo'shilgan sana" value={dayOf(lead.createdAt)} />

      <Block title="Aloqa">
        {lead.calledAt ? (
          <p className="text-sm">
            Telefon qilingan · {archiveDate(lead.calledAt)} ·{" "}
            {lead.calledBy ? deletedByName(lead.calledBy) : "noma'lum xodim"}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Telefon qilinmagan</p>
        )}
      </Block>

      <Block title="Mas'ul">
        {lead.owner ? (
          <p className="text-sm">
            {deletedByName(lead.owner)}
            {lead.ownedAt && ` · ${archiveDate(lead.ownedAt)} dan`}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Umumiy havza</p>
        )}
      </Block>

      <Block title="Egalik tarixi">
        {lead.ownershipLog.length === 0 ? (
          <p className="text-sm text-muted-foreground">Egalik yozuvlari yo&apos;q</p>
        ) : (
          <ul className="space-y-1.5">
            {lead.ownershipLog.map((e) => (
              <li key={e.id} className="text-sm">
                <span className="block text-xs text-muted-foreground">
                  {archiveDate(e.createdAt)}
                </span>
                {ownershipLogText(e)}
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block title="Arxivga olingan">
        <p className="text-sm">
          {archiveDate(lead.deletedAt)} · {deletedByName(lead.deletedBy)}
        </p>
        {lead.lostReason && (
          <Row label="Yo'qotilish sababi" value={lead.lostReason} />
        )}
        {lead.statusChangeReason && (
          <Row label="Holat o'zgargan sabab" value={lead.statusChangeReason} />
        )}
        {lead.notes.length > 0 && (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {lead.notes.map((n) => (
              <li key={n}>Tiklansa: {n}</li>
            ))}
          </ul>
        )}
      </Block>
    </div>
  );
}
