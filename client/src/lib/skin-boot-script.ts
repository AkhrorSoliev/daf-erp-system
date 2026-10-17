import { DEFAULT_SKIN, UI_SKIN_IDS } from "@/lib/ui-skins";

/**
 * Inline script for `<head>`: sets `data-skin` from the signed-in user's own
 * `user` cookie before the first paint, so a skin never flashes in after the
 * default. No `user` cookie (a sign-in page) → nothing, so those stay Daftar.
 * The skin ids are the registry's, so this cannot drift from `ui-skins.ts`.
 * Any failure (a damaged cookie) is swallowed: the page just stays Daftar.
 */
export const SKIN_BOOT_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )user=([^;]*)/);if(!m)return;var s=JSON.parse(decodeURIComponent(m[1])).uiSkin;if(${JSON.stringify(
  UI_SKIN_IDS.filter((id) => id !== DEFAULT_SKIN),
)}.indexOf(s)>-1)document.documentElement.setAttribute("data-skin",s)}catch(e){}})();`;
