import { bubblesCss, chromeJs, phoneCss, REGIONS, skinsCss, splice, themeDefaults, wideGamutCss } from "./emit.ts";
import { skin, SKINS, THEME_DEFAULT } from "./index.ts";

/** src/styles.css and electron/skin-overlay.cjs with their generated regions rewritten from the token source. */
export function generateDesktop(files: { styles: string; overlay: string }): { styles: string; overlay: string } {
  const fallback = skin(THEME_DEFAULT);
  let styles = splice(files.styles, REGIONS.theme, themeDefaults(fallback));
  styles = splice(styles, REGIONS.skins, skinsCss(SKINS, fallback));
  styles = splice(styles, REGIONS.bubbles, bubblesCss(SKINS));
  styles = splice(styles, REGIONS.wideGamut, wideGamutCss(SKINS));
  styles = splice(styles, REGIONS.phone, phoneCss(SKINS));
  const overlay = splice(files.overlay, REGIONS.chrome, chromeJs(SKINS));
  return { styles, overlay };
}
