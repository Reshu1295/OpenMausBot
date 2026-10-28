import { GEIST } from "../fonts.ts";
import type { SkinSource } from "../skin.ts";

/**
 * Midnight's twin. Midnight was pixel-sampled from the upstream app's dark theme; this is the same sampling of its
 * light one, so the two are the only skins here that copy a palette rather than compose one. Its structural quirk is
 * the user's own bubble: near-black on a near-white page, the one place a light skin carries inverted ink. That is
 * what --color-bubble-user-ink exists for — see the rule at the bottom of the file. Everything else is a short
 * ladder of greys: page #fcfcfc, sidebar #f5f5f5, selected row #e4e4e4, and white for the composer and menus.
 */
export default {
  id: "daylight",
  label: "Daylight",
  mode: "light",
  colors: {
    // the thread
    app: "#fcfcfc",
    // sidebar, one step down from the thread
    panel: "#f5f5f5",
    raised: "#e4e4e4",
    "raised-hover": "#d8d8d8",
    // The composer is the page with a ring around it, not a grey slab — the one surface where this skin departs from
    // `raised`.
    composer: "#ffffff",
    "composer-ring": "#ebebeb",
    // what a bot says
    card: "#f0f0f0",
    // menus sit a step above the page, not on the bubble
    menu: "#ffffff",
    "menu-hover": "#1c1c1c0f",
    "menu-active": "#1c1c1c14",
    // the search field
    inset: "#ebebeb",
    // a chip on a card
    control: "#e3e3e3",
    // Sampled at #efefef, which is what the eye reads on the divider — but a hairline that faint fails this repo's own
    // gate (1.5:1 against the page) and every border is drawn at /40 on top of that. #d0d0d0 is the lightest grey that
    // still passes; see scripts/check-skin-contrast.mjs.
    hairline: "#d0d0d0",
    ink: "#1c1c1c",
    "ink-secondary": "#555555",
    "ink-tertiary": "#5c5c5c",
    // The upstream blue is #1084fe, which carries white at 3.1:1 — fine for the unread dot it is mostly used for, not
    // for a filled button's label. The fill is darkened until white clears AA; the dot keeps reading as blue.
    accent: "#0b62c4",
    "accent-border": "#1084fe",
    "accent-text": "#0b5cb8",
    focus: "#0b62c4",
    "accent-ink": "#ffffff",
    // your own messages, inverted
    "bubble-user": "#070707",
    "bubble-user-ink": "#fcfcfc",
    success: "#1f7a4d",
    "success-ink": "#ffffff",
    danger: "#c02b3a",
    "danger-ink": "#ffffff",
    warning: "#8a5a00",
    scrollbar: "#c4c4c4",
    "maus-line": "#5f5f5f",
  },
  font: GEIST,
  radius: { lg: "8px", xl: "14px" },
  identity: {
    green: "#00864c",
    blue: "#2271e3",
    red: "#d63a42",
    orange: "#b35e15",
    purple: "#8057C8",
    cyan: "#0b7f99",
    pink: "#d2357a",
    yellow: "#91701b",
    teal: "#018375",
    coral: "#d83920",
    silver: "#6e7580",
    chrome: "#697688",
  },
  shadowFloat: "0 4px 12px -1px rgb(28 28 28 / 0.08), 0 2px 4px -2px rgb(28 28 28 / 0.06)",
  captionSymbol: "#575757",
  wideGamut: {
    pinned: {
      "accent-border": "color(display-p3 0.2062 0.5041 0.9917)",
    },
  },
  invertedBubble: {
    ink: "#fcfcfc",
    "ink-secondary": "#c4c4c4",
    "ink-tertiary": "#aaaaaa",
    panel: "#111111",
    inset: "#191919",
    raised: "#2f2f2f",
    "raised-hover": "#3d3d3d",
    control: "#2f2f2f",
    hairline: "#666666",
    accent: "#7fc0ff",
    "accent-text": "#7fc0ff",
    "accent-ink": "#070707",
    focus: "#7fc0ff",
    danger: "#ff7788",
    "danger-ink": "#070707",
    success: "#63b58a",
    "success-ink": "#070707",
  },
  phones: true,
} satisfies SkinSource;
