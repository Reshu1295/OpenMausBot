/**
 * Every colour a skin defines, by its name after `--color-`, in the order the generated CSS declares them.
 *
 * - `composer` / `composer-ring`: the composer pill and the ring around it (transparent where a skin draws none).
 * - `menu`: the float surface every popover and menu is painted in; `menu-hover` / `menu-active` are its row fills.
 * - `control`: a control ON a card. Dark skins take their `raised` value; light skins need their own, because there
 *   `raised` and a card can both be white.
 * - `ink-tertiary`: quiet text (timestamps, hints, placeholders), the quietest ink that still clears 4.5:1 on every
 *   text surface, measured by `pnpm check:contrast`.
 * - `focus`: the ring a keyboard user follows.
 * - `accent-ink`, `danger-ink`, `success-ink`: the label a filled accent, danger or success surface carries.
 * - `bubble-user-ink`: the ink inside the user's own bubble, a hex rather than the ink token so it can be measured.
 * - `maus-line`: the mascot's second speed line, set against the ground.
 */
export const COLOR_TOKENS = [
  "app", "panel", "raised", "raised-hover", "composer", "composer-ring", "card", "menu", "menu-hover", "menu-active",
  "inset", "control", "hairline",
  "ink", "ink-secondary", "ink-tertiary",
  "accent", "accent-border", "accent-text", "focus", "accent-ink",
  "bubble-user", "bubble-user-ink",
  "success", "success-ink",
  "danger", "danger-ink",
  "warning",
  "scrollbar", "maus-line",
] as const;
export type ColorToken = (typeof COLOR_TOKENS)[number];
export type Colors = Record<ColorToken, string>;

/** The tokens in `@theme`, so Tailwind emits a utility for each (bg-*, text-*, border-*); the rest are read with var(). */
export const THEME_TOKENS = [
  "app", "panel", "raised", "raised-hover", "composer", "composer-ring", "menu", "menu-hover", "menu-active", "card",
  "inset", "control", "hairline", "ink", "ink-secondary", "ink-tertiary", "accent", "accent-border", "focus",
  "accent-text", "bubble-user", "success", "danger", "warning",
] as const satisfies readonly ColorToken[];
export const ROOT_TOKENS = COLOR_TOKENS.filter((token) => !(THEME_TOKENS as readonly string[]).includes(token));

/** The tokens that get a more chromatic Display P3 twin on a wide-gamut screen, unless a skin lists its own. */
export const WIDE_GAMUT_TOKENS = [
  "accent", "accent-border", "accent-text", "focus", "success", "danger", "warning",
] as const satisfies readonly ColorToken[];
/** How much more chroma the P3 twin carries, lightness and hue held. */
export const WIDE_GAMUT_LIFT = 1.12;

export const RADII = ["xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl", "menu"] as const;
export type Radius = (typeof RADII)[number];

export const IDENTITY_HUES = [
  "green", "blue", "red", "orange", "purple", "cyan", "pink", "yellow", "teal", "coral", "silver", "chrome",
] as const;
export type IdentityHue = (typeof IDENTITY_HUES)[number];

/** One skin, as exact values. The generator writes these into src/styles.css and electron/skin-overlay.cjs. */
export type SkinSource = {
  id: string;
  /** The English name the phone apps show; the desktop reads its own from src/lib/skins.ts. */
  label: string;
  mode: "light" | "dark";
  colors: Colors;
  font: string;
  /** CSS lengths. A skin sets the ones it tunes; the rest come from Tailwind's scale. */
  radius: Partial<Record<Radius, string>>;
  /** A bot's name colour on this skin's ground, per mascot hue: its own hue, moved just far enough to clear AA. */
  identity: Record<IdentityHue, string>;
  /** The lift under the composer and other floating controls; skins without one inherit the flat default. */
  shadowFloat?: string;
  /** The Windows caption buttons' symbol colour. The overlay accepts no alpha, so it is an opaque hex. */
  captionSymbol: string;
  wideGamut: {
    /** Which tokens get a P3 twin; WIDE_GAMUT_TOKENS when absent. */
    tokens?: readonly ColorToken[];
    /** Exact P3 values that win over the derived lift; each must stay within reach of its sRGB hex. */
    pinned?: Partial<Colors>;
  };
  /** Below the phone breakpoint (768px, SIDEBAR_INLINE): tokens that move, and rounder corners. */
  phone?: { colors: Partial<Colors>; radius: Partial<Record<Radius, string>> };
  /** The dark context painted inside an inverted user bubble (ink on a light page): its editor, quotes and chips. */
  invertedBubble?: Partial<Colors>;
  /** Shipped in the phone apps' generated themes. */
  phones: boolean;
};
