// The single place the company identifies itself to the outside world: the
// login footers and the public privacy policy both read from here, so the legal
// name is stated once rather than retyped per page.
//
// `legalName` is what belongs on anything with legal weight (copyright line,
// privacy policy). `tradingName` is the brand students actually recognise and
// is what the UI uses everywhere else.
export const COMPANY = {
  legalName: "«DAF SPRACHZENTRUM» MChJ",
  tradingName: "DaF Sprachzentrum",

  phone: "+998 90 535 10 99",
  phoneHref: "tel:+998905351099",
  website: "dafzentrum.uz",
  websiteHref: "https://dafzentrum.uz",
  telegram: "@dafferganaadmin",
  telegramHref: "https://t.me/dafferganaadmin",
  /** Technical support — the "Yordam" link in the login footer. */
  supportHref: "https://t.me/akhror_soliev",

  // TODO(company): fill from the state registry entry, then delete this note.
  // Both are rendered only when set, so the pages stay correct while they are
  // null — the privacy policy simply omits the row rather than printing a
  // placeholder that reads like a real value.
  /** Registered legal address. */
  address: null as string | null,
  /** Tax identification number (STIR / INN). */
  taxId: null as string | null,
} as const;

/**
 * Where the student app's store badges point.
 *
 * TODO(stores): neither listing is published yet — the Android build exists but
 * has not been released, and nothing has been submitted to App Store Connect
 * (`student-app/eas.json` has an empty `submit.production`). Until then these
 * point at the stores' own front pages. Swap in the real listing URLs here and
 * nothing else has to change.
 */
export const STORES = {
  googlePlay: {
    href: "https://play.google.com/store",
    label: "Google Play'dan yuklab olish",
    /**
     * Google ships the badge on a 646×250 canvas whose outer 32.8% is the clear
     * space its brand guidelines require, so the artwork inside is only 67.2%
     * of the file's height. Rendering the file at `visible ÷ 0.672` is what
     * makes the drawn badge match the App Store badge, which has no padding.
     */
    src: "/badges/google-play.png",
    canvas: { width: 646, height: 250 },
    visibleHeightRatio: 0.672,
  },
  appStore: {
    href: "https://www.apple.com/app-store/",
    label: "App Store'dan yuklab olish",
    src: "/badges/app-store.svg",
    canvas: { width: 119.66407, height: 40 },
    visibleHeightRatio: 1,
  },
} as const;

/**
 * Height in px of the drawn badge — both stores' artwork is matched to this.
 * Kept small on purpose: the badges sit on the login footer's single text row,
 * and anything taller starts driving that row's height. Still well above both
 * stores' minimum sizes (Apple 40pt wide, Google 60px wide) at this height.
 */
export const BADGE_HEIGHT = 26;

/** The copyright line shown in every login footer. */
export function copyrightLine(year: number): string {
  return `© ${year} ${COMPANY.legalName}. Barcha huquqlar himoyalangan.`;
}
