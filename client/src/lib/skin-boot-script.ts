import { DEFAULT_SKIN, UI_SKIN_IDS } from "@/lib/ui-skins";

/**
 * Inline script for `<head>`: sets `data-skin` from the signed-in user's own
 * `user` cookie before the first paint, so a skin never flashes in after the
 * default. Nobody signed in → nothing, so the sign-in pages stay Daftar. "Signed
 * in" means a `token` or `refreshToken` cookie as well as `user`: that is what
 * `hydrate()` and the middleware need, and `patchUser` gives `user` a fresh
 * expiry, so it can outlive the refresh token.
 * The skin ids are the registry's, so this cannot drift from `ui-skins.ts`.
 * Any failure (a damaged cookie) is swallowed: the page just stays Daftar.
 */
export const SKIN_BOOT_SCRIPT = `(function(){try{if(!/(?:^|; )(?:token|refreshToken)=/.test(document.cookie))return;var m=document.cookie.match(/(?:^|; )user=([^;]*)/);if(!m)return;var s=JSON.parse(decodeURIComponent(m[1])).uiSkin;if(${JSON.stringify(
  UI_SKIN_IDS.filter((id) => id !== DEFAULT_SKIN),
)}.indexOf(s)>-1)document.documentElement.setAttribute("data-skin",s)}catch(e){}})();`;
