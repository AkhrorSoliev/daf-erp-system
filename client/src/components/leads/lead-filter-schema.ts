/**
 * URL-persisted filter schema for the leads page, shared by the filter bar, the
 * filtered list, and the board client (which decides board-vs-list from it).
 */
export const LEAD_FILTER_SCHEMA = {
  search: { type: "string" as const, defaultValue: "" },
  // Unified "Holati" filter merging funnel stage + contact + comment presence.
  // Several tokens at once (see LEAD_HOLATI_OPTIONS); empty = no filter.
  holati: { type: "array" as const, defaultValue: [] as string[] },
  sourceId: { type: "array" as const, defaultValue: [] as string[] },
  columnId: { type: "array" as const, defaultValue: [] as string[] },
  startDate: { type: "string" as const, defaultValue: "" },
  endDate: { type: "string" as const, defaultValue: "" },
  page: { type: "number" as const, defaultValue: 1 },
  pageSize: { type: "number" as const, defaultValue: 10 },
};

export interface LeadFilterValues {
  search: string;
  holati: string[];
  sourceId: string[];
  columnId: string[];
  startDate: string;
  endDate: string;
  page: number;
  pageSize: number;
}

/**
 * Options for the unified "Holati" dropdown. Each maps its URL token to exactly
 * one backend query param so the single control drives stage / contact / comment
 * filtering. Grouped in the dropdown by `group`. Shared by the filter bar (labels)
 * and the list (param translation) so the two never drift.
 *
 * Ko'p tanlovda ma'no: BITTA guruh ichida YOKI, guruhlar orasida VA. Ya'ni
 * «Yangi» + «Aloqaga chiqilmagan» = hali qo'ng'iroq qilinmagan yangi lidlar.
 */
export interface LeadHolatiOption {
  value: string;
  label: string;
  group: string;
  param: { key: "status" | "called" | "hasComments"; value: string };
}

export const LEAD_HOLATI_GROUPS = ["Bosqich", "Aloqa", "Izoh"] as const;

export const LEAD_HOLATI_OPTIONS: LeadHolatiOption[] = [
  {
    value: "NEW",
    label: "Yangi",
    group: "Bosqich",
    param: { key: "status", value: "NEW" },
  },
  {
    value: "CONVERTED",
    label: "O'quvchiga aylangan",
    group: "Bosqich",
    param: { key: "status", value: "CONVERTED" },
  },
  {
    value: "called",
    label: "Aloqaga chiqilgan",
    group: "Aloqa",
    param: { key: "called", value: "true" },
  },
  {
    value: "uncalled",
    label: "Aloqaga chiqilmagan",
    group: "Aloqa",
    param: { key: "called", value: "false" },
  },
  {
    value: "commented",
    label: "Izoh yozilgan",
    group: "Izoh",
    param: { key: "hasComments", value: "true" },
  },
  {
    value: "uncommented",
    label: "Izohsiz",
    group: "Izoh",
    param: { key: "hasComments", value: "false" },
  },
];

/** True when at least one real filter (not just paging) is set. */
export function leadFiltersActive(f: LeadFilterValues): boolean {
  return (
    f.search !== "" ||
    f.holati.length > 0 ||
    f.sourceId.length > 0 ||
    f.columnId.length > 0 ||
    f.startDate !== "" ||
    f.endDate !== ""
  );
}

/**
 * Ikki qiymatli, bir-birini TO'LIQ to'ldiruvchi o'lchamlar: ikkovi tanlansa
 * hech bir lid chetda qolmaydi, shuning uchun parametr yuborilmaydi.
 *
 * `status` ataylab bu ro'yxatda YO'Q. Dropdown faqat ikkita bosqichni
 * (`NEW`, `CONVERTED`) taklif qiladi, `LeadStatus` da esa oltita qiymat bor —
 * ikkovini tanlash «hamma lid» degani emas, u `TRIAL`, `LOST` va `ARCHIVED`
 * ni chetlab o'tadi. Uni ham "to'liq" deb hisoblash yo'qotilgan lidlarni
 * jimgina ro'yxatga qaytargan bo'lardi.
 */
const EXHAUSTIVE_PARAM_KEYS = new Set(["called", "hasComments"]);

/**
 * Tanlangan tokenlarni backend parametrlariga aylantiradi.
 *
 * Bitta guruh ichidagi tanlovlar bitta parametrga vergul bilan qo'shiladi
 * (YOKI), turli guruhlar alohida parametr bo'ladi va server ularni AND qiladi.
 */
export function leadHolatiParams(
  selected: readonly string[],
): Partial<Record<"status" | "called" | "hasComments", string>> {
  const byKey = new Map<string, string[]>();
  for (const token of selected) {
    const opt = LEAD_HOLATI_OPTIONS.find((o) => o.value === token);
    if (!opt) continue;
    const values = byKey.get(opt.param.key) ?? [];
    values.push(opt.param.value);
    byKey.set(opt.param.key, values);
  }

  const params: Partial<Record<"status" | "called" | "hasComments", string>> =
    {};
  for (const [key, values] of byKey) {
    if (EXHAUSTIVE_PARAM_KEYS.has(key)) {
      const total = LEAD_HOLATI_OPTIONS.filter(
        (o) => o.param.key === key,
      ).length;
      if (values.length >= total) continue; // o'lcham to'liq — filtrsizlik
    }
    params[key as "status" | "called" | "hasComments"] = values.join(",");
  }
  return params;
}
