import { GEIST } from "../fonts.ts";
import type { SkinSource } from "../skin.ts";

/**
 * The upstream palette, pixel-sampled from the real Grok app. Repeated here (rather than relying on the `@theme`
 * defaults) so that a `[data-skin]` subtree can switch *back* to it — the picker needs that. Two upstream contrast
 * gaps are preserved deliberately, because this skin's job is to be the original: white on the accent fill measures
 * 3.65:1 and white on the danger fill 3.32:1, both short of AA for the 13–15px labels they carry. Atelier and
 * Foundry fix this via --color-accent-ink.
 */
export default {
  id: "midnight",
  label: "Midnight",
  mode: "dark",
  colors: {
    app: "#121212",
    panel: "#0e0e0e",
    raised: "#202020",
    "raised-hover": "#2c2c2c",
    composer: "#1f1f1f",
    "composer-ring": "#2a2a2a",
    card: "#1f1f1f",
    menu: "#1f1f1f",
    "menu-hover": "#f5f5f50f",
    "menu-active": "#f5f5f514",
    inset: "#1b1b1b",
    control: "#282828",
    hairline: "#383838",
    ink: "#f5f5f5",
    "ink-secondary": "#f5f5f5a8",
    "ink-tertiary": "#f5f5f591",
    accent: "#1084fe",
    "accent-border": "#459ffe",
    "accent-text": "#7fc0ff",
    focus: "#459ffe",
    "accent-ink": "#ffffff",
    "bubble-user": "#5a5a5a",
    "bubble-user-ink": "#f5f5f5",
    success: "#38d591",
    "success-ink": "#072114",
    danger: "#ff5667",
    "danger-ink": "#ffffff",
    warning: "#ff9800",
    scrollbar: "#3d3d3d",
    "maus-line": "#f5f5f5",
  },
  font: GEIST,
  radius: { lg: "0.5rem", xl: "0.75rem" },
  identity: {
    green: "#009957",
    blue: "#377FE6",
    red: "#D94B52",
    orange: "#E78531",
    purple: "#8d69ce",
    cyan: "#0EA5C6",
    pink: "#D84F8B",
    yellow: "#D8A729",
    teal: "#01A492",
    coral: "#E5634E",
    silver: "#A8ADB4",
    chrome: "#B3BAC4",
  },
  captionSymbol: "#b5b5b5",
  wideGamut: {
    tokens: ["accent", "accent-border", "accent-text", "success", "danger", "warning"],
    pinned: {
      accent: "color(display-p3 0.2062 0.5041 0.9917)",
      "accent-border": "color(display-p3 0.3457 0.6136 0.9909)",
      "accent-text": "color(display-p3 0.5417 0.7465 0.9948)",
    },
  },
  phone: {
    colors: {
      app: "#141414",
      panel: "#1c1c1e",
      raised: "#2c2c2e",
      "raised-hover": "#3a3a3c",
      composer: "#2c2c2e",
      "composer-ring": "#3a3a3c",
      card: "#242426",
      menu: "#2c2c2e",
      inset: "#1c1c1e",
      control: "#2c2c2e",
      hairline: "#3a3a3c",
    },
    radius: {
      lg: "12px",
      xl: "18px",
      "2xl": "22px",
      "3xl": "28px",
      menu: "22px",
    },
  },
  phones: true,
} satisfies SkinSource;
